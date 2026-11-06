import { randomBytes } from 'node:crypto'
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const UPLOAD_MS = 60 * 60 * 1000
const ACCEPTED_MS = 24 * 60 * 60 * 1000
const ID = /^[a-f0-9]{32}$/
const MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type AttachmentMime = typeof MIMES[number]
export type MessageAttachment = { id: string; name: string; mimeType: AttachmentMime; size: number }
type Entry = MessageAttachment & { conversationId: string; owner?: string; path: string; expires: number }
type PersistedEntry = Omit<Entry, 'path'>

function sniff(bytes: Uint8Array): AttachmentMime | null {
  const at = (offset: number, signature: number[]) => signature.every((value, index) => bytes[offset + index] === value)
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  return null
}
function displayName(name: string): string {
  // Keep only the last path segment; the client path must never be stored or echoed.
  const clean = name.split(/[\\/]/).pop()!.replace(/[\p{Cc}<>:"|?*]/gu, '').trim().slice(0, 120)
  return clean && clean !== '.' && clean !== '..' ? clean : 'imagem'
}

/** Host-only temporary image files addressed by opaque ids. */
export class AttachmentStore {
  private entries = new Map<string, Entry>()
  private readonly manifest: string
  private readonly ready: Promise<void>
  private persisting: Promise<void> = Promise.resolve()

  constructor(private readonly dir: string, private readonly now: () => number = Date.now) {
    this.manifest = join(dir, '.manifest.json')
    // Keep the failure observable to callers, but never as an unhandled rejection:
    // the host may drop the directory while the store is idle.
    this.ready = this.load()
    this.ready.catch(() => undefined)
  }

  private async load(): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    let raw: string
    try { raw = await readFile(this.manifest, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    let values: unknown
    try { values = JSON.parse(raw) } catch { throw new Error('O índice temporário de imagens está inválido.') }
    if (!Array.isArray(values)) throw new Error('O índice temporário de imagens está inválido.')
    for (const value of values) {
      if (!value || typeof value !== 'object') continue
      const item = value as Partial<PersistedEntry>
      if (typeof item.id !== 'string' || !ID.test(item.id) || typeof item.name !== 'string' || item.name.length > 120 ||
        !MIMES.includes(item.mimeType as AttachmentMime) || !Number.isInteger(item.size) || Number(item.size) <= 0 || Number(item.size) > MAX_ATTACHMENT_BYTES ||
        typeof item.conversationId !== 'string' || !item.conversationId || item.conversationId.length > 200 ||
        !Number.isFinite(item.expires) || item.owner !== undefined && typeof item.owner !== 'string') continue
      const path = join(this.dir, item.id)
      try { await access(path) } catch { continue }
      this.entries.set(item.id, {
        id: item.id, name: item.name, mimeType: item.mimeType as AttachmentMime, size: Number(item.size),
        conversationId: item.conversationId, ...(item.owner ? { owner: item.owner } : {}), expires: Number(item.expires), path,
      })
    }
  }

  private persist(): Promise<void> {
    const entries: PersistedEntry[] = [...this.entries.values()].map(({ id, name, mimeType, size, conversationId, owner, expires }) => ({
      id, name, mimeType, size, conversationId, ...(owner ? { owner } : {}), expires,
    }))
    const payload = JSON.stringify(entries)
    const operation = this.persisting.then(async () => {
      const temporary = join(this.dir, `.manifest-${randomBytes(8).toString('hex')}.tmp`)
      await writeFile(temporary, payload, { mode: 0o600 })
      await rename(temporary, this.manifest)
    })
    this.persisting = operation.catch(() => undefined)
    return operation
  }

  async put(conversationId: string, bytes: Uint8Array, declaredMime: string, fileName: string, owner?: string): Promise<MessageAttachment> {
    await this.ready
    if (!conversationId || conversationId.length > 200) throw new Error('Conversa inválida.')
    if (!bytes.length) throw new Error('A imagem está vazia.')
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('A imagem passa do limite de 20 MB.')
    if (!MIMES.includes(declaredMime as AttachmentMime)) throw new Error('Envie imagens PNG, JPEG ou WebP.')
    const mimeType = sniff(bytes)
    if (mimeType !== declaredMime) throw new Error('O conteúdo não corresponde ao tipo da imagem.')
    const id = randomBytes(16).toString('hex')
    const entry: Entry = { id, name: displayName(fileName), mimeType, size: bytes.length, conversationId, owner,
      path: join(this.dir, id), expires: this.now() + UPLOAD_MS }
    // Register before writing so a concurrent orphan sweep never deletes the new file.
    this.entries.set(id, entry)
    try {
      await writeFile(entry.path, bytes, { flag: 'wx', mode: 0o600 })
      await this.persist()
    } catch (error) { await this.remove(id); throw error }
    return { id, name: entry.name, mimeType, size: entry.size }
  }

  async resolve(conversationId: string, id: string, owner?: string): Promise<MessageAttachment & { path: string }> {
    await this.ready
    const entry = ID.test(id) ? this.entries.get(id) : undefined
    if (!entry || entry.expires <= this.now() || entry.conversationId !== conversationId ||
      owner !== undefined && entry.owner !== owner) throw new Error('Anexo não encontrado ou expirado.')
    return { id: entry.id, name: entry.name, mimeType: entry.mimeType, size: entry.size, path: entry.path }
  }

  /** Called by the host when a message referencing the attachment is accepted: keeps it for 24 hours. */
  async accept(conversationId: string, id: string, owner?: string): Promise<MessageAttachment> {
    const file = await this.resolve(conversationId, id, owner)
    this.entries.get(id)!.expires = this.now() + ACCEPTED_MS
    await this.persist()
    return { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size }
  }

  async remove(id: string): Promise<void> {
    await this.ready
    if (!ID.test(id) || !this.entries.has(id)) return
    this.entries.delete(id)
    await rm(join(this.dir, id), { force: true })
    await this.persist()
  }

  async cleanupExpired(now = this.now()): Promise<void> {
    await this.ready
    for (const [id, entry] of [...this.entries]) if (entry.expires <= now) await this.remove(id)
    const files = await readdir(this.dir).catch(() => [] as string[])
    for (const file of files) {
      if (file === '.manifest.json' || /^\.manifest-[a-f0-9]+\.tmp$/.test(file)) continue
      if (!this.entries.has(file)) await rm(join(this.dir, file), { force: true, recursive: true })
    }
  }
}
