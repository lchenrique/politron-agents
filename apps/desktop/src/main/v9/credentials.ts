import { safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/** Stores provider secrets encrypted by Electron, outside SQLite and renderer state. */
export class ClaudeCredentialStore {
  private readonly path: string
  constructor(dataDirectory: string) { this.path = join(dataDirectory, 'claude-api-key.enc') }
  async has(): Promise<boolean> { try { return (await fs.stat(this.path)).isFile() } catch { return false } }
  async clear(): Promise<void> { await fs.unlink(this.path).catch((error: unknown) => { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error }) }
  async save(apiKey: string): Promise<void> {
    const value = typeof apiKey === 'string' ? apiKey.trim() : ''
    if (value.length < 20 || value.length > 500) throw new Error('Informe uma chave de API Anthropic válida.')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema está indisponível.')
    await fs.writeFile(this.path, safeStorage.encryptString(value), { mode: 0o600 })
  }
  async load(): Promise<string | null> {
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('O armazenamento seguro do sistema está indisponível.')
      return safeStorage.decryptString(await fs.readFile(this.path))
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null
      throw error
    }
  }
}
