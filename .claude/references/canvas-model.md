# Reference · Canvas model

Spatial canvas with pan, zoom, and per-window drag+resize. Think Figma with xterm.js terminals as the frames.

## State

`src/renderer/src/state/canvas.ts` — single zustand store per IDE instance, bound to a workspace via `use-canvas-persistence`.

```ts
type Camera = { x: number; y: number; zoom: number }  // zoom clamped 0.3–2.5
type CanvasWindow = {
  id: string
  tmuxWindow: string        // stable target, survives restart
  sessionId: string | null  // ephemeral ptyId; null = dormant
  title: string
  x: number; y: number
  width: number; height: number
  zIndex: number
}
```

`camera.{x,y}` is the translate in viewport pixels; `camera.zoom` is the scale factor. `windows[].{x,y,w,h}` are in world coordinates.

## Viewport ↔ world transform

Outer viewport has `overflow: hidden`. Inner world div:

```css
transform: translate3d(camera.x, camera.y, 0) scale(camera.zoom);
transform-origin: top left;
```

World-from-viewport conversion:

```ts
worldX = (viewportX - camera.x) / camera.zoom
worldY = (viewportY - camera.y) / camera.zoom
```

## Zoom around cursor

Keep the world point under the cursor fixed while changing zoom:

```ts
const world = worldFromViewport(vx, vy, camera)
const next = clamp(camera.zoom * factor, 0.3, 2.5)
camera.x = vx - world.x * next
camera.y = vy - world.y * next
camera.zoom = next
```

## Pan

- Empty-viewport left-drag and middle-drag pan the camera.
- Pan **only** starts when `ev.target === viewportRoot`. Otherwise `setPointerCapture` on the viewport steals pointerup from child buttons and their clicks never fire (see `../rules/ui.md`).
- Shift+wheel pans as an alternative to zoom.

## Window drag/resize

`src/renderer/src/components/canvas/window-frame.tsx`:

- Titlebar `onPointerDown` captures the pointer on the titlebar element, tracks deltas, divides by `camera.zoom` before applying to `x/y`.
- SE corner handle does the same for `width/height` (min 320×180).
- `focusWindow(id)` on any pointerdown bumps zIndex via store counter.

## Persistence

`src/renderer/src/hooks/use-canvas-persistence.ts`:

- Subscribes to the store, debounces writes 500ms, saves to `~/.cc-ide/canvas/<workspaceId>.json` via `canvas:save`.
- On workspace switch: saves outgoing state with the OLD id (via `lastBoundRef`), loads new via `canvas:load`, hydrates with `sessionId: null` for all windows, then calls `rehydrateLiveSessions` which spawns fresh viewer ptys for windows whose tmux target still exists.
- Unmount flushes one last save.

`snapshot()` omits `sessionId` when serializing (ephemeral). `hydrate()` restores camera + windows with all `sessionId`s nulled out; rehydration fills them in.

## Dormant windows

A window with `sessionId === null` renders a "dormant · &lt;tmuxWindow&gt;" placeholder (see `xterm-window.tsx`). Rehydration turns them live; if the underlying tmux window is gone, they stay dormant until the user closes them.
