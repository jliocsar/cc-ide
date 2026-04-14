import { describe, expect, it } from 'vitest'
import { serializeComments } from './comment-serializer'

describe('serializeComments', () => {
  it('serializes a single file with a single multi-line range', () => {
    const out = serializeComments([
      {
        path: '.cc-ide/plans/design.md',
        ranges: [{ start: 10, len: 5, comment: 'please rework this section' }],
      },
    ])
    expect(out).toBe(`@.cc-ide/plans/design.md
@@ 10,5 @@
please rework this section
`)
  })

  it('emits len=1 explicitly for a single-line range', () => {
    const out = serializeComments([
      {
        path: 'src/app.ts',
        ranges: [{ start: 42, len: 1, comment: 'off-by-one' }],
      },
    ])
    expect(out).toBe(`@src/app.ts
@@ 42,1 @@
off-by-one
`)
  })

  it('emits multiple disjoint ranges in a single file with no blank lines', () => {
    const out = serializeComments([
      {
        path: 'src/app.ts',
        ranges: [
          { start: 3, len: 2, comment: 'first' },
          { start: 20, len: 4, comment: 'second' },
          { start: 100, len: 1, comment: 'third' },
        ],
      },
    ])
    expect(out).toBe(`@src/app.ts
@@ 3,2 @@
first
@@ 20,4 @@
second
@@ 100,1 @@
third
`)
  })

  it('sorts ranges by ascending start when input is reversed', () => {
    const out = serializeComments([
      {
        path: 'src/app.ts',
        ranges: [
          { start: 100, len: 1, comment: 'third' },
          { start: 20, len: 4, comment: 'second' },
          { start: 3, len: 2, comment: 'first' },
        ],
      },
    ])
    expect(out).toBe(`@src/app.ts
@@ 3,2 @@
first
@@ 20,4 @@
second
@@ 100,1 @@
third
`)
  })

  it('orders multiple files lexicographically by path', () => {
    const out = serializeComments([
      {
        path: 'src/zeta.ts',
        ranges: [{ start: 1, len: 1, comment: 'z' }],
      },
      {
        path: 'src/alpha.ts',
        ranges: [{ start: 5, len: 2, comment: 'a' }],
      },
      {
        path: 'src/mid.ts',
        ranges: [{ start: 2, len: 3, comment: 'm' }],
      },
    ])
    expect(out).toBe(`@src/alpha.ts
@@ 5,2 @@
a
@src/mid.ts
@@ 2,3 @@
m
@src/zeta.ts
@@ 1,1 @@
z
`)
  })

  it('skips files with zero ranges when another file has content', () => {
    const out = serializeComments([
      { path: 'src/empty.ts', ranges: [] },
      {
        path: 'src/app.ts',
        ranges: [{ start: 1, len: 1, comment: 'hi' }],
      },
    ])
    expect(out).toBe(`@src/app.ts
@@ 1,1 @@
hi
`)
  })

  it('returns an empty string (no trailing newline) when all files are empty', () => {
    const out = serializeComments([
      { path: 'src/a.ts', ranges: [] },
      { path: 'src/b.ts', ranges: [] },
    ])
    expect(out).toBe('')
  })

  it('passes comments through verbatim (backticks, quotes, @@, newlines)', () => {
    const comment = "look at `foo()` and it's broken\n@@ 1,1 @@ not a hunk\nend"
    const out = serializeComments([
      {
        path: 'src/weird.ts',
        ranges: [{ start: 7, len: 3, comment }],
      },
    ])
    expect(out).toBe(`@src/weird.ts
@@ 7,3 @@
look at \`foo()\` and it's broken
@@ 1,1 @@ not a hunk
end
`)
  })

  it('does not escape or quote a path containing a space', () => {
    const out = serializeComments([
      {
        path: 'src/some dir/file name.ts',
        ranges: [{ start: 1, len: 1, comment: 'spaces ok' }],
      },
    ])
    expect(out).toBe(`@src/some dir/file name.ts
@@ 1,1 @@
spaces ok
`)
  })

  it('emits the header and an empty comment line for an empty-string comment', () => {
    const out = serializeComments([
      {
        path: 'src/app.ts',
        ranges: [
          { start: 1, len: 1, comment: '' },
          { start: 5, len: 2, comment: 'real' },
        ],
      },
    ])
    expect(out).toBe(`@src/app.ts
@@ 1,1 @@

@@ 5,2 @@
real
`)
  })

  it('preserves insertion order for ranges with equal start (stable sort)', () => {
    const out = serializeComments([
      {
        path: 'src/app.ts',
        ranges: [
          { start: 10, len: 1, comment: 'first-at-10' },
          { start: 10, len: 2, comment: 'second-at-10' },
          { start: 10, len: 3, comment: 'third-at-10' },
        ],
      },
    ])
    expect(out).toBe(`@src/app.ts
@@ 10,1 @@
first-at-10
@@ 10,2 @@
second-at-10
@@ 10,3 @@
third-at-10
`)
  })
})
