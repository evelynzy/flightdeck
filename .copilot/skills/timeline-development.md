# Timeline Component Development

The Timeline is the most complex UI component in Flightdeck. This document captures every lesson learned during its development — scroll behavior, layout, replay, SVG theming, and testing patterns.

---

## Scroll & Zoom

### Decoupled Scroll Axes

The #1 usability bug was coupled scroll axes — vertical mouse wheel caused horizontal movement. The fix (commit bc503bd) decouples them completely:

```
deltaY (plain wheel)      → Vertical scroll only (let browser handle natively)
Shift+wheel / deltaX      → Horizontal pan (when zoomed in)
Ctrl+wheel / Meta+wheel   → Zoom (time axis)
```

**Implementation pattern** (in the wheel handler):

```tsx
const handleWheel = useCallback((e: React.WheelEvent) => {
  // Ctrl+wheel = zoom
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoomLevel(prev => {
      const next = e.deltaY < 0 ? prev * 1.15 : prev / 1.15;
      return Math.max(1, Math.min(50, next));
    });
    return;
  }

  // Shift+wheel or trackpad horizontal = horizontal pan (only when zoomed)
  if (zoomLevel > 1) {
    const horizontalDelta = e.shiftKey ? e.deltaY : e.deltaX;
    if (horizontalDelta !== 0) {
      e.preventDefault();
      setPanOffset(prev => Math.max(0, Math.min(1, prev + horizontalDelta * 0.002)));
      return;
    }
  }

  // Plain vertical scroll: DO NOT call preventDefault — let browser handle
}, [zoomLevel]);
```

**Critical**: The wheel event listener must use `{ passive: false }` when added via `addEventListener`. React's `onWheel` prop is passive by default — calling `preventDefault()` on it triggers console warnings. Use `useEffect` with `addEventListener` instead.

### Zoom Controls

- **Range**: 1× to 50×
- **Wheel multiplier**: 1.15× per tick (smooth feel)
- **Button multiplier**: 1.5× per click (bigger steps)
- **Fit button**: Resets to `zoomLevel=1, panOffset=0`
- **Pan offset resets** automatically when zooming out to ≤1.05×
- **Zoom anchors** to cursor position when using scroll wheel

### Drag-to-Pan

Only active when `zoomLevel > 1`. Uses pointer events (not mouse events) for touch support:

```tsx
const isDraggingRef = useRef(false);
const dragStartXRef = useRef(0);
const dragStartOffsetRef = useRef(0);
```

1. `handlePointerDown` — captures pointer, stores start position
2. `handlePointerMove` — converts pixel delta to panOffset fraction: `dx * msPerPx / maxOffsetMs`
3. `handlePointerUp` / `handlePointerCancel` — clears drag state

Cursor shows `cursor-grab` (idle) → `cursor-grabbing` (dragging).

### Arrow Key Navigation

- **↑/↓** — Move focus between agent lanes (`focusedLaneIdx` state)
- **Enter/Space** — Toggle expand/collapse on focused lane
- **Escape** — Clear lane focus
- **Tab/Shift+Tab** — Move between lanes (natural tab order)
- **f** — Focus the filter bar (dispatches `timeline:focus-filter` custom event)
- **?** — Toggle keyboard shortcut help overlay
- **+/−** — Zoom in/out
- **Home** — Fit all to view
- **End** — Jump to most recent 20% of timeline

---

## Layout

### Swim Lane Sizing

Lanes scale with agent count to prevent cramming:

```tsx
const MIN_CHART_WIDTH = Math.max(600, sortedAgents.length * 80);
const chartWidth = Math.max(containerWidth - LABEL_WIDTH, MIN_CHART_WIDTH);
```

- **Base minimum**: 600px
- **Per-agent**: 80px minimum per lane
- **Label column**: Fixed 180px on the left
- **Horizontal scrollbar** appears automatically when `chartWidth > containerWidth` (via parent `overflow-x-auto`)

This was added in commit 7b71bdb after 10+ agent sessions rendered unreadably narrow lanes.

### SVG ViewBox Alignment

**Bug**: SVG `viewBox` stretching caused Gantt bars to misalign with time axis labels.

**Fix**: Set explicit `width` and `height` attributes on the SVG element matching the container dimensions. Don't rely on `viewBox` alone — it causes proportional scaling that breaks pixel-aligned layouts.

```tsx
<svg
  width={chartWidth}
  height={totalHeight}
  viewBox={`0 0 ${chartWidth} ${totalHeight}`}
>
```

### Container Height Calculation

For small task/agent counts, the container was either too tall (wasted space) or too short (clipped). Formula:

```
totalHeight = headerHeight + (agentCount * laneHeight) + footerPadding
```

Where `laneHeight` includes the status bar, communication link space, and padding.

### Time Axis Label Overlap

When zoomed in, axis labels can overlap. The visx `AxisTop` component handles tick reduction, but at extreme zoom levels, labels still cluster. Use `tickFormat` with `timeFormat` to show appropriate precision:
- Zoomed out: `HH:mm`
- Zoomed in: `HH:mm:ss`
- Very zoomed: `HH:mm:ss.SSS`

Debounce the zoom window label updates to avoid flicker during rapid zooming.

---

## Session Replay

### State Lifting

**Critical pattern**: Replay state lives in `TimelinePage`, NOT in `TimelineContainer`.

```tsx
// TimelinePage.tsx — owns replay state
const replayLeadId = (!liveMode && effectiveLeadId) ? effectiveLeadId : null;
const replay = useSessionReplay(replayLeadId);
```

Replay data flows DOWN to `TimelineContainer` and `ReplayScrubber` as props. If you put replay state inside the visualization component, you get re-render cascades and stale closures.

### Progressive Reveal

During replay, the timeline only shows events up to `currentTime`:
- Filter `agents` to only those spawned before `currentTime`
- Clip `segments` that extend past `currentTime` (partial visibility)
- Filter `communications` to only those sent before `currentTime`
- Filter `locks` to only those acquired before `currentTime`

### Sticky Scrubber Bar

The replay scrubber must ALWAYS be visible at the bottom. It's placed OUTSIDE the scrollable area using flex layout:

```tsx
<div className="flex flex-col h-full">
  {/* Scrollable timeline */}
  <div className="flex-1 min-h-0 overflow-auto">
    <TimelineContainer ... />
  </div>

  {/* Scrubber — shrink-0 keeps it visible */}
  <div className="shrink-0 border-t border-th-border-muted bg-th-bg px-4 py-2">
    <ReplayScrubber leadId={leadId} replay={replay} />
  </div>
</div>
```

**Bug** (commit a95dfc0): The scrubber was originally INSIDE the scrollable container. `overflow-hidden` on the parent clipped it. Fix: Move it outside the scrollable area and use `shrink-0` to guarantee space.

### Speed Options

Default speed is **4×** (commit 6eaed3a) — 1× was too slow for reviewing sessions. Available speeds: 1×, 2×, 4× (default), 8×, 16×, 32×.

### Auto-Switch to Replay Mode

When no live agents exist but historical projects do, automatically disable live mode (commit 28d7d9d):

```tsx
useEffect(() => {
  if (leads.length === 0 && projects.length > 0 && liveMode) {
    setLiveMode(false);
  }
}, [leads.length, projects.length, liveMode]);
```

### Removed: ShareDropdown

The ShareDropdown (Reels, Copy Link, Export) was removed — these were non-functional dead features. Don't re-add sharing UI unless the backend actually supports it.

---

## SVG Theming

### The Problem

CSS custom properties (`var(--color-name)`) do NOT reliably reach SVG `<text>` elements' `fill` attribute. Tailwind classes also don't work on SVG text. This affects ALL chart components, not just Timeline.

### The Solution

Use CSS variables through the `fill` prop directly — the Timeline uses graph-scoped CSS variables:

```tsx
// visx axis labels
tickLabelProps={() => ({
  fill: 'var(--graph-text-muted)',
  fontSize: 10,
  fontFamily: 'monospace',
  textAnchor: 'middle',
})}
```

If CSS variables don't reach the SVG context (e.g., in deeply nested SVG groups), fall back to hardcoded hex: `#9ca3af` for muted text on dark backgrounds, `#6b7280` for secondary text.

### Status & Role Colors

Agent lane colors use CSS variables: `var(--st-creating)`, `var(--st-running)`, `var(--st-idle)`, etc. Role colors: `var(--role-lead)`, `var(--role-architect)`, etc. Each agent also gets a deterministic lane border color from an 8-color WCAG AA palette via `getAgentColor(agentId)`.

---

## React Patterns

### Avoid useMemo + setState

Canvas edges used `useMemo` that called `setState` internally — this is an anti-pattern that causes infinite render loops. Use `useEffect` instead when a computation needs to update state.

### Memoize Lane Components

`TimelineRow` (individual agent lanes) should be memoized with `React.memo` to prevent re-renders during scroll/zoom. The parent re-renders on every scroll event — without memoization, ALL lanes re-render.

### Passive Event Listeners

When adding wheel handlers that call `preventDefault()`, you MUST use:

```tsx
useEffect(() => {
  const el = containerRef.current;
  el?.addEventListener('wheel', handler, { passive: false });
  return () => el?.removeEventListener('wheel', handler);
}, [handler]);
```

React's `onWheel` is passive — `preventDefault()` inside it triggers browser warnings and doesn't actually prevent default behavior.

---

## Historical Data

### REST API Fallback

When no live WebSocket agents are connected, Timeline loads data from REST:
1. `useProjects()` fetches project list from `/api/projects`
2. `useHistoricalAgents(projectId)` derives agent roster from spawn/exit keyframes
3. `useSessionReplay(leadId)` loads keyframes for replay

### ProjectTabs

The `<ProjectTabs>` component shows both live and historical projects:
- **Live projects**: Green dot indicator, data from WebSocket
- **Historical projects**: No dot, data from REST API
- **Deduplication**: Projects appearing in both live and historical are shown once

### Keyframe Scoping

All keyframe queries MUST be scoped by `projectId`. Without scoping, multi-project sessions mix data from different projects. This was a P2 bug (commit 74f57f4).

---

## Common Pitfalls

1. **overflow-hidden clips sticky/fixed children** — Never nest sticky controls inside a container with `overflow-hidden`. Use flex layout with `shrink-0` siblings instead.

2. **Coupled scroll axes feel broken** — Always decouple vertical (browser-native) from horizontal (custom handler). Users expect mouse wheel = vertical scroll.

3. **Replay state must be in the data owner** — Put `useSessionReplay` in the page component that owns the data, not in the visualization component that renders it.

4. **SVG viewBox stretching** — Always set explicit `width` and `height` on SVG elements. `viewBox` alone causes proportional scaling that breaks alignment.

5. **Time window labels flicker during zoom** — Debounce label updates. `useMemo` on `visibleRange` prevents recomputation on every pixel of wheel delta.

6. **Agent lane colors must be deterministic** — Use `getAgentColor(agentId)` (hash-based) so the same agent always gets the same color across page loads.

7. **Test wheel events need `{ passive: false }`** — In tests, use `addEventListener` mocks or `fireEvent` with proper event construction. `userEvent` doesn't support wheel events well.

---

## Testing

The Timeline has **240+ tests** across 13 test files covering:

| Area | Tests | Coverage |
|------|-------|----------|
| E2E data pipeline | 61 | Segment rendering, tooltips, filtering, comms, brush, live mode |
| SSE connection | 31 | Stream handling, fragment parsing, retry logic |
| Accessibility | 30 | ARIA labels, keyboard nav, screen reader announcements |
| Status bar | 20 | Health indicators, error counts, badges |
| Since-last-visit | 23 | Event tracking, localStorage persistence |
| Zoom & pan | 16 | Wheel zoom, button zoom, pan boundaries, time labels |
| Error banner | 13 | Error display, scroll-to-error |
| Keyboard help | 11 | Help dialog rendering |
| Empty state | 8 | No-data rendering |
| Agent colors | 7 | Color assignment, determinism |
| Time formatting | 6 | Relative/absolute formatting |
| Drag-to-pan | 6 | Pointer events, constraints |
| Brush selector | 10 | Time range calculations |

Run with: `cd packages/web && npx vitest run src/components/Timeline/`

---

## Key Commits

| Commit | Change |
|--------|--------|
| a321985 | Zoom controls (+/−/Fit, Ctrl+wheel, 1-50× range) |
| 314905f | Drag-to-pan with pointer events |
| bc503bd | **Scroll axis decoupling** — the most impactful UX fix |
| a95dfc0 | Sticky scrubber bar (moved outside scrollable container) |
| 6eaed3a | Default replay speed changed from 1× to 4× |
| 7b71bdb | Horizontal overflow for 10+ agent sessions |
| 28d7d9d | Auto-switch to replay mode for historical sessions |
| 74f57f4 | Keyframe scoping by projectId (P2 bug fix) |
| 0483145 | Animation timing fix |
