# System Messages Reference

Every message the system can send to agents, organized by subsystem.

## Table of Contents

- [Overview](#overview)
- [HeartbeatMonitor Messages](#heartbeatmonitor-messages)
  - [1. Lead Idle Nudge](#1-lead-idle-nudge)
  - [2. Lead Stalled Escalation](#2-lead-stalled-escalation)
  - [3. Periodic Command Reference Reminder](#3-periodic-command-reference-reminder)
  - [4. On-Demand Command Reminder](#4-on-demand-command-reminder)
- [CompletionTracking Messages](#completiontracking-messages)
  - [5. DAG Tracking Nudge](#5-dag-tracking-nudge)
- [AlertEngine Alerts (UI-Only)](#alertengine-alerts-ui-only)
  - [6. Stuck Agent](#6-stuck-agent)
  - [7. Long-Running Prompt](#7-long-running-prompt)
  - [8. Context Pressure](#8-context-pressure)
  - [9. Duplicate File Edit](#9-duplicate-file-edit)
  - [10. Idle Agents With Ready Tasks](#10-idle-agents-with-ready-tasks)
  - [11. Stale Decision](#11-stale-decision)
- [Agent-Initiated Messages](#agent-initiated-messages)
  - [12. SET_TIMER Reminders](#12-set_timer-reminders)
- [HALT_HEARTBEAT and RESUME_HEARTBEAT](#halt_heartbeat-and-resume_heartbeat)
- [Suppression Summary Table](#suppression-summary-table)

---

## Overview

Flightdeck sends messages to agents through several independent subsystems. These range
from periodic heartbeat nudges that keep leads productive, to command reference reminders,
to UI-only alerts visible on the dashboard. Understanding the distinction is important —
some are controllable by agents (via `HALT_HEARTBEAT`), while others are always-on.

**Key architecture points:**
- Messages delivered via `sendMessage()` interrupt the agent immediately.
- Messages delivered via `queueMessage()` wait until the agent is idle (non-interrupting).
- AlertEngine alerts are UI-only — they appear on the dashboard, not sent to agents.
- `HALT_HEARTBEAT` only controls lead idle nudges (#1-2). Command reminders, DAG nudges,
  alerts, and timers are unaffected.

---

## HeartbeatMonitor Messages

**Source:** `packages/server/src/agents/HeartbeatMonitor.ts`

The `HeartbeatMonitor` class runs a periodic check loop (default interval: 120 seconds).
Each cycle performs two passes: first it checks lead agents for idle-with-pending-work,
then it checks all running agents for command reminder eligibility.

### 1. Lead Idle Nudge

| Property | Value |
|----------|-------|
| **Target** | Lead agents only (`role.id === 'lead'`) in `idle` status |
| **Trigger** | Lead idle > 60 seconds AND all children idle/completed AND remaining DAG tasks or active delegations exist |
| **Content** | `[System] Reminder: N tasks remaining (X ready, Y pending…)` + task list (up to 8) + action hints |
| **Delivery** | `lead.sendMessage()` — **interrupts immediately** |
| **Interval** | Every heartbeat check cycle (default 120s), subject to backoff |
| **Backoff** | Nudges 1–3: every cycle · 4–6: every 2nd cycle · 7+: every 3rd cycle |
| **Suppressed by** | `HALT_HEARTBEAT` ✅, `humanInterrupted` ✅, `trackActive()` ✅ |
| **Source lines** | `check()` at line 158, nudge message built at lines 212–248, sent at line 251 |

**Conditions that prevent the nudge:**
- Lead has been idle less than 60 seconds
- Any child agent is still in `running` or `creating` status
- DAG tasks are actively running (`dagSummary.running > 0`)
- No active delegations AND no remaining DAG tasks (work is done)
- Lead called `HALT_HEARTBEAT` (in `haltedAgents` set)
- User recently sent a message via the UI (`humanInterrupted` set)

### 2. Lead Stalled Escalation

| Property | Value |
|----------|-------|
| **Target** | System event — NOT delivered to any agent |
| **Trigger** | 5+ consecutive nudge cycles where the lead didn't respond |
| **Effect** | Emits `lead:stalled` event → surfaces as a dashboard alert via WebSocket |
| **Delivery** | Event emission (`this.ctx.emit('lead:stalled', ...)`) — no agent message |
| **Suppressed by** | `HALT_HEARTBEAT` ✅ (gated by same check at line 166) |
| **Source lines** | Escalation at lines 203–206, event type in `AgentManager.ts` line 84 |

This event fires regardless of the nudge backoff schedule — once `nudgeCount >= 5`, the
event fires every cycle even if the nudge message itself is suppressed by backoff.

### 3. Periodic Command Reference Reminder

| Property | Value |
|----------|-------|
| **Target** | All agents in `running` status |
| **Trigger** | Every 2 hours (`COMMAND_REMINDER_INTERVAL_MS = 7,200,000ms`) since last reminder or agent creation |
| **Content** | Full command reference block (COMMIT, LOCK_FILE, AGENT_MESSAGE, SET_TIMER, etc.) |
| **Delivery** | `agent.queueMessage()` — **waits for idle, non-interrupting** |
| **Suppressed by** | `HALT_HEARTBEAT` ❌ — **not affected** |
| **Source lines** | `sendCommandReminders()` at line 267, message built by `buildCommandReminderMessage()` at line 29 |

The reminder only targets agents currently in `running` status. Idle or terminated agents
are skipped. The 2-hour timer is per-agent and resets whenever a reminder is sent (including
on-demand reminders from type #4).

### 4. On-Demand Command Reminder

| Property | Value |
|----------|-------|
| **Target** | Specific agent (the one that issued an unknown/invalid command) |
| **Trigger** | Called by `sendCommandReminderTo(agent)` from command validation logic |
| **Content** | Same command reference block as type #3 |
| **Delivery** | `agent.queueMessage()` — **waits for idle, non-interrupting** |
| **Suppressed by** | `HALT_HEARTBEAT` ❌ — **not affected** (JSDoc at line 127 confirms) |
| **Source lines** | `sendCommandReminderTo()` at line 129 |

Sending an on-demand reminder resets the 2-hour periodic timer for that agent, preventing
a redundant periodic reminder shortly after.

---

## CompletionTracking Messages

**Source:** `packages/server/src/agents/commands/CompletionTracking.ts`

### 5. DAG Tracking Nudge

| Property | Value |
|----------|-------|
| **Target** | Parent/lead agent of the completing agent |
| **Trigger** | An agent completes a task that was NOT tracked in the DAG, while the DAG still has active tasks |
| **Content** | `[System] ⚠ This task was NOT in the DAG. Use COMPLETE_TASK or ADD_TASK (with status "done") to keep the DAG current.` |
| **Delivery** | `parent.sendMessage()` — **interrupts immediately** |
| **Suppressed by** | `HALT_HEARTBEAT` ❌ — **no heartbeat check** |
| **Source lines** | Lines 114–117 (COMPLETE_TASK path), lines 219–222 (agent report path) |

This nudge only fires when:
1. The completing agent's task is not tracked in the DAG (`dagTaskId` is null or not found)
2. The DAG has remaining work (pending + ready + running > 0)

If the DAG has no remaining tasks, the warning is suppressed — there's no DAG to keep current.

---

## AlertEngine Alerts (UI-Only)

**Source:** `packages/server/src/coordination/alerts/AlertEngine.ts`

These are **dashboard-only alerts** — they appear in the UI via WebSocket events but are
**never sent as messages to agents**. They inform the human operator about potential issues.

The AlertEngine runs its check loop periodically (calls `runChecks()` which invokes all
six individual checks sequentially at lines 92–97).

### 6. Stuck Agent

| Property | Value |
|----------|-------|
| **Alert type** | `stuck_agent` |
| **Status** | ⚠️ **Currently disabled** (line 104: `return;` at top of method) |
| **Target** | Dashboard UI |
| **Trigger** | Agent in `running` status with no activity for 10+ minutes (`STUCK_AGENT_MS`) |
| **Severity** | `warning` |
| **Source lines** | `checkStuckAgents()` at line 103 |

Disabled because it was too noisy for long-running sessions. Agents actively prompting
(within `MAX_PROMPTING_MS` of 30 minutes) were excluded, but the check still flagged
legitimate long-running work.

### 7. Long-Running Prompt

| Property | Value |
|----------|-------|
| **Alert type** | `long_running_prompt` |
| **Target** | Dashboard UI |
| **Trigger** | Agent has been prompting its AI provider for 30+ minutes (`MAX_PROMPTING_MS`) |
| **Severity** | `warning` |
| **Source lines** | `checkLongRunningPrompts()` at line 130 |

### 8. Context Pressure

| Property | Value |
|----------|-------|
| **Alert type** | `context_pressure` |
| **Target** | Dashboard UI |
| **Trigger** | Agent's context window usage exceeds threshold |
| **Severity** | Tiered: `info` at 70%, `warning` at 85%, `critical` at 95% |
| **Thresholds** | `CONTEXT_WARN_THRESHOLD = 0.70`, `CONTEXT_ALERT_THRESHOLD = 0.85`, `CONTEXT_CRITICAL_THRESHOLD = 0.95` |
| **Source lines** | `checkContextPressure()` at line 149 |

Includes projected time-to-exhaustion at `warning` level and recommended actions
(compaction, wrapping up) at `critical` level.

### 9. Duplicate File Edit

| Property | Value |
|----------|-------|
| **Alert type** | `duplicate_file_edit` |
| **Target** | Dashboard UI |
| **Trigger** | Multiple agents have locks on the same file |
| **Severity** | `warning` |
| **Source lines** | `checkDuplicateFileEdits()` at line 202 |

### 10. Idle Agents With Ready Tasks

| Property | Value |
|----------|-------|
| **Alert type** | `idle_agents_ready_tasks` |
| **Target** | Dashboard UI |
| **Trigger** | Idle agents exist while DAG tasks are in `ready` status |
| **Severity** | `info` |
| **Source lines** | `checkIdleAgentsWithReadyTasks()` at line 226 |

### 11. Stale Decision

| Property | Value |
|----------|-------|
| **Alert type** | `stale_decision` |
| **Target** | Dashboard UI |
| **Trigger** | A pending decision has been waiting for user response for 10+ minutes (`STALE_DECISION_MS`) |
| **Severity** | `warning` |
| **Source lines** | `checkStaleDecisions()` at line 251 |

---

## Agent-Initiated Messages

### 12. SET_TIMER Reminders

| Property | Value |
|----------|-------|
| **Target** | The agent that created the timer |
| **Trigger** | Timer delay elapsed (agent-specified, 5s–86400s range) |
| **Content** | `[System Timer "<label>"] <message>` |
| **Delivery** | `agent.queueMessage()` — **waits for idle, non-interrupting** |
| **Suppressed by** | `HALT_HEARTBEAT` ❌ — **not affected** (these are explicit agent requests) |
| **Repeatable** | Yes, if `repeat: true` was specified |
| **Persistence** | DB-backed via SQLite; survives server restarts |
| **Source files** | Command: `packages/server/src/agents/commands/TimerCommands.ts`, Registry: `packages/server/src/coordination/scheduling/TimerRegistry.ts`, Delivery: `packages/server/src/container.ts` line 466 |

The timer lifecycle:
1. Agent issues `SET_TIMER` → `TimerCommands.ts` validates and calls `TimerRegistry.create()`
2. Timer persisted to SQLite, scheduled in memory
3. `TimerRegistry.tick()` checks every 5 seconds for expired timers
4. On expiry: emits `timer:fired` event → `container.ts` handler delivers via `agent.queueMessage()`
5. If `repeat: true`, timer is rescheduled; otherwise marked `fired` in DB

Limits: 20 timers per agent. Delay range: 5–86400 seconds (5s to 24h).

---

## HALT_HEARTBEAT and RESUME_HEARTBEAT

**Source:** `packages/server/src/agents/commands/SystemCommands.ts` lines 121–133

### What HALT_HEARTBEAT Controls

`HALT_HEARTBEAT` adds the agent to the `haltedAgents` set in `HeartbeatMonitor`. This
**only suppresses lead idle nudges** (type #1) and the stalled escalation (type #2).

When an agent issues `HALT_HEARTBEAT`, the system responds:
```
[System] Heartbeat paused (lead idle nudges). Command reminders are unaffected.
Use RESUME_HEARTBEAT to re-enable nudges.
```

### What HALT_HEARTBEAT Does NOT Control

| Message Type | Affected by HALT_HEARTBEAT? |
|---|---|
| Command Reference Reminders (#3, #4) | ❌ No — always delivered |
| DAG Tracking Nudge (#5) | ❌ No — always delivered |
| AlertEngine Alerts (#6–11) | ❌ No — UI-only, independent |
| SET_TIMER Reminders (#12) | ❌ No — agent-requested |

### Suppression Mechanisms Comparison

| Mechanism | Scope | Persistence | Cleared by |
|---|---|---|---|
| `HALT_HEARTBEAT` | Lead idle nudges only | Until `RESUME_HEARTBEAT` | `RESUME_HEARTBEAT` command |
| `humanInterrupted` | Lead idle nudges only | Temporary | `trackActive()` when lead resumes work |
| `trackActive()` | Resets nudge counter | Immediate | Resets on activity |
| Terminal status check | Command reminders | Permanent | N/A (agent is done) |

---

## Suppression Summary Table

| # | Message Type | HALT_HEARTBEAT | humanInterrupted | Terminal Status | Always On |
|---|---|---|---|---|---|
| 1 | Lead Idle Nudge | ✅ Suppressed | ✅ Suppressed | N/A (leads only) | |
| 2 | Lead Stalled Escalation | ✅ Suppressed | ✅ Suppressed | N/A | |
| 3 | Periodic Command Reminder | ❌ | ❌ | ✅ Skipped | ✅ |
| 4 | On-Demand Command Reminder | ❌ | ❌ | ✅ Skipped | ✅ |
| 5 | DAG Tracking Nudge | ❌ | ❌ | ❌ | ✅ |
| 6–11 | AlertEngine Alerts | ❌ | ❌ | ❌ | ✅ (UI-only) |
| 12 | SET_TIMER Reminders | ❌ | ❌ | ✅ Skipped | ✅ |
