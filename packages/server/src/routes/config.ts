import { Router } from 'express';
import type { ServerConfig } from '../config.js';
import { updateConfig, getConfig } from '../config.js';
import { validateBody, configPatchSchema } from '../validation/schemas.js';
import type { AppContext } from './context.js';
import { BudgetEnforcer } from '../coordination/BudgetEnforcer.js';
import { CostTracker } from '../agents/CostTracker.js';

export function configRoutes(ctx: AppContext): Router {
  const { agentManager, db: _db } = ctx;
  const costTracker = new CostTracker(_db);
  const budgetEnforcer = new BudgetEnforcer(_db, costTracker);
  const router = Router();

  // --- Config ---
  router.get('/config', (_req, res) => {
    res.json(getConfig());
  });

  router.patch('/config', validateBody(configPatchSchema), (req, res) => {
    const sanitized: Partial<ServerConfig> = {};
    if (req.body.maxConcurrentAgents !== undefined) {
      sanitized.maxConcurrentAgents = req.body.maxConcurrentAgents;
    }
    if (req.body.host !== undefined) {
      sanitized.host = req.body.host;
    }
    const updated = updateConfig(sanitized);
    agentManager.setMaxConcurrent(updated.maxConcurrentAgents);
    // Persist maxConcurrentAgents to SQLite so it survives server restart
    if (sanitized.maxConcurrentAgents !== undefined) {
      _db.setSetting('maxConcurrentAgents', String(updated.maxConcurrentAgents));
    }
    res.json(updated);
  });

  // --- System pause/resume ---
  router.post('/system/pause', (_req, res) => {
    agentManager.pauseSystem();
    res.json({ paused: true });
  });

  router.post('/system/resume', (_req, res) => {
    agentManager.resumeSystem();
    res.json({ paused: false });
  });

  router.get('/system/status', (_req, res) => {
    res.json({ paused: agentManager.isSystemPaused });
  });

  // --- Budget ---
  router.get('/budget', (_req, res) => {
    res.json(budgetEnforcer.getStatus());
  });

  router.post('/budget', (req, res) => {
    const { limit, thresholds } = req.body;
    if (limit !== undefined && limit !== null && (typeof limit !== 'number' || limit < 0)) {
      return res.status(400).json({ error: 'limit must be a positive number or null' });
    }
    budgetEnforcer.setConfig({ limit, thresholds });
    res.json({ updated: true, ...budgetEnforcer.getStatus() });
  });

  router.post('/budget/check', (_req, res) => {
    const result = budgetEnforcer.check();
    if (result.level === 'pause') {
      agentManager.pauseSystem();
    }
    res.json({ ...result, ...budgetEnforcer.getStatus() });
  });

  return router;
}
