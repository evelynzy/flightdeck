# Workflow Automation

Workflow Automation lets you create "When X then Y" rules that respond to events automatically. Combined with Predictive Intelligence, this creates an anticipation→action loop that makes Away Mode trustworthy.

## How It Works

1. **Events happen** — an agent crashes, a prediction fires, a task completes
2. **Rules evaluate** — the engine checks if any rule matches the event
3. **Actions execute** — matched rules trigger their configured actions
4. **Activity logs** — every firing is recorded for review

## Event Triggers (12)

| Trigger | Description |
|---------|-------------|
| Agent crash | An agent process exits unexpectedly |
| Agent stall | Agent produces no output for configured duration |
| Context pressure | Agent context window exceeds threshold (%) |
| Cost threshold | Session cost exceeds configured amount |
| Task complete | A DAG task transitions to "done" |
| Task failed | A DAG task transitions to "failed" |
| Prediction fired | A prediction exceeds confidence threshold |
| Build failed | CI check reports failure |
| Conflict detected | File conflict detected between agents |
| Approval timeout | A pending approval goes unanswered for configured time |
| Agent idle | An agent has been idle for configured duration |
| Session milestone | DAG reaches configured completion percentage |

## Action Types (12)

| Action | Description |
|--------|-------------|
| Restart agent | Restart the affected agent |
| Pause agent | Pause the affected agent |
| Terminate agent | Stop the agent permanently |
| Spawn agent | Launch a new agent with specified role |
| Send notification | Push a notification to the user |
| Reassign task | Move task to a different agent |
| Adjust budget | Increase or decrease budget limit |
| Auto-approve | Approve pending decisions matching criteria |
| Post message | Send a message to an agent or group |
| Scale agents | Increase or decrease agent count |
| Trigger playbook | Launch a playbook session |
| Log event | Record to activity log only (no side effect) |

## Sentence Builder

Create rules using a visual sentence builder:

```
When [trigger] happens, [action]
```

Example rules:
- "When **agent crashes**, **restart agent** (max 3 times)"
- "When **context pressure > 80%**, **restart agent**"
- "When **cost threshold exceeds $10**, **pause agent**"
- "When **prediction fired** (context exhaustion, confidence > 70%), **send notification**"

## Templates

12 pre-built templates organized in 4 categories:

### Context Management
- Auto-restart on context pressure (80%)
- Notify on approaching context limit (70%)
- Restart stalled agents after 10 minutes

### Cost Control
- Pause on budget exceeded
- Notify at 75% budget usage
- Switch to cheaper model at 50% budget

### Session Reliability
- Auto-restart on crash (max 3 retries)
- Reassign on repeated failure
- Notify on task failure

### Automation
- Auto-approve file writes from trusted agents
- Scale agents on high task queue
- Log all predictions for review

## Dry Run

Test any rule before enabling it:

```
POST /api/workflows/:id/dry-run
→ { "wouldMatch": true, "matchedEvents": [...], "wouldExecute": "restart-agent" }
```

Dry Run shows what the rule would match **right now** against current crew state, without actually executing the action.

## Activity Log

Every rule firing is recorded:
- Timestamp
- Which rule fired
- What event triggered it
- What action was taken
- Outcome (success/failure)

The activity log includes a one-click **"Disable rule"** button on each entry — a safety valve if a rule is firing too aggressively.

## Rule Management

### Creating Rules
Use the sentence builder UI in Settings → Workflows, or call the API:

```
POST /api/workflows → { trigger, action, config, enabled }
```

### Ordering
Rules are evaluated in order. Higher-priority rules fire first. Drag to reorder, or call:

```
POST /api/workflows/reorder → { ids: ["rule-1", "rule-2", ...] }
```

### Toggling
Enable/disable individual rules without deleting them:

```
POST /api/workflows/:id/toggle
```

> [!WARNING]
> When multiple rules match the same event, they fire in order. Consider rule interactions carefully — a "restart" rule followed by a "terminate" rule for the same trigger could cause unexpected behavior.
