import { safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { hostname } from 'node:os'
import { createIdentity, defaultSettings, validateStoredData, type HostsData } from './identity'

export class HostStore {
  private pending = Promise.resolve()
  constructor(private readonly directory: string) {}
  async load(): Promise<HostsData> {
    try {
      const encrypted = await fs.readFile(join(this.directory, 'hosts.enc'))
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Armazenamento seguro indisponível para os hosts.')
      return validateStoredData(JSON.parse(safeStorage.decryptString(encrypted)))
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
      return { identity: createIdentity(hostname()), settings: { ...defaultSettings }, selectedId: 'local', hosts: [] }
    }
  }
  save(data: HostsData): Promise<void> {
    const json = JSON.stringify(data)
    const pending = this.pending.catch(() => undefined).then(async () => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Armazenamento seguro indisponível para os hosts.')
      await fs.mkdir(this.directory, { recursive: true })
      const file = join(this.directory, 'hosts.enc')
      await fs.writeFile(file + '.tmp', safeStorage.encryptString(json), { mode: 0o600 })
      await fs.rename(file + '.tmp', file)
    })
    this.pending = pending
    return pending
  }
}
