# Predictive Intelligence

Flightdeck's prediction engine uses linear extrapolation to anticipate problems before they happen. Six prediction types monitor your crew and provide early warnings with confidence scoring.

## Prediction Types

### Context Exhaustion
Monitors agent context window consumption rate and predicts when an agent will hit its limit.

- **Data source**: Token usage over time
- **Trigger**: Predicted to exhaust within 30 minutes at current rate
- **Suggested action**: Restart agent, reduce task scope, or switch to a model with larger context

### Cost Overrun
Tracks spending against budget and predicts when limits will be exceeded.

- **Data source**: Cost accumulation rate
- **Trigger**: Predicted to exceed budget before session completes
- **Suggested action**: Adjust budget, pause expensive agents, or switch to cheaper models

### Agent Stall
Detects agents that have stopped making progress despite being in "running" state.

- **Data source**: Output token rate, file changes, task updates
- **Trigger**: No meaningful output for 5+ minutes
- **Suggested action**: Restart agent, reassign task, or send a nudge message

### Task Duration
Estimates how long remaining tasks will take based on completed task performance.

- **Data source**: Historical task completion times by complexity
- **Trigger**: Task estimated to exceed 2× average duration
- **Suggested action**: Split task, add parallel agents, or simplify scope

### Completion Estimate
Predicts overall session completion time based on DAG progress and remaining work.

- **Data source**: DAG completion rate, remaining task count, agent throughput
- **Display**: Progress bar with estimated time remaining

### File Conflict
Predicts which agents are likely to edit overlapping files based on task descriptions and historical patterns.

- **Data source**: Task descriptions, agent file history, current file locks
- **Trigger**: Two agents predicted to need the same files
- **Suggested action**: Sequence work, split files, or assign different areas

## Confidence Scoring

Each prediction includes a confidence score (0–100%) based on:
- **Data quality** — how much historical data is available
- **Variance** — how consistent the measurements are
- **Time horizon** — shorter predictions are more reliable

| Confidence | Display | Meaning |
|-----------|---------|---------|
| 80–100% | Green bar | High confidence — likely accurate |
| 50–79% | Amber bar | Moderate — directionally useful |
| 0–49% | Red bar | Low — treat as a weak signal |

## UI Integration

### Predictions Panel
Widget on the Overview dashboard showing active predictions grouped by type. Each card shows:
- Prediction type icon and title
- Affected agent/task
- Confidence bar
- Suggested action button

### Pulse Indicator
A micro-indicator in the Pulse strip showing the count of active predictions with severity coloring.

### Canvas Overlays
- **Dashed rings** around agents with context exhaustion predictions
- **Pulsing conflict edges** between agents with file conflict predictions
- **Stall badges** on agents with stall predictions

## Accuracy Tracking

The system tracks prediction outcomes in four categories:

| Category | Meaning |
|----------|---------|
| Correct | Prediction happened as forecasted |
| Avoided | User took action and prevented the predicted issue |
| Wrong | Prediction didn't materialize and no action was taken |
| Expired | Prediction's time horizon passed without relevance |

Access accuracy metrics:
```
GET /api/predictions/accuracy → { correct: 12, avoided: 8, wrong: 3, expired: 2 }
```

## Configuration

Configure predictions in Settings → Predictions:
- Enable/disable individual prediction types
- Set sensitivity thresholds
- Configure notification preferences per type

## Workflow Integration

Predictions can trigger Workflow Automation rules. For example:
- "When context exhaustion prediction confidence > 80%, automatically restart the agent"
- "When cost overrun predicted, pause the most expensive agent"

→ See [Workflow Automation](/guide/workflows) for details.
