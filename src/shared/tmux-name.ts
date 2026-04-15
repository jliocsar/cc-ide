export type TmuxNameValidation = { ok: true } | { ok: false, reason: string }

const RESERVED_NAMES = new Set(['__ccide_idle__'])
const MAX_LEN = 64
const SLUG_MAX_LEN = 32

export function validateTmuxWindowName(name: string): TmuxNameValidation {
  if (typeof name !== 'string') return { ok: false, reason: 'name must be a string' }
  if (name.length === 0) return { ok: false, reason: 'name cannot be empty' }
  if (name.length > MAX_LEN) return { ok: false, reason: `name cannot exceed ${MAX_LEN} chars` }
  if (name !== name.trim()) return { ok: false, reason: 'name cannot have leading or trailing whitespace' }
  if (name.includes(':')) return { ok: false, reason: "name cannot contain ':'" }
  if (name.includes('.')) return { ok: false, reason: "name cannot contain '.'" }
  if (RESERVED_NAMES.has(name)) return { ok: false, reason: 'name is reserved' }
  return { ok: true }
}

export function slugifyFirstMessage(msg: string | null | undefined): string | null {
  if (!msg) return null
  const slug = msg
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LEN)
    .replace(/-+$/, '')
  return slug.length > 0 ? slug : null
}
