# AI Crew — Multi-Agent Copilot CLI Orchestrator

> [!WARNING]
> This is purely AI generated code. Use the project with this understanding in mind.

A web UI that orchestrates multiple Copilot CLI agents with specialized roles to collaborate on software engineering tasks. A **Project Lead** agent coordinates the team, delegates work, and facilitates debate — while you stay in the loop.

## Features

- **🎯 Project Lead** — Breaks down tasks, assembles a team, delegates work, and synthesizes results
- **👥 Specialized Roles** — Purpose-built agents with model diversity:
  | Role | Focus | Default Model |
  |------|-------|---------------|
  | 💻 Developer | Code + tests | Claude Opus 4.6 |
  | 🏗️ Architect | System design | Claude Opus 4.6 |
  | 📖 Code Reviewer | Readability, patterns | Gemini 3 Pro |
  | 🛡️ Critical Reviewer | Security, performance | Claude Sonnet 4.6 |
  | 🎯 Product Manager | User needs, UX | GPT-5.2 Codex |
  | 📝 Technical Writer | Docs, API design | GPT-5.2 |
  | 🎨 Designer | UI/UX, accessibility | Claude Opus 4.6 |
  | 🔧 Generalist | Cross-disciplinary | Claude Opus 4.6 |
  | 🚀 Radical Thinker | Challenge assumptions | GPT-5.3 Codex |
- **💬 Inter-Agent Communication** — Direct messages, broadcasts, and group chats between agents
- **📊 Task DAG** — Visualize task dependencies as a directed acyclic graph (ReactFlow)
- **✅ Decision Log** — Track architectural decisions with async user confirmation
- **🔒 File Locking** — Prevents conflicts when multiple agents edit the same files
- **📡 Real-Time Dashboard** — Live activity feed, team status, progress tracking via WebSocket
- **🙋 Human-in-the-Loop** — Message any agent or the lead; queue or interrupt with dedicated buttons
- **⏸️ Agent Controls** — Interrupt, stop, restart agents; change models on the fly
- **🔄 Session Resume** — Resume from a previous Copilot session ID
- **💾 Persistent Context** — `.agent.md` files and automatic context re-injection after compaction

## Getting Started

```bash
npm install
npm run dev
```

- **Server**: http://localhost:3001
- **Web UI**: http://localhost:5173

### Creating a Project

1. Open the web UI — the **Lead** page is the default view
2. Click **Create Project**, provide a name, task, and optionally a working directory
3. The lead analyzes the task, creates agents, and starts delegating

## Architecture

```
React UI ←→ WebSocket ←→ Node.js Server ←→ ACP/PTY ←→ Copilot CLI ×N
                              │
                         AgentManager (TypedEmitter)
                        ┌─────┴──────┐
                   MessageBus    ActivityLedger (batched writes)
                   DecisionLog   FileLockRegistry
                   Scheduler     ContextRefresher
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| **AgentManager** | Spawns agents, detects commands in output stream, routes messages, manages delegations |
| **Agent** | Wraps a Copilot CLI process (ACP/PTY) with lifecycle management |
| **RoleRegistry** | Role definitions with system prompts, icons, colors, default models |
| **MessageBus** | Routes inter-agent messages and group chats |
| **ActivityLedger** | Batched activity logging (flushes every 250ms or 64 entries) |
| **ContextRefresher** | Re-injects crew context after agent compaction events |
| **Scheduler** | Background tasks: expired lock cleanup, activity pruning |

### Agent Commands

Agents communicate via structured commands detected in their output:

```
<!-- CREATE_AGENT {"role": "developer", "model": "...", "task": "..."} -->
<!-- DELEGATE {"to": "agent-id", "task": "...", "context": "..."} -->
<!-- AGENT_MESSAGE {"to": "agent-id", "content": "..."} -->
<!-- CREATE_GROUP {"name": "...", "members": ["id1", "id2"]} -->
<!-- BROADCAST {"content": "..."} -->
<!-- DECISION {"title": "...", "rationale": "...", "alternatives": [...]} -->
<!-- PROGRESS {"summary": "...", "completed": [...], "in_progress": [...]} -->
<!-- COMPLETE_TASK {"summary": "..."} -->
<!-- QUERY_CREW -->
```

### UI Views

| View | Description |
|------|-------------|
| **Lead Dashboard** | Chat with the lead, decisions panel (always visible), team/comms/groups/DAG/activity tabs |
| **Agents** | Unified list with hierarchy, model selector, plan progress, agent controls |
| **Settings** | Concurrency limits, model defaults, custom roles |

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS 4, Zustand, ReactFlow, Lucide
- **Backend**: Node.js, Express, ws, node-pty
- **Database**: SQLite (WAL mode, Drizzle ORM) with optimized pragmas (`busy_timeout`, `foreign_keys`, `synchronous=NORMAL`)
- **Validation**: Zod schemas on all API routes
- **Agent Protocol**: ACP (Agent Communication Protocol) with streaming command detection
- **Events**: Typed event bus (TypedEmitter) with 27 strongly-typed events

## Screenshots

<img width="3164" height="1598" alt="image" src="https://github.com/user-attachments/assets/bcf9bb15-be17-4f53-9347-d044dbc0871c" />

