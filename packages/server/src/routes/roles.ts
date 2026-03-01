import { Router } from 'express';
import { validateBody, registerRoleSchema } from '../validation/schemas.js';
import { writeAgentFiles } from '../agents/agentFiles.js';
import type { AppContext } from './context.js';

export function rolesRoutes(ctx: AppContext): Router {
  const { roleRegistry } = ctx;
  const router = Router();

  // --- Roles ---
  router.get('/roles', (_req, res) => {
    res.json(roleRegistry.getAll());
  });

  router.post('/roles', validateBody(registerRoleSchema), (req, res) => {
    const role = roleRegistry.register(req.body);
    writeAgentFiles([role]);
    res.status(201).json(role);
  });

  router.delete('/roles/:id', (req, res) => {
    const ok = roleRegistry.remove(req.params.id);
    res.json({ ok });
  });

  return router;
}
