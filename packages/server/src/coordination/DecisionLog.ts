import { EventEmitter } from 'events';
import type { Database } from '../db/database.js';

export type DecisionStatus = 'recorded' | 'confirmed' | 'rejected';

export interface Decision {
  id: string;
  agentId: string;
  agentRole: string;
  leadId: string | null;
  title: string;
  rationale: string;
  needsConfirmation: boolean;
  status: DecisionStatus;
  confirmedAt: string | null;
  timestamp: string;
}

export class DecisionLog extends EventEmitter {
  private db: Database;

  constructor(db: Database) {
    super();
    this.db = db;
  }

  add(agentId: string, agentRole: string, title: string, rationale: string, needsConfirmation = false, leadId?: string): Decision {
    const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    this.db.run(
      'INSERT INTO decisions (id, agent_id, agent_role, lead_id, title, rationale, needs_confirmation, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, agentId, agentRole, leadId || null, title, rationale, needsConfirmation ? 1 : 0, 'recorded', timestamp],
    );

    const decision: Decision = { id, agentId, agentRole, leadId: leadId || null, title, rationale, needsConfirmation, status: 'recorded', confirmedAt: null, timestamp };
    this.emit('decision', decision);
    return decision;
  }

  getAll(): Decision[] {
    return this.db.all<any>('SELECT * FROM decisions ORDER BY created_at ASC').map(rowToDecision);
  }

  getByAgent(agentId: string): Decision[] {
    return this.db.all<any>('SELECT * FROM decisions WHERE agent_id = ? ORDER BY created_at ASC', [agentId]).map(rowToDecision);
  }

  getByAgents(agentIds: string[]): Decision[] {
    if (agentIds.length === 0) return [];
    const placeholders = agentIds.map(() => '?').join(',');
    return this.db.all<any>(
      `SELECT * FROM decisions WHERE agent_id IN (${placeholders}) ORDER BY created_at ASC`,
      agentIds,
    ).map(rowToDecision);
  }

  getByLeadId(leadId: string): Decision[] {
    return this.db.all<any>('SELECT * FROM decisions WHERE lead_id = ? ORDER BY created_at ASC', [leadId]).map(rowToDecision);
  }

  getNeedingConfirmation(): Decision[] {
    return this.db.all<any>(
      "SELECT * FROM decisions WHERE needs_confirmation = 1 AND status = 'recorded' ORDER BY created_at ASC",
    ).map(rowToDecision);
  }

  getById(id: string): Decision | undefined {
    const row = this.db.get<any>('SELECT * FROM decisions WHERE id = ?', [id]);
    return row ? rowToDecision(row) : undefined;
  }

  confirm(id: string): Decision | undefined {
    const existing = this.getById(id);
    if (!existing || existing.status !== 'recorded') return existing;
    const confirmedAt = new Date().toISOString();
    this.db.run("UPDATE decisions SET status = 'confirmed', confirmed_at = ? WHERE id = ?", [confirmedAt, id]);
    const decision = this.getById(id);
    if (decision) this.emit('decision:confirmed', decision);
    return decision;
  }

  reject(id: string): Decision | undefined {
    const existing = this.getById(id);
    if (!existing || existing.status !== 'recorded') return existing;
    const confirmedAt = new Date().toISOString();
    this.db.run("UPDATE decisions SET status = 'rejected', confirmed_at = ? WHERE id = ?", [confirmedAt, id]);
    const decision = this.getById(id);
    if (decision) this.emit('decision:rejected', decision);
    return decision;
  }

  clear(): void {
    this.db.run('DELETE FROM decisions');
  }
}

function rowToDecision(row: any): Decision {
  return {
    id: row.id,
    agentId: row.agent_id,
    agentRole: row.agent_role,
    leadId: row.lead_id,
    title: row.title,
    rationale: row.rationale,
    needsConfirmation: row.needs_confirmation === 1,
    status: row.status as DecisionStatus,
    confirmedAt: row.confirmed_at,
    timestamp: row.created_at,
  };
}
