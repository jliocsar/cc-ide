# Reference · Lessons learned

Bugs we hit, and why they happened. Future you, memorize these — they don't show up in any test but they waste hours.

## 1. Preload path mismatch

`BrowserWindow` was pointed at `preload/index.js`. electron-vite emits `preload/index.mjs`. Result: preload never loaded, `window.ccIde` was undefined, every IPC call silently rejected.

Fix: `src/main/index.ts` uses `../preload/index.mjs`.

Moral: when IPC seems to "fail silently", check if preload is actually loading. Dev tools are auto-opened in dev (also added during this incident) so you can see these rejections immediately.

## 2. Shadcn alias resolution on non-standard layouts

`pnpm dlx shadcn@latest add button` initially created literal `./@/components/ui/button.tsx` — a folder named `@`, not a tsconfig alias. Root cause: shadcn looks at the project's `tsconfig.json` for `paths`; our `paths` lived only in `tsconfig.web.json` referenced from the root, which shadcn couldn't see.

Fix: `tsconfig.json` now has a `compilerOptions.paths` block mirroring the real aliases. Shadcn writes files correctly now.

Moral: shadcn reads the ROOT tsconfig.

## 3. Canvas pan handler hijacking child clicks

Viewport `onPointerDown` called `setPointerCapture(ev.pointerId)` unconditionally. Pointer capture reroutes subsequent pointer events (including pointerup) to the capturing element — so child buttons never saw a matching pointerdown/up pair and `click` events never fired. Spawn, zoom, and reset buttons all looked dead.

Fix: pan only starts when `ev.target === hostRef.current`. See `src/renderer/src/components/canvas/canvas.tsx::onViewportPointerDown`.

Moral: be very careful with pointer capture on container elements. Prefer delegating to a specific "empty space" sensor, or gate on target identity.

## 4. Shadcn Dialog needs forwardRef on React 18

The current shadcn template ships `Dialog*` helpers as plain function components. Radix's internal `Slot` machinery attaches refs, and in React 18 a plain function component warns: "Function components cannot be given refs."

Fix: wrap `DialogTrigger`, `DialogClose`, `DialogOverlay`, `DialogContent`, `DialogTitle`, `DialogDescription` in `React.forwardRef`. `src/renderer/src/components/ui/dialog.tsx` now does this. Do not regenerate this file from shadcn without re-applying the pattern (or upgrading to React 19).

Also: every `DialogContent` needs a `DialogDescription` or the a11y warning fires. Use `className="sr-only"` if the description shouldn't render.

## 5. Controlled form state reset clobbers typing

`PromptEditor` was:

```ts
useEffect(() => {
  setTitle(prompt?.title ?? '')
  setBody(prompt?.body ?? '')
}, [prompt?.id, prompt?.title, prompt?.body])
```

Blur-commit fires → store updates `prompt.title` → effect reruns → `setBody('')` wipes the body the user just typed.

Fix: depend only on `prompt?.id`. When switching records, sync; otherwise leave local state alone. Documented in `rules/state-patterns.md`.

## 6. Zustand selector returns fresh `[]` → infinite loop

```ts
const ranges = useReviewComments((s) => s.byTab[tabId] ?? [])
```

When `s.byTab[tabId]` is undefined, the selector returns a brand-new array every render. zustand compares results by identity, sees "changed", schedules a re-render, loop. React's "Maximum update depth exceeded" kills the tree and the screen goes black.

Fix: module-scope `EMPTY_RANGES = Object.freeze([])` + the selector returns that stable reference. Or select a primitive. Pattern is documented in `rules/state-patterns.md`. All call sites fixed, but new stores need to follow the pattern.

**Recurrence 2026-04-14:** `DiffsForWorktree` had `useSidebarData((s) => s.diffsByWorktree[worktree.path] ?? [])`. Symptom fired only when a second worktree was added (first render cycle populates, subsequent missing key for the new row tripped the loop). Fixed by exporting `EMPTY_FILES` from `sidebar-data.ts` and using it in the selector.

## 7. `node-pty` native ABI vs Electron ABI

`node-pty` compiles against the Node ABI at install time. Electron uses its own ABI (based on the Chromium version, not the system Node). Running without a rebuild yields `NODE_MODULE_VERSION mismatch` the moment you `require('node-pty')` in main.

Fix: `@electron/rebuild` in `postinstall` with `-f -w node-pty`. Also pinned `pnpm.onlyBuiltDependencies` so fresh installs invoke it. If you add another native dep, add it to that list and rebuild.

## 8. Grouped tmux sessions for viewer isolation

Two canvas windows trying to view different tmux windows from the same `attach-session -t <primary>` fought over the selected window — tmux clients attached to the same session share window focus by default.

Fix: one "grouped" session per viewer (`tmux new-session -d -s <viewer> -t <primary>`), each with its own `select-window`. Each pty attaches to its viewer, not the primary. `onExit` cleans up the viewer session without touching the primary.

Moral: for any future "multiple simultaneous views of the same tmux window set", reach for grouped sessions.

## 9. agent-browser can't reach elements inside `draggable={true}`

During live debug, `agent-browser click @e32` (a plan file button wrapped in a draggable div) silently no-ops — HTML5 drag-and-drop initialization swallows the click. Works fine for a real user.

Workaround: use `agent-browser eval` + DOM `querySelector` + `.click()` when the target is draggable. Don't change the code.

## 10. `pnpm create` with piped answers

The scaffold CLI handles interactive input in a way that line-buffers oddly when stdin is a pipe. Characters got concatenated across prompts instead of being answered one per field. Faster: skip the scaffold, write files by hand from the known electron-vite template.

Moral: pick your battles with interactive CLIs. If it's 12 files, copy them.
