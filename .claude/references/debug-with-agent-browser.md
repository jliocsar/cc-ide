# Reference · Debugging the live Electron app with agent-browser

Electron's renderer is Chromium and exposes CDP when the main process appends `--remote-debugging-port`. This is already wired in dev mode at `src/main/index.ts`:

```ts
if (is.dev) app.commandLine.appendSwitch('remote-debugging-port', '9223')
```

So `pnpm dev` exposes the renderer at `http://127.0.0.1:9223`. Production builds don't.

## Attaching

```bash
agent-browser connect 9223
agent-browser get url     # should print http://localhost:5173/
agent-browser get title   # should print cc-ide
```

Keep the connection alive across commands; a daemon persists it. `agent-browser close` disconnects.

## Console capture

Install a capture hook whenever you reload the page — console history is wiped on reload:

```bash
agent-browser eval 'location.reload()'
sleep 3
agent-browser eval --stdin <<'EVAL'
(() => {
  window.__capturedErrors = []
  const wrap = (orig, kind) => (...args) => { window.__capturedErrors.push({ kind, args: args.map(a => { try { if (a instanceof Error) return { name: a.name, message: a.message, stack: a.stack }; return typeof a === 'string' ? a : JSON.stringify(a) } catch { return String(a) } }) }); orig.apply(console, args) }
  console.error = wrap(console.error, 'error')
  console.warn = wrap(console.warn, 'warn')
  window.addEventListener('error', (e) => window.__capturedErrors.push({ kind: 'window-error', message: e.message }))
  window.addEventListener('unhandledrejection', (e) => window.__capturedErrors.push({ kind: 'unhandled-rejection', reason: String(e.reason) }))
  return 'ok'
})()
EVAL
```

Then dump whenever useful:

```bash
agent-browser eval 'JSON.stringify(window.__capturedErrors, null, 2)'
```

## Interaction gotchas

- `agent-browser click @eN` sometimes fails to reach elements inside `draggable={true}` containers — the custom MIME drag handshake can swallow the click. Fall back to a DOM query + `.click()` via `agent-browser eval`.
- `agent-browser fill` fires native input events; shadcn controlled inputs work. But if a commit-on-blur handler re-sets the value back (state reset on parent re-render), the text may appear to disappear — that's a logic bug, not an automation bug (see `lessons.md`).
- Shadcn Accordion triggers are rendered as a `button` with text content exactly `"Plans"`, `"Sessions"`, etc. (Title-Case, not the visible uppercase). Select by textContent, not by heading text.

## Flow sanity checklist

When verifying a build after changes, walk at minimum:

1. Reload, install capture, wait for mount; errors should be `[]`.
2. `Ctrl+K` opens palette; Escape closes. No warnings.
3. Open Prompts → create/edit/delete a prompt; body persists across blur.
4. Expand Plans accordion → New plan → open → click a line → shift-click another → add a comment → badge shows count on sidebar row.
5. Spawn Claude from canvas toolbar → xterm renders `claude` TUI.
6. Drag the plan tab into the xterm window → `drop to paste` overlay → drop → comments pasted and cleared.
7. Click × on the live window → Detach/Kill dialog.
8. Pan empty canvas, zoom via wheel, resize a window by SE corner.

After each flow: `JSON.stringify(window.__capturedErrors)` should be `[]`.

## Disconnecting

```bash
agent-browser close
```

Leaves the Electron app running; just disconnects CDP.
