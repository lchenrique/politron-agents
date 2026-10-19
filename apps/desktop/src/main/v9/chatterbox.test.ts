import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { root } = vi.hoisted(() => ({ root: { path: '' } }))
vi.mock('electron', () => ({ app: { getPath: () => root.path } }))
import { ChatterboxService } from './chatterbox'

const folders: string[] = []
afterEach(() => folders.splice(0).forEach(folder => rmSync(folder, { force: true, recursive: true })))

describe('Chatterbox PT-BR local', () => {
  it('não anuncia síntese como instalada sem os arquivos e não faz fallback pago/Piper', async () => {
    root.path = mkdtempSync(join(tmpdir(), 'politron-chatterbox-'))
    folders.push(root.path)
    const service = new ChatterboxService()
    expect(await service.status()).toBe(false)
    await expect(service.speak('Olá, como está?')).rejects.toThrow(/Instale o Chatterbox PT-BR/)
    service.close()
  })

  it('só habilita o modelo com Python, código oficial e instalação concluída', async () => {
    root.path = mkdtempSync(join(tmpdir(), 'politron-chatterbox-'))
    folders.push(root.path)
    const service = new ChatterboxService()
    mkdirSync(join(root.path, 'chatterbox-venv', 'Scripts'), { recursive: true })
    writeFileSync(join(root.path, 'chatterbox-venv', 'Scripts', 'python.exe'), '')
    mkdirSync(join(root.path, 'chatterbox-ptbr-code', 'chatterbox', 'src', 'chatterbox'), { recursive: true })
    writeFileSync(join(root.path, 'chatterbox-ptbr-code', 'chatterbox', 'src', 'chatterbox', 'tts.py'), '')
    expect(await service.status()).toBe(false)
    writeFileSync(join(root.path, 'chatterbox-ptbr-ready.json'), '{"version":1}')
    expect(await service.status()).toBe(true)
    service.close()
  })
})
