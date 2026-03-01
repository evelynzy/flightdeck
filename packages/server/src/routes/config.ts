import { Router } from 'express';
import type { ServerConfig } from '../config.js';
import { updateConfig, getConfig } from '../config.js';
import { validateBody, configPatchSchema } from '../validation/schemas.js';
import type { AppContext } from './context.js';

export function configRoutes(ctx: AppContext): Router {
  const { agentManager, db: _db } = ctx;
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

  return router;
}
