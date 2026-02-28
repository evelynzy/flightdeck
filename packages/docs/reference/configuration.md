# Configuration

## Server Configuration

Configuration is stored in the `settings` SQLite table and can be updated via the API or Settings page.

### Settings

| Key | Default | Description |
|-----|---------|-------------|
| `maxConcurrent` | `10` | Maximum concurrent agents |
| `autoRestart` | `true` | Auto-restart crashed agents |
| `maxRestarts` | `3` | Max restart attempts per agent |
| `autoKillTimeoutMs` | `null` | Auto-kill hung agents after this many ms |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DB_PATH` | `./ai-crew.db` | SQLite database path |

## Tool Permissions

Agents request tool permissions (file writes, shell commands) during operation. The framework **auto-approves** all tool requests after a 60-second timeout. This is by design to enable autonomous team operation.

## Model Configuration

Models can be configured at three levels (highest priority first):

1. **Per-agent** — Set via `PATCH /api/agents/:id` or the dashboard model selector
2. **Per-role** — Set via custom role definition
3. **Built-in default** — Defined in `RoleRegistry` source code
