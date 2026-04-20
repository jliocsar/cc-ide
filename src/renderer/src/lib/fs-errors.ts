// Translate raw fs error messages from main-process IPC into
// user-facing strings. The node error messages leak paths and error
// codes ("ENOENT: no such file or directory, open '…'") which are noisy
// on a dormant tab after the user changed `settings.workspace.dataRoot`.
export function friendlyFsError(err: unknown, relPath?: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/\bENOENT\b/.test(raw)) {
    return relPath ? `File doesn't exist: ${relPath}` : "File doesn't exist"
  }
  if (/\bEACCES\b/.test(raw)) {
    return relPath ? `Permission denied: ${relPath}` : 'Permission denied'
  }
  if (/\bEISDIR\b/.test(raw)) {
    return relPath ? `Expected a file, got a directory: ${relPath}` : 'Expected a file'
  }
  return raw
}
