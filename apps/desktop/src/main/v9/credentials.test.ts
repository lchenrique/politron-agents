// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (text: string) => Buffer.from('fixture:' + text), decryptString: (data: Buffer) => data.toString().slice(8) } }))
import { ClaudeCredentialStore } from './credentials'
it('substitui e remove somente a chave Anthropic do diretório descartável', async () => {
  const directory = await mkdtemp(join(tmpdir(),'boobot-key-test-')), store = new ClaudeCredentialStore(directory)
  try {
    await store.save('fixture-key-original-1234567890')
    await expect(store.save('curta')).rejects.toThrow('válida')
    expect(await store.load()).toBe('fixture-key-original-1234567890')
    await store.save('fixture-key-substituida-1234567890')
    expect(await store.load()).toBe('fixture-key-substituida-1234567890')
    await store.clear(); expect(await store.has()).toBe(false); expect(await store.load()).toBe(null)
    await store.clear(); await expect(readFile(join(directory,'claude-api-key.enc'))).rejects.toThrow()
  } finally { await rm(directory,{ recursive: true, force: true }) }
})
