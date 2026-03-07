// packages/server/src/container.ts
// DI Container — builds all services in dependency order with lifecycle management.
// Routes receive AppContext (unchanged). Only index.ts sees ServiceContainer.

import { createServer, type Server as HttpServer } from 'http';
import type { ServerConfig } from './config.js';
import { updateConfig, getConfig } from './config.js';
import type { AppContext } from './routes/context.js';

// ── Imports: Tier 0 (Config/DB) ────────────────────────────
import { Database } from './db/database.js';

// ── Imports: Tier 1 (Core Registries) ──────────────────────
import { FileLockRegistry } from './coordination/FileLockRegistry.js';
import { ActivityLedger } from './coordination/ActivityLedger.js';
import { RoleRegistry } from './agents/RoleRegistry.js';
import { DecisionLog } from './coordination/DecisionLog.js';
import { AgentMemory } from './agents/AgentMemory.js';
import { ChatGroupRegistry } from './comms/ChatGroupRegistry.js';
import { TaskDAG } from './tasks/TaskDAG.js';
import { DeferredIssueRegistry } from './tasks/DeferredIssueRegistry.js';
import { ProjectRegistry } from './projects/ProjectRegistry.js';
import { TimerRegistry } from './coordination/TimerRegistry.js';
import { CostTracker } from './agents/CostTracker.js';

// ── Imports: Tier 2 (Stateless Services) ───────────────────
import { MessageBus } from './comms/MessageBus.js';
import { EventPipeline, taskCompletedHandler, commitQualityGateHandler, delegationTracker } from './coordination/EventPipeline.js';
import { TaskTemplateRegistry } from './tasks/TaskTemplates.js';
import { CapabilityInjector } from './agents/capabilities/CapabilityInjector.js';
import { RetryManager } from './agents/RetryManager.js';
import { CrashForensics } from './agents/CrashForensics.js';
import { NotificationManager } from './coordination/NotificationManager.js';
import { ModelSelector } from './agents/ModelSelector.js';
import { TokenBudgetOptimizer } from './agents/TokenBudgetOptimizer.js';
import { ReportGenerator } from './coordination/ReportGenerator.js';
import { ProjectTemplateRegistry } from './coordination/ProjectTemplates.js';
import { KnowledgeTransfer } from './coordination/KnowledgeTransfer.js';
import { DecisionRecordStore } from './coordination/DecisionRecords.js';
import { CoverageTracker } from './coordination/CoverageTracker.js';
import { ComplexityMonitor } from './coordination/ComplexityMonitor.js';
import { DependencyScanner } from './coordination/DependencyScanner.js';
import { WebhookManager } from './coordination/WebhookManager.js';

// ── Imports: Tier 3 (Composed) ─────────────────────────────
import { TaskDecomposer } from './tasks/TaskDecomposer.js';
import { FileDependencyGraph } from './coordination/FileDependencyGraph.js';
import { WorktreeManager } from './coordination/WorktreeManager.js';
import { EscalationManager } from './coordination/EscalationManager.js';
import { EagerScheduler } from './tasks/EagerScheduler.js';
import { SearchEngine } from './coordination/SearchEngine.js';

// ── Imports: Tier 4-5 (AgentManager + dependents) ──────────
import { AgentManager } from './agents/AgentManager.js';
import { ContextRefresher } from './coordination/ContextRefresher.js';
import { CapabilityRegistry } from './coordination/CapabilityRegistry.js';
import { AlertEngine } from './coordination/AlertEngine.js';
import { AgentMatcher } from './coordination/AgentMatcher.js';
import { SessionRetro } from './coordination/SessionRetro.js';
import { SessionExporter } from './coordination/SessionExporter.js';
import { PerformanceTracker } from './coordination/PerformanceScorecard.js';

// ── Imports: Tier 6 (HTTP/WS) ──────────────────────────────
import { WebSocketServer } from './comms/WebSocketServer.js';
import { Scheduler } from './utils/Scheduler.js';

// ── Types ──────────────────────────────────────────────────

export interface ContainerConfig {
  config: ServerConfig;
  repoRoot: string;
}

export interface ServiceContainer extends AppContext {
  /** Shuts down all services with lifecycle methods, in reverse registration order. */
  shutdown(): Promise<void>;

  /** The raw HTTP server instance (set after Express app creation). */
  httpServer: HttpServer;

  /** Services needed for wiring but not exposed to routes. */
  internal: {
    messageBus: MessageBus;
    agentMemory: AgentMemory;
    chatGroupRegistry: ChatGroupRegistry;
    taskDAG: TaskDAG;
    deferredIssueRegistry: DeferredIssueRegistry;
    contextRefresher: ContextRefresher;
    scheduler: Scheduler;
    wsServer: WebSocketServer;
    worktreeManager: WorktreeManager;
    timerRegistry: TimerRegistry;
  };
}

// ── Factory ────────────────────────────────────────────────

export async function createContainer(opts: ContainerConfig): Promise<ServiceContainer> {
  const { config, repoRoot } = opts;
  const stopList: Array<{ name: string; fn: () => void }> = [];

  function onShutdown(name: string, fn: () => void): void {
    stopList.push({ name, fn });
  }

  // ── Tier 0: Config & Database ──────────────────────────
  const db = new Database(config.dbPath);
  onShutdown('db', () => db.close());

  // Restore persisted settings from DB (survives server restart)
  const persistedMaxAgents = db.getSetting('maxConcurrentAgents');
  if (persistedMaxAgents) {
    const parsed = parseInt(persistedMaxAgents, 10);
    if (!isNaN(parsed) && parsed > 0) {
      updateConfig({ maxConcurrentAgents: parsed });
    }
  }
  // Re-read config so all services see restored values
  const effectiveConfig = getConfig();

  // ── Tier 1: Core Registries ────────────────────────────
  const lockRegistry = new FileLockRegistry(db);
  lockRegistry.startExpiryCheck();
  onShutdown('lockRegistry', () => {
    lockRegistry.stopExpiryCheck();
    lockRegistry.cleanExpired();
  });

  const activityLedger = new ActivityLedger(db);
  onShutdown('activityLedger', () => activityLedger.stop());

  const roleRegistry = new RoleRegistry(db);
  const decisionLog = new DecisionLog(db);
  const agentMemory = new AgentMemory(db);
  const chatGroupRegistry = new ChatGroupRegistry(db);
  const taskDAG = new TaskDAG(db);
  const deferredIssueRegistry = new DeferredIssueRegistry(db);
  const projectRegistry = new ProjectRegistry(db);
  const timerRegistry = new TimerRegistry(db.drizzle);
  const costTracker = new CostTracker(db);

  // ── Tier 2: Stateless Services ─────────────────────────
  const messageBus = new MessageBus();
  const eventPipeline = new EventPipeline();
  const taskTemplateRegistry = new TaskTemplateRegistry();
  const capabilityInjector = new CapabilityInjector();

  const retryManager = new RetryManager();
  retryManager.start();
  onShutdown('retryManager', () => retryManager.stop());

  const crashForensics = new CrashForensics();
  const notificationManager = new NotificationManager();
  const modelSelector = new ModelSelector();
  const tokenBudgetOptimizer = new TokenBudgetOptimizer();
  const reportGenerator = new ReportGenerator();
  const projectTemplateRegistry = new ProjectTemplateRegistry();
  const knowledgeTransfer = new KnowledgeTransfer();
  const decisionRecordStore = new DecisionRecordStore();
  const coverageTracker = new CoverageTracker();
  const complexityMonitor = new ComplexityMonitor(repoRoot);
  const dependencyScanner = new DependencyScanner(repoRoot);
  const webhookManager = new WebhookManager();

  // ── Tier 3: Composed Services ──────────────────────────
  const taskDecomposer = new TaskDecomposer(taskTemplateRegistry);
  const fileDependencyGraph = new FileDependencyGraph(repoRoot);
  const worktreeManager = new WorktreeManager(repoRoot, lockRegistry);
  worktreeManager.cleanupOrphans().catch(err => {
    console.warn(`[container] Orphan cleanup failed: ${err.message}`);
  });

  const escalationManager = new EscalationManager(decisionLog, taskDAG);

  const eagerScheduler = new EagerScheduler(taskDAG);
  eagerScheduler.start();
  onShutdown('eagerScheduler', () => eagerScheduler.stop());

  const searchEngine = new SearchEngine(activityLedger, decisionLog);

  // ── Tier 4: AgentManager ───────────────────────────────
  const agentManager = new AgentManager(
    effectiveConfig, roleRegistry, lockRegistry, activityLedger,
    messageBus, decisionLog, agentMemory, chatGroupRegistry,
    taskDAG, {
      db, deferredIssueRegistry, timerRegistry, capabilityInjector,
      taskTemplateRegistry, taskDecomposer, worktreeManager, costTracker,
    },
  );
  agentManager.setProjectRegistry(projectRegistry);
  onShutdown('agentManager', () => agentManager.shutdownAll());

  // ── Tier 5: AgentManager-dependent services ────────────
  const contextRefresher = new ContextRefresher(agentManager, lockRegistry, activityLedger);
  const capabilityRegistry = new CapabilityRegistry(db, lockRegistry, () => agentManager.getAll());
  const alertEngine = new AlertEngine(agentManager, lockRegistry, decisionLog, activityLedger, taskDAG);
  alertEngine.start();
  onShutdown('alertEngine', () => alertEngine.stop());

  const agentMatcher = new AgentMatcher(agentManager, capabilityRegistry, activityLedger);
  const sessionRetro = new SessionRetro(db, agentManager, activityLedger, decisionLog, taskDAG, lockRegistry);
  const sessionExporter = new SessionExporter(agentManager, activityLedger, decisionLog, taskDAG, chatGroupRegistry);
  const performanceTracker = new PerformanceTracker(activityLedger, agentManager);

  // ── Timers & Scheduler ─────────────────────────────────
  timerRegistry.start();
  onShutdown('timerRegistry', () => timerRegistry.stop());

  const scheduler = new Scheduler();
  scheduler.register({
    id: 'activity-log-prune',
    interval: 3_600_000,
    run: () => activityLedger.prune(50_000),
  });
  scheduler.register({
    id: 'stale-delegation-cleanup',
    interval: 300_000,
    run: () => { agentManager.cleanupStaleDelegations(); },
  });
  onShutdown('scheduler', () => scheduler.stop());

  onShutdown('escalationManager', () => escalationManager.stop());

  // ── Build the container object ─────────────────────────
  const container: ServiceContainer = {
    // AppContext fields (used by routes)
    agentManager,
    roleRegistry,
    config: effectiveConfig,
    db,
    lockRegistry,
    activityLedger,
    decisionLog,
    projectRegistry,
    alertEngine,
    capabilityRegistry,
    sessionRetro,
    sessionExporter,
    eagerScheduler,
    fileDependencyGraph,
    agentMatcher,
    retryManager,
    crashForensics,
    webhookManager,
    taskTemplateRegistry,
    taskDecomposer,
    searchEngine,
    performanceTracker,
    decisionRecordStore,
    coverageTracker,
    complexityMonitor,
    dependencyScanner,
    notificationManager,
    escalationManager,
    modelSelector,
    tokenBudgetOptimizer,
    reportGenerator,
    projectTemplateRegistry,
    knowledgeTransfer,
    eventPipeline,

    // Lifecycle
    async shutdown() {
      for (const { name, fn } of stopList.reverse()) {
        try { fn(); } catch (err) {
          console.warn(`[container] ${name} shutdown failed:`, err);
        }
      }
    },

    // HTTP server — set by caller after Express app creation
    httpServer: null as unknown as HttpServer,

    // Internal services (not exposed to routes)
    internal: {
      messageBus,
      agentMemory,
      chatGroupRegistry,
      taskDAG,
      deferredIssueRegistry,
      contextRefresher,
      scheduler,
      wsServer: null as unknown as WebSocketServer,
      worktreeManager,
      timerRegistry,
    },
  };

  // ── Wire cross-service events ──────────────────────────
  wireEvents(container);

  return container;
}

// ── Event Wiring ───────────────────────────────────────────

function wireEvents(c: ServiceContainer): void {
  const {
    eventPipeline, activityLedger, lockRegistry, decisionLog,
    alertEngine, eagerScheduler, agentManager, webhookManager,
    capabilityRegistry, decisionRecordStore,
  } = c;
  const { taskDAG, timerRegistry } = c.internal;

  // EventPipeline handlers
  eventPipeline!.register(taskCompletedHandler);
  eventPipeline!.register(commitQualityGateHandler);
  eventPipeline!.register(delegationTracker);
  eventPipeline!.connectToLedger(activityLedger);

  // Webhook relay
  eventPipeline!.register({
    name: 'webhook-relay',
    eventTypes: '*',
    handle: (event: any) => {
      webhookManager?.fire(event.entry.actionType, {
        agentId: event.entry.agentId,
        agentRole: event.entry.agentRole,
        summary: event.entry.summary,
        details: event.entry.details,
      });
    },
  });

  // Timer events → agent message delivery + WS broadcast
  timerRegistry.on('timer:fired', (timer: { agentId: string; label: string; message: string }) => {
    const agent = agentManager.get(timer.agentId);
    if (agent && agent.status !== 'completed' && agent.status !== 'failed' && agent.status !== 'terminated') {
      agent.queueMessage(`[System Timer "${timer.label}"] ${timer.message}`);
    }
    const projectId = agentManager.getProjectIdForAgent(timer.agentId);
    c.internal.wsServer?.broadcastEvent({ type: 'timer:fired', timer }, projectId);
  });
  timerRegistry.on('timer:created', (timer: { id: string; agentId: string; label: string }) => {
    const projectId = agentManager.getProjectIdForAgent(timer.agentId);
    c.internal.wsServer?.broadcastEvent({ type: 'timer:created', timer }, projectId);
  });
  timerRegistry.on('timer:cancelled', (timer: { id: string; agentId: string; label: string }) => {
    const projectId = agentManager.getProjectIdForAgent(timer.agentId);
    c.internal.wsServer?.broadcastEvent({ type: 'timer:cancelled', timer }, projectId);
  });

  // DAG → Eager scheduler re-evaluation
  taskDAG.on('dag:updated', () => eagerScheduler!.evaluate());

  // Eager scheduler → Lead notification
  eagerScheduler!.on('task:ready', ({ taskId }: { taskId: string }) => {
    const lead = agentManager.getAll().find(a => a.role?.id === 'lead' && a.status === 'running');
    if (lead) {
      lead.sendMessage(`[System] ⚡ Eager Scheduler: task now ready: ${taskId.slice(0, 8)}`);
    }
  });

  // Lock events → Capability registry
  lockRegistry.on('lock:acquired', ({ agentId, agentRole, filePath }: { agentId: string; agentRole: string; filePath: string }) => {
    const agent = agentManager.get(agentId);
    const leadId = agent?.parentId ?? agentId;
    capabilityRegistry!.recordFileTouch(agentId, agentRole, leadId, filePath);
  });

  // Decision log → Decision record store
  decisionLog.on('decision', (decision: any) => {
    decisionRecordStore!.createFromDecision(decision);
  });

  // Alert engine → WS broadcast (deferred — wsServer set after HTTP server creation in index.ts)
}
