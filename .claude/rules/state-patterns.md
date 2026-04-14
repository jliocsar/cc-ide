# Rule · State patterns (zustand + persistence)

These patterns exist because breaking them has already burned us in this project. Read `references/lessons.md` for the incident history.

## Selector stability

Never return a fresh object/array from a zustand selector if the store's raw value is absent.

Wrong — causes an infinite render loop because a new `[]` is created on every render:

```ts
const ranges = useReviewComments((s) => s.byTab[tabId] ?? [])
```

Right — stable reference when absent:

```ts
import { EMPTY_RANGES } from '@/state/review-comments'
const ranges = useReviewComments((s) => s.byTab[tabId] ?? EMPTY_RANGES) as RangeDraft[]
```

Or select a primitive instead of an array:

```ts
const rangeCount = useReviewComments((s) => s.byTab[tabId]?.length ?? 0)
```

`EMPTY_RANGES` is `Object.freeze([])` at module scope. This pattern applies to any store that exposes a keyed map of arrays.

## Controlled-form reset scope

When a component syncs server state into local form state via `useEffect`, depend **only on the identity** that defines which record is being edited. Depending on its fields clobbers whatever the user is typing, because commit-on-blur updates the record which re-fires the effect.

Wrong — re-mounts the form every keystroke after a commit:

```ts
useEffect(() => {
  setTitle(prompt?.title ?? '')
  setBody(prompt?.body ?? '')
}, [prompt?.id, prompt?.title, prompt?.body])
```

Right:

```ts
useEffect(() => {
  setTitle(prompt?.title ?? '')
  setBody(prompt?.body ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [prompt?.id])
```

## Per-workspace persistence

Follow the shape in `src/renderer/src/hooks/use-canvas-persistence.ts`:

- Subscribe to the store. Debounce saves (~500ms).
- On workspace switch: save the outgoing workspace with its own id (not the incoming id), then load the new one.
- Use a `suspendSave` flag that flips false only after hydrate completes, so hydration-triggered updates don't trigger a save with the freshly hydrated data.
- Unmount saves one last time.

## Event bridges

Main → renderer streaming uses `BrowserWindow.getAllWindows().forEach(win => win.webContents.send(channel, payload))` from `src/main/modules/pty-manager.ts`. Event channel schemas live in `eventChannels` in `src/shared/ipc.ts`, separate from request/response channels.

Renderer subscribes with `onEvent('pty:data', listener)` — a typed wrapper over `ipcRenderer.on` exposed via preload. Always return the unsubscribe function from `useEffect`.
