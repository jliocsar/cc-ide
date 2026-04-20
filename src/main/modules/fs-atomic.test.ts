import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { atomicWriteFile } from './fs-atomic'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'fs-atomic-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('atomicWriteFile', () => {
  it('writes content to target', async () => {
    const target = join(root, 'file.txt')
    await atomicWriteFile(target, 'hello world')
    const content = await fs.readFile(target, 'utf8')
    expect(content).toBe('hello world')
  })

  it('handles Uint8Array', async () => {
    const target = join(root, 'binary.bin')
    const data = new Uint8Array([0x01, 0x02, 0x03])
    await atomicWriteFile(target, data)
    const buf = await fs.readFile(target)
    expect(buf).toEqual(Buffer.from(data))
  })

  it('overwrites existing file', async () => {
    const target = join(root, 'existing.txt')
    await fs.writeFile(target, 'old', 'utf8')
    await atomicWriteFile(target, 'new')
    const content = await fs.readFile(target, 'utf8')
    expect(content).toBe('new')
  })

  it('leaves no tmp file on success', async () => {
    const target = join(root, 'clean.txt')
    await atomicWriteFile(target, 'data')
    const files = await fs.readdir(root)
    expect(files).toEqual(['clean.txt'])
  })

  it('throws and cleans up tmp on error', async () => {
    const target = join(root, 'nonexistent', 'dir', 'file.txt')
    await expect(atomicWriteFile(target, 'data')).rejects.toThrow()
    const files = await fs.readdir(root)
    expect(files).toHaveLength(0)
  })
})