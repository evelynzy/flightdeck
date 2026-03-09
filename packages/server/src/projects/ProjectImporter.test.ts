import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectImporter } from './ProjectImporter.js';
import type { ProjectImporterDeps, ProjectImportOptions } from './ProjectImporter.js';

// ── fs mock ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  realpathSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockReaddirSync = readdirSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;
const mockRealpathSync = realpathSync as ReturnType<typeof vi.fn>;

// ── Dependency mocks ─────────────────────────────────────────────────

function createMockKnowledge() {
  const entries = new Map<string, { projectId: string; category: string; key: string; content: string; metadata?: unknown }>();
  return {
    put: vi.fn((projectId: string, category: string, key: string, content: string, metadata?: unknown) => {
      const id = `${projectId}:${category}:${key}`;
      entries.set(id, { projectId, category, key, content, metadata });
      return { id: 1, projectId, category, key, content, metadata, createdAt: '', updatedAt: '' };
    }),
    _entries: entries,
  };
}

function createMockMemory() {
  const entries: Array<{ category: string; key: string; value: string; source: string; projectId: string }> = [];
  return {
    remember: vi.fn((category: string, key: string, value: string, source: string, projectId: string) => {
      entries.push({ category, key, value, source, projectId });
      return { id: 1, category, key, value, source, projectId, createdAt: '', lastUsedAt: '', useCount: 1 };
    }),
    _entries: entries,
  };
}

function createMockRegistry() {
  const sessions: Array<{ projectId: string; leadId: string; task?: string; role?: string }> = [];
  return {
    startSession: vi.fn((projectId: string, leadId: string, task?: string, role?: string) => {
      sessions.push({ projectId, leadId, task, role });
    }),
    getSessions: vi.fn((_projectId: string) => {
      return sessions.map((s, i) => ({
        id: i + 1,
        projectId: s.projectId,
        leadId: s.leadId,
        task: s.task ?? null,
        role: s.role ?? 'lead',
        status: 'completed',
        startedAt: new Date().toISOString(),
        endedAt: null,
        sessionId: null,
      }));
    }),
    _sessions: sessions,
  };
}

function createDeps() {
  const knowledge = createMockKnowledge();
  const memory = createMockMemory();
  const registry = createMockRegistry();
  return {
    knowledgeStore: knowledge,
    collectiveMemory: memory,
    projectRegistry: registry,
    _knowledge: knowledge,
    _memory: memory,
    _registry: registry,
  };
}

// ── Filesystem helpers ───────────────────────────────────────────────

/** Configure the fs mocks to simulate a directory tree */
function setupFs(tree: Record<string, string | string[] | 'dir'>) {
  mockExistsSync.mockImplementation((p: string) => p in tree);
  mockReaddirSync.mockImplementation((p: string) => {
    const val = tree[p];
    if (Array.isArray(val)) return val;
    throw new Error(`ENOENT: no such file or directory '${p}'`);
  });
  mockReadFileSync.mockImplementation((p: string) => {
    const val = tree[p];
    if (typeof val === 'string') return val;
    throw new Error(`ENOENT: no such file or directory '${p}'`);
  });
  mockStatSync.mockImplementation((p: string) => {
    const val = tree[p];
    return {
      isDirectory: () => val === 'dir',
      size: typeof val === 'string' ? val.length : 0,
    };
  });
  // realpathSync: identity function (no symlinks in test)
  mockRealpathSync.mockImplementation((p: string) => {
    if (!(p in tree) && !Object.keys(tree).some(k => k.startsWith(p))) {
      throw new Error(`ENOENT: no such file or directory '${p}'`);
    }
    return p;
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ProjectImporter', () => {
  let deps: ReturnType<typeof createDeps>;
  let importer: ProjectImporter;
  const projectId = 'test-project';
  const sourcePath = '/tmp/.flightdeck';

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    importer = new ProjectImporter(deps as unknown as ProjectImporterDeps);
  });

  // ── Knowledge ──────────────────────────────────────────────────

  describe('importKnowledge', () => {
    it('imports knowledge from JSON files', () => {
      const entries = [
        { key: 'rule-1', content: 'Always use TypeScript' },
        { key: 'rule-2', content: 'Prefer composition', metadata: { confidence: 0.9 } },
      ];
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/knowledge`]: ['core.json'],
        [`${sourcePath}/knowledge/core.json`]: JSON.stringify(entries),
      });

      const report = importer.import({ projectId, sourcePath });

      expect(report.success).toBe(true);
      expect(report.knowledge.imported).toBe(2);
      expect(report.knowledge.errors).toHaveLength(0);
      expect(deps._knowledge.put).toHaveBeenCalledTimes(2);
      expect(deps._knowledge.put).toHaveBeenCalledWith(
        projectId, 'core', 'rule-1', 'Always use TypeScript', undefined,
      );
      expect(deps._knowledge.put).toHaveBeenCalledWith(
        projectId, 'core', 'rule-2', 'Prefer composition', { confidence: 0.9 },
      );
    });

    it('skips unknown knowledge categories with warning', () => {
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/knowledge`]: ['fantasy.json'],
        [`${sourcePath}/knowledge/fantasy.json`]: JSON.stringify([{ key: 'k', content: 'v' }]),
      });

      const report = importer.import({ projectId, sourcePath });
      expect(report.knowledge.imported).toBe(0);
      expect(report.warnings).toContain('Skipping unknown knowledge category: fantasy');
    });
  });

  // ── Memory ─────────────────────────────────────────────────────

  describe('importMemory', () => {
    it('imports collective memory from JSON files', () => {
      const entries = [
        { key: 'always-run-tests', value: 'Run tests before committing', source: 'dev-1' },
        { key: 'use-strict-mode', value: 'Enable strict TS', source: 'architect-1' },
      ];
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/memory`]: ['pattern.json'],
        [`${sourcePath}/memory/pattern.json`]: JSON.stringify(entries),
      });

      const report = importer.import({ projectId, sourcePath });

      expect(report.success).toBe(true);
      expect(report.memory.imported).toBe(2);
      expect(deps._memory.remember).toHaveBeenCalledTimes(2);
      expect(deps._memory.remember).toHaveBeenCalledWith(
        'pattern', 'always-run-tests', 'Run tests before committing', 'dev-1', projectId,
      );
    });

    it('skips unknown memory categories with warning', () => {
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/memory`]: ['alien.json'],
        [`${sourcePath}/memory/alien.json`]: JSON.stringify([{ key: 'k', value: 'v', source: 's' }]),
      });

      const report = importer.import({ projectId, sourcePath });
      expect(report.memory.imported).toBe(0);
      expect(report.warnings).toContain('Skipping unknown memory category: alien');
    });
  });

  // ── Sessions ───────────────────────────────────────────────────

  describe('importSessions', () => {
    it('imports sessions avoiding duplicates', () => {
      const session1 = { leadId: 'lead-abc', task: 'Build auth', role: 'lead' };
      const session2 = { leadId: 'lead-xyz', task: 'Fix bugs', role: 'developer' };
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/sessions`]: ['session-1.json', 'session-2.json'],
        [`${sourcePath}/sessions/session-1.json`]: JSON.stringify(session1),
        [`${sourcePath}/sessions/session-2.json`]: JSON.stringify(session2),
      });

      const report = importer.import({ projectId, sourcePath });

      expect(report.sessions.imported).toBe(2);
      expect(deps._registry.startSession).toHaveBeenCalledTimes(2);
      expect(deps._registry.startSession).toHaveBeenCalledWith(projectId, 'lead-abc', 'Build auth', 'lead');
      expect(deps._registry.startSession).toHaveBeenCalledWith(projectId, 'lead-xyz', 'Fix bugs', 'developer');
    });

    it('skips duplicate sessions (same leadId + task)', () => {
      // Pre-populate an existing session
      deps._registry._sessions.push({ projectId, leadId: 'lead-abc', task: 'Build auth' });

      const session = { leadId: 'lead-abc', task: 'Build auth', role: 'lead' };
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/sessions`]: ['session-1.json'],
        [`${sourcePath}/sessions/session-1.json`]: JSON.stringify(session),
      });

      const report = importer.import({ projectId, sourcePath });

      expect(report.sessions.imported).toBe(0);
      expect(report.sessions.skipped).toBe(1);
      // getSessions is called, but startSession is not
      expect(deps._registry.startSession).not.toHaveBeenCalled();
    });
  });

  // ── Shared Artifacts ───────────────────────────────────────────

  describe('importSharedArtifacts', () => {
    it('imports shared markdown artifacts as episodic knowledge', () => {
      const sharedDir = `${sourcePath}/shared`;
      const subdir = `${sharedDir}/dev-abc12345`;

      mockExistsSync.mockImplementation((p: string) =>
        [sourcePath, sharedDir, subdir].includes(p),
      );
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === sharedDir) return ['dev-abc12345'];
        if (p === subdir) return ['notes.md', 'plan.md'];
        throw new Error(`ENOENT: ${p}`);
      });
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === `${subdir}/notes.md`) return '# Dev Notes\nSome notes here.';
        if (p === `${subdir}/plan.md`) return '# Plan\nStep 1.';
        throw new Error(`ENOENT: ${p}`);
      });
      mockStatSync.mockImplementation((p: string) => ({
        isDirectory: () => p === subdir,
        size: 100,
      }));
      mockRealpathSync.mockImplementation((p: string) => p);

      const report = importer.import({ projectId, sourcePath });

      expect(report.knowledge.imported).toBe(2);
      expect(deps._knowledge.put).toHaveBeenCalledWith(
        projectId, 'episodic', 'artifact:dev:notes', '# Dev Notes\nSome notes here.', { source: 'import', role: 'dev' },
      );
      expect(deps._knowledge.put).toHaveBeenCalledWith(
        projectId, 'episodic', 'artifact:dev:plan', '# Plan\nStep 1.', { source: 'import', role: 'dev' },
      );
    });
  });

  // ── Error handling ─────────────────────────────────────────────

  describe('error handling', () => {
    it('returns error report for missing source path', () => {
      mockExistsSync.mockReturnValue(false);
      mockRealpathSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const report = importer.import({ projectId, sourcePath: '/nonexistent' });

      expect(report.success).toBe(false);
      expect(report.warnings).toContain('Source path is invalid or inaccessible');
      expect(deps._knowledge.put).not.toHaveBeenCalled();
    });

    it('handles malformed JSON gracefully', () => {
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/knowledge`]: ['core.json'],
        [`${sourcePath}/knowledge/core.json`]: '{ this is not json }',
      });

      const report = importer.import({ projectId, sourcePath });

      expect(report.success).toBe(true); // Import still succeeds overall
      expect(report.knowledge.imported).toBe(0);
      expect(report.knowledge.errors.length).toBeGreaterThan(0);
      expect(report.knowledge.errors[0]).toContain('core.json');
    });

    it('handles invalid entries in otherwise valid JSON', () => {
      const entries = [
        { key: 'valid', content: 'ok' },
        { noKey: true }, // invalid
        { key: 'also-valid', content: 'good' },
      ];
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/knowledge`]: ['episodic.json'],
        [`${sourcePath}/knowledge/episodic.json`]: JSON.stringify(entries),
      });

      const report = importer.import({ projectId, sourcePath });

      expect(report.knowledge.imported).toBe(2);
      expect(report.knowledge.skipped).toBe(1);
      expect(report.knowledge.errors).toHaveLength(1);
    });

    it('handles non-array JSON in knowledge files', () => {
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/knowledge`]: ['core.json'],
        [`${sourcePath}/knowledge/core.json`]: JSON.stringify({ key: 'val' }),
      });

      const report = importer.import({ projectId, sourcePath });
      expect(report.knowledge.imported).toBe(0);
      expect(report.knowledge.errors).toContain('core.json: expected JSON array');
    });
  });

  // ── Dry run ────────────────────────────────────────────────────

  describe('dry run', () => {
    it('does not write when dryRun is true', () => {
      const knowledgeEntries = [{ key: 'k1', content: 'c1' }];
      const memoryEntries = [{ key: 'm1', value: 'v1', source: 's1' }];
      const session = { leadId: 'lead-1', task: 'do stuff' };
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/knowledge`]: ['core.json'],
        [`${sourcePath}/knowledge/core.json`]: JSON.stringify(knowledgeEntries),
        [`${sourcePath}/memory`]: ['pattern.json'],
        [`${sourcePath}/memory/pattern.json`]: JSON.stringify(memoryEntries),
        [`${sourcePath}/sessions`]: ['session-1.json'],
        [`${sourcePath}/sessions/session-1.json`]: JSON.stringify(session),
      });

      const report = importer.import({ projectId, sourcePath, dryRun: true });

      expect(report.knowledge.imported).toBe(1);
      expect(report.memory.imported).toBe(1);
      expect(report.sessions.imported).toBe(1);
      // Nothing was actually written
      expect(deps._knowledge.put).not.toHaveBeenCalled();
      expect(deps._memory.remember).not.toHaveBeenCalled();
      expect(deps._registry.startSession).not.toHaveBeenCalled();
    });
  });

  // ── Idempotency ────────────────────────────────────────────────

  describe('idempotency', () => {
    it('second import produces same result via upsert', () => {
      const entries = [{ key: 'rule-1', content: 'Always use TypeScript' }];
      setupFs({
        [sourcePath]: 'dir',
        [`${sourcePath}/knowledge`]: ['core.json'],
        [`${sourcePath}/knowledge/core.json`]: JSON.stringify(entries),
      });

      const report1 = importer.import({ projectId, sourcePath });
      const report2 = importer.import({ projectId, sourcePath });

      expect(report1.knowledge.imported).toBe(1);
      expect(report2.knowledge.imported).toBe(1);
      // put() is called both times — upsert handles dedup
      expect(deps._knowledge.put).toHaveBeenCalledTimes(2);
    });
  });

  // ── Security: file size limit ─────────────────────────────────

  describe('file size limit', () => {
    it('skips files exceeding 512KB', () => {
      const largeContent = 'x'.repeat(600 * 1024); // 600KB
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === `${sourcePath}/knowledge`) return ['core.json'];
        return [];
      });
      mockReadFileSync.mockReturnValue(largeContent);
      mockStatSync.mockImplementation((p: string) => ({
        isDirectory: () => p === sourcePath,
        size: p.endsWith('.json') ? 600 * 1024 : 0,
      }));
      mockRealpathSync.mockImplementation((p: string) => p);

      const report = importer.import({ projectId, sourcePath });

      expect(report.knowledge.imported).toBe(0);
      expect(report.knowledge.skipped).toBe(1);
      expect(report.knowledge.errors[0]).toContain('too large');
    });
  });

  // ── Security: role extraction ─────────────────────────────────

  describe('role extraction from subdir name', () => {
    it('extracts multi-word roles like readability-reviewer correctly', () => {
      const sharedDir = `${sourcePath}/shared`;
      const subdir = `${sharedDir}/readability-reviewer-43f9a8a1`;

      mockExistsSync.mockImplementation((p: string) =>
        [sourcePath, sharedDir, subdir].includes(p),
      );
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === sharedDir) return ['readability-reviewer-43f9a8a1'];
        if (p === subdir) return ['review.md'];
        return [];
      });
      mockReadFileSync.mockReturnValue('# Review notes');
      mockStatSync.mockImplementation((p: string) => ({
        isDirectory: () => p === subdir,
        size: 20,
      }));
      mockRealpathSync.mockImplementation((p: string) => p);

      const report = importer.import({ projectId, sourcePath });

      expect(report.knowledge.imported).toBe(1);
      expect(deps._knowledge.put).toHaveBeenCalledWith(
        projectId, 'episodic', 'artifact:readability-reviewer:review', '# Review notes', { source: 'import', role: 'readability-reviewer' },
      );
    });
  });
});
