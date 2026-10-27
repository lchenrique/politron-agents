// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AttachmentStore, MAX_ATTACHMENT_BYTES } from './attachment-store'

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const webp = Buffer.from([...Buffer.from('RIFF'), 4, 0, 0, 0, ...Buffer.from('WEBP'), 1, 2])
const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
const make = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'boobot-attachments-'))
  dirs.push(dir)
  let now = 1_000
  return { dir, store: new AttachmentStore(join(dir, 'store'), () => now), advance: (ms: number) => { now += ms }, now: () => now }
}

describe('AttachmentStore', () => {
  it('accepts PNG, JPEG and WebP by magic bytes and returns only opaque metadata', async () => {
    const { store, dir } = await make()
    const saved = await store.put('conv-1', png, 'image/png', 'C:\\Users\\x\\captura.png')
    expect(saved).toEqual({ id: expect.stringMatching(/^[a-f0-9]{32}$/), name: 'captura.png', mimeType: 'image/png', size: png.length })
    expect(JSON.stringify(saved)).not.toContain(dir)
    expect(await store.put('conv-1', jpeg, 'image/jpeg', 'foto.jpg')).toMatchObject({ mimeType: 'image/jpeg' })
    expect(await store.put('conv-1', webp, 'image/webp', '../../x.webp')).toMatchObject({ mimeType: 'image/webp', name: 'x.webp' })
    const other = await store.put('conv-1', png, 'image/png', 'captura.png')
    expect(other.id).not.toBe(saved.id)
  })
  it('rejects MIME mismatch, unsupported bytes and empty files', async () => {
    const { store } = await make()
    await expect(store.put('conv-1', png, 'image/jpeg', 'a.jpg')).rejects.toThrow(/tipo/)
    await expect(store.put('conv-1', Buffer.from('GIF89a....'), 'image/gif', 'a.gif')).rejects.toThrow(/PNG, JPEG ou WebP/)
    await expect(store.put('conv-1', Buffer.from('<svg/>'), 'image/png', 'a.png')).rejects.toThrow(/tipo/)
    await expect(store.put('conv-1', new Uint8Array(0), 'image/png', 'a.png')).rejects.toThrow(/vazia/)
  })
  it('accepts exactly 20 MB and rejects one byte more', async () => {
    const { store } = await make()
    const exact = Buffer.alloc(MAX_ATTACHMENT_BYTES); png.copy(exact)
    expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024)
    expect((await store.put('conv-1', exact, 'image/png', 'big.png')).size).toBe(MAX_ATTACHMENT_BYTES)
    const over = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1); png.copy(over)
    await expect(store.put('conv-1', over, 'image/png', 'large.png')).rejects.toThrow(/20 MB/)
  })
  it('scopes resolve by conversation and owner and rejects path-like ids', async () => {
    const { store, dir } = await make()
    const saved = await store.put('conv-1', png, 'image/png', 'captura.png', 'device-a')
    const file = await store.resolve('conv-1', saved.id, 'device-a')
    expect(file.path.startsWith(join(dir, 'store'))).toBe(true)
    expect(await store.resolve('conv-1', saved.id)).toMatchObject({ mimeType: 'image/png' })
    await expect(store.resolve('conv-2', saved.id)).rejects.toThrow()
    await expect(store.resolve('conv-1', saved.id, 'device-b')).rejects.toThrow()
    await expect(store.resolve('conv-1', '../' + saved.id)).rejects.toThrow()
  })
  it('removes idempotently and expires uploads after 1 hour and accepted files after 24 hours', async () => {
    const { store, advance } = await make()
    const pending = await store.put('conv-1', png, 'image/png', 'a.png')
    const accepted = await store.put('conv-1', png, 'image/png', 'b.png')
    const removed = await store.put('conv-1', png, 'image/png', 'c.png')
    const removedPath = (await store.resolve('conv-1', removed.id)).path
    await store.remove(removed.id)
    await store.remove(removed.id)
    expect(existsSync(removedPath)).toBe(false)
    await expect(store.resolve('conv-1', removed.id)).rejects.toThrow()
    await expect(store.accept('conv-2', accepted.id)).rejects.toThrow()
    expect(await store.accept('conv-1', accepted.id)).toEqual(accepted)
    const pendingPath = (await store.resolve('conv-1', pending.id)).path
    advance(60 * 60 * 1000)
    await expect(store.resolve('conv-1', pending.id)).rejects.toThrow()
    await store.cleanupExpired()
    expect(existsSync(pendingPath)).toBe(false)
    const acceptedPath = (await store.resolve('conv-1', accepted.id)).path
    advance(23 * 60 * 60 * 1000 - 1)
    await store.cleanupExpired()
    expect(existsSync(acceptedPath)).toBe(true)
    advance(1)
    await store.cleanupExpired()
    expect(existsSync(acceptedPath)).toBe(false)
    await store.cleanupExpired()
  })
  it('keeps accepted files addressable after the host process restarts until the 24-hour expiry', async () => {
    const { store, dir, now, advance } = await make()
    const saved = await store.put('conv-1', png, 'image/png', 'captura.png', 'device-a')
    await store.accept('conv-1', saved.id)

    const restarted = new AttachmentStore(join(dir, 'store'), now)
    expect(await restarted.resolve('conv-1', saved.id, 'device-a')).toMatchObject({ id: saved.id, name: 'captura.png', mimeType: 'image/png' })
    advance(24 * 60 * 60 * 1000)
    await restarted.cleanupExpired()
    await expect(restarted.resolve('conv-1', saved.id, 'device-a')).rejects.toThrow()
  })
  it('does not leave an unhandled rejection when the store directory cannot be created', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'boobot-attachments-orphan-'))
    dirs.push(dir)
    const blocker = join(dir, 'blocker')
    await writeFile(blocker, 'not a directory')
    const store = new AttachmentStore(join(blocker, 'store'))
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', onUnhandled)
    try {
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(unhandled).toEqual([])
      await expect(store.put('conv-1', png, 'image/png', 'a.png')).rejects.toThrow()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('cleans orphan files left by a previous host process', async () => {
    const { store, dir } = await make()
    await store.put('conv-1', png, 'image/png', 'a.png')
    await writeFile(join(dir, 'store', 'f'.repeat(32)), png)
    await store.cleanupExpired()
    expect((await readdir(join(dir, 'store'))).filter(file => file !== '.manifest.json')).toHaveLength(1)
  })
})
