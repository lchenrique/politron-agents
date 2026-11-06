// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { AttachmentStore } from './attachment-store'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })

describe('compatibilidade do armazenamento de anexos', () => {
  it('reabre anexos existentes em pwa-attachments sem migrar nem descartar os dados', async () => {
    const root = await mkdtemp(join(tmpdir(), 'boobot-attachments-legacy-'))
    dirs.push(root)
    const legacyDirectory = join(root, 'pwa-attachments')
    await mkdir(legacyDirectory)
    const id = 'a'.repeat(32)
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    await writeFile(join(legacyDirectory, id), bytes)
    await writeFile(join(legacyDirectory, '.manifest.json'), JSON.stringify([{
      id, name: 'captura.png', mimeType: 'image/png', size: bytes.length, conversationId: 'conv-1', expires: 10_000,
    }]))

    const store = new AttachmentStore(legacyDirectory, () => 1_000)
    await expect(store.resolve('conv-1', id)).resolves.toMatchObject({ id, name: 'captura.png', mimeType: 'image/png' })
  })
})
