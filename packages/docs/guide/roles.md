# Roles & Agents

## Built-in Roles

| Role | Icon | Focus | Default Model |
|------|------|-------|---------------|
| Project Lead | 🎯 | Coordination, delegation, synthesis | Claude Opus 4.6 |
| Developer | 💻 | Code implementation, tests | Claude Opus 4.6 |
| Architect | 🏗️ | System design, challenges problem framing | Claude Opus 4.6 |
| Code Reviewer | 📖 | Readability, maintainability, patterns | Gemini 3 Pro |
| Critical Reviewer | 🛡️ | Security, performance, edge cases | Claude Sonnet 4.6 |
| Product Manager | 🎯 | User needs, product quality, UX | GPT-5.2 Codex |
| Technical Writer | 📝 | Documentation, API design review | GPT-5.2 |
| Designer | 🎨 | UI/UX, interaction design, accessibility | Claude Opus 4.6 |
| Generalist | 🔧 | Cross-disciplinary problem solving | Claude Opus 4.6 |
| Radical Thinker | 🚀 | Challenge assumptions, unconventional ideas | GPT-5.3 Codex |

## Model Diversity

Each role defaults to a different AI model to bring diverse perspectives. The lead can override models per agent via `CREATE_AGENT`, and users can change models at runtime from the dashboard.

## Custom Roles

Register custom roles via the Settings page or the API:

```bash
curl -X POST http://localhost:3001/api/roles \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "data-engineer",
    "name": "Data Engineer",
    "icon": "📊",
    "color": "#4CAF50",
    "systemPrompt": "You are a data engineering specialist...",
    "defaultModel": "claude-opus-4.6"
  }'
```

## Agent Lifecycle

```
creating → running → idle → completed
                 ↘         ↗
                  failed
```

- **creating**: Agent process is starting up
- **running**: Actively processing a task
- **idle**: Waiting for new work
- **completed**: Task finished successfully
- **failed**: Process exited with error (may auto-restart)

## Auto-Restart & Health

- Agents that crash are automatically restarted (configurable, up to a max restart count)
- A **heartbeat monitor** detects hung agents and can auto-kill after a timeout
- The **ContextRefresher** re-injects crew context after context window compaction

## Agent Identity

Each agent gets:
- A unique **ID** (short hash)
- A `.agent.md` file in the working directory with role instructions
- Access to the **crew manifest** (team roster, active delegations, coordination rules)

Agents reference each other by short ID in commands (e.g., `"to": "a1b2c3"`).
