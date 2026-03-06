# Features Overview

Flightdeck ships 33+ features across three phases. This page provides a quick reference to everything available.

## Phase 2 — Core Observability & Control

These features provide real-time visibility into your agent crew and give you controls to guide their work.

### Agent Canvas
Interactive node-based visualization of your agent crew using ReactFlow. Nodes represent agents, edges show communication flows (messages, delegations, broadcasts). Drag to rearrange, zoom in/out, or use auto-layout. Color-coded by agent status.

→ [Canvas View Guide](/guide/canvas-view)

### Batch Approval
Approve or reject multiple pending agent actions at once. When agents request permission for file writes or shell commands, batch approval lets you review and act on all pending items from a single panel instead of one at a time.

### The Pulse
A compact horizontal status strip at the top of every page showing real-time crew health: active agents, token usage, budget spend, context pressure, recovery status, predictions, PRs, and conflicts — all at a glance.

### Token Pressure Gauge
Visual context window usage indicator per agent. Shows how much of an agent's context window is consumed, with color-coded warnings (green → amber → red) as agents approach their limit.

### Focus Agent Panel
Deep-dive view for any single agent: current task, recent messages, file diffs, pending decisions, and activity timeline. Click any agent in the Canvas or agent list to open their Focus panel.

### Session Replay
Scrub through past sessions like a video timeline. Keyframes capture agent state, messages, and DAG changes. Adjustable playback speed (0.5x–4x). Share replays via tokenized links.

### Decision Queue
Review and respond to agent decisions requiring human input. Each decision shows context, options, and impact. Approve, reject, or provide custom feedback.

### Cost Analytics
Track token usage and estimated costs by agent, by task, or by session. Charts show spend over time. Set budget limits with alerts when approaching thresholds.

### Coordination Timeline
Chronological view of all inter-agent events: messages sent, tasks delegated, files locked, code reviewed. Filter by agent or event type.

## Phase 3 — Automation & Trust

These features let you automate agent behavior and build trust in autonomous operation.

### Playbook System
Reusable session templates that define goals, roles, and starter tasks. Select a playbook to launch a pre-configured crew. Create custom playbooks from successful sessions.

→ [Community Playbooks Guide](/guide/playbooks)

### Intent Rules
'When agent wants to X, automatically Y' rules. Define trust levels per action type: auto-approve, require confirmation, or block. Comes with presets (Cautious, Balanced, Autonomous).

### Notification Channels
Configure how and when you receive alerts: in-app notifications, desktop notifications, sound alerts. Set per-event-type preferences (e.g., only alert on errors, not routine progress).

### Recovery System
Automatic agent crash recovery with configurable strategies. When an agent fails, the system can auto-restart, reassign tasks, or alert you. Includes handoff briefings so replacement agents have full context.

### Handoff Briefings
When a crashed agent is replaced, the new agent receives a structured briefing: what the previous agent was doing, files it had locked, progress made, and remaining work.

### Budget Controls
Set spending limits per session or per agent. Automatic pausing when budgets are exceeded. Visual budget progress bar with configurable warning thresholds.

## Phase 4 — Intelligence & Community

The final phase adds predictive intelligence, workflow automation, and community features.

### Command Palette V2
The ⌘K command palette is the brain of the product. Fuzzy search (Fuse.js) across all entities — agents, tasks, routes, settings. AI-powered suggestions surface context-aware actions. Natural language commands. Preview panel shows details before executing. Recent commands on empty query.

→ [Command Palette Guide](/guide/command-palette)

### Natural Language Crew Control
30 NL commands across 4 categories (control, query, navigate, create). Type "pause all agents" or "show me running tasks" directly in ⌘K. Pattern matching — no LLM required. Mandatory preview for destructive commands. Undo stack with 5-minute TTL.

→ [Command Palette Guide](/guide/command-palette)

### Smart Onboarding
Three-layer onboarding system. QuickStart: playbook selection as first-run experience (productive in <60 seconds). SpotlightTour: 6-step overlay highlighting real UI elements. Progressive Route Disclosure: sidebar starts with 4 items, grows to 11 as mastery develops. Contextual Coach: behavior-triggered tips.

→ [Onboarding Guide](/guide/onboarding)

### Predictive Intelligence
Six prediction types using linear extrapolation: context exhaustion, cost overrun, agent stall, task duration, completion estimate, file conflict. Confidence scoring. Predictions Panel widget, Pulse micro-indicators, Canvas overlays (dashed rings, pulsing edges, stall badges). Accuracy tracking.

→ [Predictions Guide](/guide/predictions)

### Workflow Automation
'When X then Y' rule engine. 12 event triggers × 12 action types. Sentence builder UI. 12 pre-built templates in 4 categories. Dry Run testing. Activity log with one-click 'Disable rule' safety valve. Predictions can trigger workflow rules.

→ [Workflows Guide](/guide/workflows)

### GitHub Integration
PAT-based GitHub connection. Create PRs with auto-generated descriptions. CI status panel with per-check rendering. Commit-to-task linking with timeline pins. Draft PR default for safety. Graceful degradation when not connected.

→ [GitHub Integration Guide](/guide/github-integration)

### Conflict Detection
Four detection levels: same directory, import overlap, lock contention, branch divergence. Real-time scanning. Conflict detail panel with 4 resolution options. Canvas conflict edges (amber/red). Integration with workflow triggers and predictions.

→ [GitHub Integration Guide](/guide/github-integration)

### Mobile PWA
Progressive Web App with offline support. Bottom tab navigation (Home, Tasks, Agents, Timeline, More). Swipe-to-approve cards with haptic feedback. Mobile-optimized agent cards. Bottom-sheet command palette. Install prompt and offline banner.

→ [Mobile PWA Guide](/guide/mobile)

### Custom Role Builder
Create custom agent roles with visual editor. Emoji and color picker. Model selection with comparison cards. Prompt templates across 6 categories. Live preview card. Test role with dry-run before deploying.

→ [Community Playbooks & Roles Guide](/guide/playbooks)

### Community Playbooks
Browse, search, and fork community-shared playbooks. Star ratings and reviews. Publish your own with privacy guardrails (no system prompts or secrets). Version tracking with update notifications and diff view.

→ [Community Playbooks Guide](/guide/playbooks)
