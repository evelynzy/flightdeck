# Predictions & Workflows API

API endpoints for Predictive Intelligence and Workflow Automation.

---

## Predictions

### `GET /api/predictions`

**Description**: Returns all active predictions for the current session.

**Query Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `leadId` | string | no | Filter by lead session |
| `type` | string | no | Filter by prediction type |

**Response**:
```json
[
  {
    "id": "pred-1",
    "type": "context-exhaustion",
    "agentId": "dev-1",
    "confidence": 0.85,
    "predictedAt": "2024-01-15T10:00:00Z",
    "predictedEvent": "Context window exhaustion in ~25 minutes",
    "suggestedAction": "Restart agent to reset context",
    "data": { "currentUsage": 0.72, "rate": 0.01, "estimatedTimeMinutes": 25 }
  }
]
```

**Prediction types**: `context-exhaustion`, `cost-overrun`, `agent-stall`, `task-duration`, `completion-estimate`, `file-conflict`

---

### `GET /api/predictions/history`

**Description**: Returns past predictions with outcomes.

**Response**:
```json
[
  {
    "id": "pred-1",
    "type": "context-exhaustion",
    "outcome": "avoided",
    "resolvedAt": "2024-01-15T10:15:00Z"
  }
]
```

**Outcomes**: `correct`, `avoided`, `wrong`, `expired`

---

### `GET /api/predictions/accuracy`

**Description**: Returns accuracy metrics across all prediction types.

**Response**:
```json
{
  "total": 25,
  "correct": 12,
  "avoided": 8,
  "wrong": 3,
  "expired": 2,
  "accuracyRate": 0.80,
  "byType": {
    "context-exhaustion": { "total": 8, "correct": 5, "avoided": 2, "wrong": 1, "expired": 0 }
  }
}
```

---

### `GET /api/predictions/config`

**Description**: Returns prediction configuration.

### `PUT /api/predictions/config`

**Description**: Update prediction configuration.

**Request Body**:
```json
{
  "enabled": true,
  "types": {
    "context-exhaustion": { "enabled": true, "threshold": 0.7 },
    "cost-overrun": { "enabled": true, "threshold": 0.75 },
    "agent-stall": { "enabled": true, "timeoutMinutes": 5 }
  },
  "notifyOnHighConfidence": true
}
```

---

### `POST /api/predictions/:id/dismiss`

**Description**: Dismiss an active prediction.

**Response**: `{ "ok": true }`

---

## Workflows

### `GET /api/workflows`

**Description**: List all workflow rules.

**Response**:
```json
[
  {
    "id": "wf-1",
    "name": "Auto-restart on context pressure",
    "trigger": { "type": "context-pressure", "threshold": 0.8 },
    "action": { "type": "restart-agent" },
    "enabled": true,
    "order": 1,
    "createdAt": "2024-01-15T09:00:00Z",
    "lastFired": "2024-01-15T10:30:00Z",
    "fireCount": 3
  }
]
```

---

### `POST /api/workflows`

**Description**: Create a new workflow rule.

**Request Body**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | yes | Human-readable rule name |
| `trigger` | object | yes | Event trigger configuration |
| `action` | object | yes | Action to execute |
| `enabled` | boolean | no | Whether rule is active (default: true) |

**Trigger types**: `agent-crash`, `agent-stall`, `context-pressure`, `cost-threshold`, `task-complete`, `task-failed`, `prediction-fired`, `build-failed`, `conflict-detected`, `approval-timeout`, `agent-idle`, `session-milestone`

**Action types**: `restart-agent`, `pause-agent`, `terminate-agent`, `spawn-agent`, `send-notification`, `reassign-task`, `adjust-budget`, `auto-approve`, `post-message`, `scale-agents`, `trigger-playbook`, `log-event`

---

### `PUT /api/workflows/:id`

**Description**: Update an existing workflow rule.

### `DELETE /api/workflows/:id`

**Description**: Delete a workflow rule.

---

### `POST /api/workflows/reorder`

**Description**: Set the evaluation order of all rules.

**Request Body**:
```json
{ "ids": ["wf-3", "wf-1", "wf-2"] }
```

---

### `POST /api/workflows/:id/toggle`

**Description**: Toggle a rule on or off.

**Response**:
```json
{ "id": "wf-1", "enabled": false }
```

---

### `POST /api/workflows/:id/dry-run`

**Description**: Test a rule against current crew state without executing.

**Response**:
```json
{
  "wouldMatch": true,
  "matchedEvents": [
    { "type": "context-pressure", "agentId": "dev-1", "value": 0.83 }
  ],
  "wouldExecute": { "type": "restart-agent", "target": "dev-1" }
}
```

---

### `GET /api/workflows/templates`

**Description**: Returns pre-built workflow rule templates.

**Response**:
```json
[
  {
    "id": "tpl-restart-context",
    "name": "Auto-restart on context pressure",
    "category": "context",
    "trigger": { "type": "context-pressure", "threshold": 0.8 },
    "action": { "type": "restart-agent" },
    "description": "Automatically restart agents approaching their context window limit"
  }
]
```

**Template categories**: `context`, `cost`, `session`, `automation`

---

### `GET /api/workflows/activity`

**Description**: Returns the workflow activity log.

**Response**:
```json
[
  {
    "id": "act-1",
    "ruleId": "wf-1",
    "ruleName": "Auto-restart on context pressure",
    "trigger": { "type": "context-pressure", "agentId": "dev-1", "value": 0.85 },
    "action": { "type": "restart-agent", "target": "dev-1" },
    "outcome": "success",
    "firedAt": "2024-01-15T10:30:00Z"
  }
]
```
