import { TsParser } from './ts-parser'
import type { LanguageParser } from './types'

export class ParserRegistry {
  private readonly parsers: LanguageParser[] = []

  constructor(parsers?: LanguageParser[]) {
    if (parsers) this.parsers.push(...parsers)
  }

  register(parser: LanguageParser): void {
    this.parsers.push(parser)
  }

  all(): readonly LanguageParser[] {
    return this.parsers
  }

  /** Returns the first parser that claims the path, or null. */
  forPath(path: string): LanguageParser | null {
    for (const p of this.parsers) {
      if (p.matches(path)) return p
    }
    return null
  }
}

export function defaultRegistry(): ParserRegistry {
  return new ParserRegistry([new TsParser()])
}
