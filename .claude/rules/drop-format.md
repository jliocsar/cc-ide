# Rule · Drop format contract (load-bearing)

The drop format is the contract between the IDE and whatever Claude instance receives the paste. It is versioned and rigid. Any change is a breaking change and must be coordinated with downstream tooling.

## The format

```
@<path>
@@ start,len @@
<comment>
@@ start,len @@
<comment>
```

- Path line: single `@` prefix, then the path with no escaping or quoting, even when it contains spaces.
- For plans: path is `.cc-ide/plans/<rel>.md`.
- For diffs: path is the repo-relative file path.
- Hunk headers: always emit `@@ start,len @@`, including when `len === 1` (write `,1` explicitly).
- No blank line between `@<path>` and the first `@@`.
- No blank line between hunks.
- Ranges within a file in ascending `start` order. Sort input if not already sorted (stable sort — preserve insertion order for equal `start`).
- Files with zero ranges are skipped silently. All-empty input returns the empty string (no trailing newline).
- Multi-file payloads sorted lexicographically by path.
- Comment bodies are emitted verbatim. No escaping of backticks, `@@`-like substrings, or embedded newlines.
- An empty-string comment still emits its header + an empty comment line.

## Implementation

Canonical implementation: `src/shared/comment-serializer.ts` (`serializeComments(files: CommentFile[]): string`).

Golden tests: `src/shared/comment-serializer.test.ts` — 11 cases lock the format. Run `pnpm test` before claiming any change to the serializer works. If you want to adjust the contract, update the golden tests in the same commit and cite why.

## Using it from the UI

When a plan/diff is dragged into a terminal, the renderer builds the drop string via `src/renderer/src/lib/drop-payload.ts`:

- `buildDropString(payload, ranges)` wraps `serializeComments` and handles the no-ranges case: `@<path>\n`.
- Drag sources set a custom MIME `application/x-cc-ide-drop` with a typed `DropPayload`.
- `XtermWindow` is the only drop target today; it reads the payload, fetches the tab's ranges via `useReviewComments.getState().ranges(tabId)`, pastes via `pty:write`, then clears comments for that tab.

Comments are in-memory only. Flushed on successful drop, discarded on tab close. Do not persist them to disk.
