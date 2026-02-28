# Quick Start

## Prerequisites

- Node.js 20+
- npm 10+
- [GitHub Copilot CLI](https://docs.github.com/en/copilot) installed and authenticated

## Installation

```bash
git clone https://github.com/justinc/ai-crew.git
cd ai-crew
npm install
```

## Running

Start both the server and web UI in development mode:

```bash
npm run dev
```

Or start them separately:

```bash
npm run dev:server   # http://localhost:3001
npm run dev:web      # http://localhost:5173
```

## Creating Your First Project

1. Open the web UI at `http://localhost:5173`
2. The **Lead Dashboard** is the default view
3. Click **Create Project**
4. Provide a name, task description, and optionally a working directory
5. Select a model for the Project Lead (defaults to Claude Opus 4.6)
6. The lead will analyze the task, create agents, and start delegating

## Interacting with Agents

### Sending Messages

- **Queue** (default, press Enter): Message is queued and delivered when the agent is ready
- **Interrupt**: Message interrupts the agent's current work immediately

### Agent Controls

| Control | Effect |
|---------|--------|
| ✋ Interrupt | Sends ACP cancel signal — aborts current work |
| ■ Stop | Kills the agent process |
| ↻ Restart | Available for completed/failed agents |

### Changing Models

Select a different AI model from the dropdown in the agents list. The change takes effect on the next task.

## Building for Production

```bash
npm run build
npm run start --workspace=packages/server
```

The web UI is built to `packages/web/dist/` and served by the Express server.
