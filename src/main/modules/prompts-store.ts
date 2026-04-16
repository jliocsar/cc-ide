import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const DATA_DIR = join(homedir(), '.cc-ide')
let PROMPTS_PATH = join(DATA_DIR, 'prompts.json')

/** Test-only: override the storage path. */
export function __setDataPathForTests(path: string): void {
  PROMPTS_PATH = path
}

const promptSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  favorite: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const promptsFileSchema = z.object({
  version: z.literal(1),
  prompts: z.array(promptSchema),
})

export type Prompt = z.infer<typeof promptSchema>
export type SortMode = 'favorites-first' | 'title'

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function readPrompts(): Promise<Prompt[]> {
  try {
    const raw = await fs.readFile(PROMPTS_PATH, 'utf8')
    const parsed = promptsFileSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []
    return parsed.data.prompts
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    return []
  }
}

async function writePrompts(prompts: Prompt[]): Promise<void> {
  await ensureDir()
  const tmp = `${PROMPTS_PATH}.${randomUUID()}.tmp`
  const body = JSON.stringify({ version: 1, prompts }, null, 2)
  try {
    await fs.writeFile(tmp, body, 'utf8')
    await fs.rename(tmp, PROMPTS_PATH)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

export async function listPrompts(options?: {
  query?: string
  sort?: SortMode
}): Promise<Prompt[]> {
  let prompts = await readPrompts()

  if (options?.query !== undefined) {
    const q = options.query.trim().toLowerCase()
    if (q.length > 0) {
      prompts = prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q),
      )
    }
  }

  const sort = options?.sort ?? 'favorites-first'

  if (sort === 'title') {
    prompts = [...prompts].sort((a, b) =>
      a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
    )
  } else {
    const favorites = prompts
      .filter((p) => p.favorite)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const rest = prompts
      .filter((p) => !p.favorite)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    prompts = [...favorites, ...rest]
  }

  return prompts
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  const all = await readPrompts()
  return all.find((p) => p.id === id) ?? null
}

export async function createPrompt(input: {
  title: string
  body: string
  favorite?: boolean
}): Promise<Prompt> {
  const title = input.title.trim()
  if (title.length === 0) {
    throw new Error('Prompt title must not be empty')
  }
  const now = Date.now()
  const prompt: Prompt = {
    id: randomUUID(),
    title,
    body: input.body,
    favorite: input.favorite ?? false,
    createdAt: now,
    updatedAt: now,
  }
  const existing = await readPrompts()
  await writePrompts([...existing, prompt])
  return prompt
}

export async function updatePrompt(
  id: string,
  patch: Partial<Pick<Prompt, 'title' | 'body' | 'favorite'>>,
): Promise<Prompt> {
  const all = await readPrompts()
  const idx = all.findIndex((p) => p.id === id)
  if (idx === -1) {
    throw new Error(`Prompt not found: ${id}`)
  }
  const existing = all[idx]!
  const updated: Prompt = {
    ...existing,
    ...patch,
    title:
      patch.title !== undefined ? patch.title.trim() : existing.title,
    updatedAt: Date.now(),
  }
  const next = [...all]
  next[idx] = updated
  await writePrompts(next)
  return updated
}

export async function deletePrompt(id: string): Promise<void> {
  const all = await readPrompts()
  const next = all.filter((p) => p.id !== id)
  if (next.length === all.length) return
  await writePrompts(next)
}
