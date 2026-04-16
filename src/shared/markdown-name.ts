export type NameValidation = { ok: true } | { ok: false; reason: string }

// Validates a filename meant to live inside the plans/prompts trees.
// Files MUST end in `.md` — Claude reads them as markdown, and silently
// renaming to another extension would break the drop flow.
export function validateMarkdownFilename(name: string): NameValidation {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'name is required' }
  if (trimmed.includes('/')) return { ok: false, reason: 'no slashes in filename' }
  if (!/\.md$/i.test(trimmed)) return { ok: false, reason: 'must end in .md' }
  if (trimmed === '.md') return { ok: false, reason: 'name before .md is required' }
  return { ok: true }
}

export function validateFolderName(name: string): NameValidation {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'name is required' }
  if (trimmed.includes('/')) return { ok: false, reason: 'no slashes in folder name' }
  return { ok: true }
}
