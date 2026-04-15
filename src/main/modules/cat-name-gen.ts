import * as tmux from './tmux-adapter'

const MAX_ATTEMPTS = 50

export interface Deps {
  random: () => string
  listWindows: (primarySession: string) => Promise<string[]>
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function loadRandom(): Promise<() => string> {
  const mod = await import('cat-names')
  return mod.randomCatName
}

export async function generateClaudeWindowName(
  primarySession: string,
  deps?: Partial<Deps>,
): Promise<string> {
  const listWindows = deps?.listWindows ?? tmux.listWindows
  const random = deps?.random ?? (await loadRandom())

  let existing: Set<string>
  try {
    existing = new Set(await listWindows(primarySession))
  } catch {
    existing = new Set()
  }

  let lastSlug = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const raw = random()
    const slug = slugify(raw)
    if (!slug) continue
    lastSlug = slug
    const base = `claude-${slug}`
    if (!existing.has(base)) return base
  }
  if (lastSlug) {
    const base = `claude-${lastSlug}`
    for (let suffix = 2; suffix < 100; suffix++) {
      const candidate = `${base}-${suffix}`
      if (!existing.has(candidate)) return candidate
    }
  }
  return `claude-${Date.now().toString(36)}`
}
