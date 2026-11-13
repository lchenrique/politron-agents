import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/**
 * Backup dos arquivos que cada execução toca, para "desfazer" sem depender de o
 * usuário ter commitado antes. O conteúdo vai para a pasta de dados do app
 * (nunca para o workspace) e o manifesto guarda o que existia antes.
 */
type SnapshotEntry = { path: string; existed: boolean; backup?: string }
type Manifest = { runId: string; root: string; createdAt: string; files: SnapshotEntry[] }

/** Quantas execuções ficam recuperáveis; as mais antigas saem primeiro. */
export const RUN_SNAPSHOT_LIMIT = 30

export class RunSnapshots {
  constructor(private readonly dataDirectory: string) {}

  private get base(): string { return join(this.dataDirectory, 'run-snapshots') }
  private dir(runId: string): string { return join(this.base, runId) }
  private manifestPath(runId: string): string { return join(this.dir(runId), 'manifest.json') }

  private async read(runId: string): Promise<Manifest | null> {
    try { return JSON.parse(await fs.readFile(this.manifestPath(runId), 'utf8')) as Manifest } catch { return null }
  }

  private async write(manifest: Manifest): Promise<void> {
    await fs.mkdir(this.dir(manifest.runId), { recursive: true })
    await fs.writeFile(this.manifestPath(manifest.runId), JSON.stringify(manifest))
  }

  /** Guarda o conteúdo atual de `relativePath`; chamadas repetidas para o mesmo arquivo não duplicam. */
  async capture(runId: string, root: string, relativePath: string): Promise<void> {
    const value = normalizeRelative(relativePath)
    if (!value) return
    const manifest = await this.read(runId) ?? { runId, root, createdAt: new Date().toISOString(), files: [] }
    if (manifest.root !== root) return
    if (manifest.files.some(entry => entry.path === value)) return
    const target = inside(root, value)
    if (!target) return
    let existed = false
    let backup: string | undefined
    try {
      const content = await fs.readFile(target)
      existed = true
      const name = createHash('sha1').update(value).digest('hex')
      backup = join('files', name)
      await fs.mkdir(join(this.dir(runId), 'files'), { recursive: true })
      await fs.writeFile(join(this.dir(runId), backup), content)
    } catch {
      // Arquivo novo: basta registrar que não existia para removê-lo ao desfazer.
      try { await fs.access(target); existed = true } catch { existed = false }
      backup = undefined
    }
    manifest.files.push({ path: value, existed, ...(backup ? { backup } : {}) })
    await this.write(manifest)
    await this.prune()
  }

  /** Quantos arquivos desta execução podem ser restaurados. */
  async status(runId: string): Promise<{ available: boolean; files: number }> {
    const manifest = await this.read(runId)
    if (!manifest || !manifest.files.length) return { available: false, files: 0 }
    return { available: true, files: manifest.files.length }
  }

  /** Restaura os arquivos alterados pela execução e apaga o backup. */
  async undo(runId: string): Promise<{ restored: number; removed: number }> {
    const manifest = await this.read(runId)
    if (!manifest) return { restored: 0, removed: 0 }
    let restored = 0
    let removed = 0
    for (const entry of manifest.files) {
      const target = inside(manifest.root, entry.path)
      if (!target) continue
      if (entry.existed && entry.backup) {
        try { await fs.mkdir(dirname(target), { recursive: true }); await fs.writeFile(target, await fs.readFile(join(this.dir(runId), entry.backup))); restored++ } catch { /* backup ausente: segue para os outros */ }
      } else if (!entry.existed) {
        try { await fs.rm(target, { force: true }); removed++ } catch { /* já não existia */ }
      }
    }
    await fs.rm(this.dir(runId), { recursive: true, force: true })
    return { restored, removed }
  }

  /** Mantém só as execuções mais recentes para o backup não crescer sem limite. */
  async prune(limit = RUN_SNAPSHOT_LIMIT): Promise<void> {
    let entries: Array<{ name: string; at: number }>
    try {
      entries = await Promise.all((await fs.readdir(this.base, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(async entry => ({ name: entry.name, at: (await fs.stat(join(this.base, entry.name))).mtimeMs })))
    } catch { return }
    if (entries.length <= limit) return
    for (const entry of entries.sort((left, right) => right.at - left.at).slice(limit)) {
      await fs.rm(join(this.base, entry.name), { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

/** Caminho relativo seguro: sem barras duplas, sem subir de pasta e sem absoluto. */
export function normalizeRelative(value: string): string | null {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').trim()
  if (!normalized || normalized.length > 500) return null
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null
  const parts = normalized.split('/').filter(part => part && part !== '.')
  if (parts.some(part => part === '..')) return null
  return parts.join('/')
}

/** Junta o caminho relativo ao root e confirma que o resultado não escapa da pasta. */
export function inside(root: string, relativePath: string): string | null {
  const value = normalizeRelative(relativePath)
  if (!value) return null
  const target = resolve(root, value.split('/').join(sep))
  const base = resolve(root)
  return target === base || target.startsWith(base + sep) ? target : null
}
