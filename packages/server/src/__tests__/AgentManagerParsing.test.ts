import { describe, it, expect } from 'vitest';

// These regex patterns are copied from AgentManager.ts (module-level constants, not exported)
const SPAWN_REQUEST_REGEX = /<!--\s*SPAWN_AGENT\s*(\{.*?\})\s*-->/s;
const LOCK_REQUEST_REGEX = /<!--\s*LOCK_REQUEST\s*(\{.*?\})\s*-->/s;
const LOCK_RELEASE_REGEX = /<!--\s*LOCK_RELEASE\s*(\{.*?\})\s*-->/s;
const ACTIVITY_REGEX = /<!--\s*ACTIVITY\s*(\{.*?\})\s*-->/s;

describe('AgentManager output parsing regexes', () => {
  describe('SPAWN_REQUEST_REGEX', () => {
    it('matches a valid SPAWN_AGENT comment and extracts JSON', () => {
      const input = '<!-- SPAWN_AGENT {"roleId": "reviewer"} -->';
      const match = input.match(SPAWN_REQUEST_REGEX);
      expect(match).not.toBeNull();
      expect(JSON.parse(match![1])).toEqual({ roleId: 'reviewer' });
    });

    it('matches with extra whitespace', () => {
      const input = '<!--   SPAWN_AGENT   {"roleId": "reviewer"}   -->';
      const match = input.match(SPAWN_REQUEST_REGEX);
      expect(match).not.toBeNull();
      expect(JSON.parse(match![1])).toEqual({ roleId: 'reviewer' });
    });

    it('does NOT match plain text without the comment pattern', () => {
      const input = 'SPAWN_AGENT {"roleId": "reviewer"}';
      const match = input.match(SPAWN_REQUEST_REGEX);
      expect(match).toBeNull();
    });

    it('extracts roleId and taskId fields correctly', () => {
      const input = '<!-- SPAWN_AGENT {"roleId": "developer", "taskId": "implement-auth"} -->';
      const match = input.match(SPAWN_REQUEST_REGEX);
      expect(match).not.toBeNull();
      const parsed = JSON.parse(match![1]);
      expect(parsed.roleId).toBe('developer');
      expect(parsed.taskId).toBe('implement-auth');
    });
  });

  describe('LOCK_REQUEST_REGEX', () => {
    it('matches a valid LOCK_REQUEST comment and extracts JSON', () => {
      const input = '<!-- LOCK_REQUEST {"filePath": "src/auth.ts", "reason": "editing"} -->';
      const match = input.match(LOCK_REQUEST_REGEX);
      expect(match).not.toBeNull();
      expect(JSON.parse(match![1])).toEqual({ filePath: 'src/auth.ts', reason: 'editing' });
    });

    it('extracts filePath and reason correctly', () => {
      const input = '<!-- LOCK_REQUEST {"filePath": "src/components/Button.tsx", "reason": "refactoring component"} -->';
      const match = input.match(LOCK_REQUEST_REGEX);
      expect(match).not.toBeNull();
      const parsed = JSON.parse(match![1]);
      expect(parsed.filePath).toBe('src/components/Button.tsx');
      expect(parsed.reason).toBe('refactoring component');
    });
  });

  describe('LOCK_RELEASE_REGEX', () => {
    it('matches a valid LOCK_RELEASE comment and extracts JSON', () => {
      const input = '<!-- LOCK_RELEASE {"filePath": "src/auth.ts"} -->';
      const match = input.match(LOCK_RELEASE_REGEX);
      expect(match).not.toBeNull();
      expect(JSON.parse(match![1])).toEqual({ filePath: 'src/auth.ts' });
    });

    it('extracts filePath correctly', () => {
      const input = '<!-- LOCK_RELEASE {"filePath": "src/utils/helpers.ts"} -->';
      const match = input.match(LOCK_RELEASE_REGEX);
      expect(match).not.toBeNull();
      expect(JSON.parse(match![1]).filePath).toBe('src/utils/helpers.ts');
    });
  });

  describe('ACTIVITY_REGEX', () => {
    it('matches a valid ACTIVITY comment and extracts JSON', () => {
      const input = '<!-- ACTIVITY {"actionType": "decision_made", "summary": "chose JWT"} -->';
      const match = input.match(ACTIVITY_REGEX);
      expect(match).not.toBeNull();
      expect(JSON.parse(match![1])).toEqual({ actionType: 'decision_made', summary: 'chose JWT' });
    });

    it('extracts actionType, summary, and optional details', () => {
      const input = '<!-- ACTIVITY {"actionType": "file_edited", "summary": "updated config", "details": {"file": "config.json"}} -->';
      const match = input.match(ACTIVITY_REGEX);
      expect(match).not.toBeNull();
      const parsed = JSON.parse(match![1]);
      expect(parsed.actionType).toBe('file_edited');
      expect(parsed.summary).toBe('updated config');
      expect(parsed.details).toEqual({ file: 'config.json' });
    });
  });

  describe('Edge cases', () => {
    it('does not match partial patterns missing closing -->', () => {
      expect('<!-- SPAWN_AGENT {"roleId": "reviewer"}'.match(SPAWN_REQUEST_REGEX)).toBeNull();
      expect('<!-- LOCK_REQUEST {"filePath": "a.ts"}'.match(LOCK_REQUEST_REGEX)).toBeNull();
      expect('<!-- LOCK_RELEASE {"filePath": "a.ts"}'.match(LOCK_RELEASE_REGEX)).toBeNull();
      expect('<!-- ACTIVITY {"actionType": "test"}'.match(ACTIVITY_REGEX)).toBeNull();
    });

    it('does not match when pattern lacks comment markers', () => {
      expect('SPAWN_AGENT {"roleId": "reviewer"} -->'.match(SPAWN_REQUEST_REGEX)).toBeNull();
      expect('LOCK_REQUEST {"filePath": "a.ts"} -->'.match(LOCK_REQUEST_REGEX)).toBeNull();
      expect('LOCK_RELEASE {"filePath": "a.ts"} -->'.match(LOCK_RELEASE_REGEX)).toBeNull();
      expect('ACTIVITY {"actionType": "test"} -->'.match(ACTIVITY_REGEX)).toBeNull();
    });

    it('each regex only matches its own type', () => {
      const spawn = '<!-- SPAWN_AGENT {"roleId": "reviewer"} -->';
      const lock = '<!-- LOCK_REQUEST {"filePath": "a.ts"} -->';
      const release = '<!-- LOCK_RELEASE {"filePath": "a.ts"} -->';
      const activity = '<!-- ACTIVITY {"actionType": "test"} -->';

      // SPAWN_REQUEST_REGEX should only match spawn
      expect(spawn.match(SPAWN_REQUEST_REGEX)).not.toBeNull();
      expect(lock.match(SPAWN_REQUEST_REGEX)).toBeNull();
      expect(release.match(SPAWN_REQUEST_REGEX)).toBeNull();
      expect(activity.match(SPAWN_REQUEST_REGEX)).toBeNull();

      // LOCK_REQUEST_REGEX should only match lock
      expect(lock.match(LOCK_REQUEST_REGEX)).not.toBeNull();
      expect(spawn.match(LOCK_REQUEST_REGEX)).toBeNull();
      expect(release.match(LOCK_REQUEST_REGEX)).toBeNull();
      expect(activity.match(LOCK_REQUEST_REGEX)).toBeNull();

      // LOCK_RELEASE_REGEX should only match release
      expect(release.match(LOCK_RELEASE_REGEX)).not.toBeNull();
      expect(spawn.match(LOCK_RELEASE_REGEX)).toBeNull();
      expect(lock.match(LOCK_RELEASE_REGEX)).toBeNull();
      expect(activity.match(LOCK_RELEASE_REGEX)).toBeNull();

      // ACTIVITY_REGEX should only match activity
      expect(activity.match(ACTIVITY_REGEX)).not.toBeNull();
      expect(spawn.match(ACTIVITY_REGEX)).toBeNull();
      expect(lock.match(ACTIVITY_REGEX)).toBeNull();
      expect(release.match(ACTIVITY_REGEX)).toBeNull();
    });
  });
});
