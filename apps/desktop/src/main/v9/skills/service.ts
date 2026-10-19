import { BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join, sep } from 'node:path'
import type { SkillInfo } from '../../../shared/skills'
import { discoverSkills, parseSkillFrontmatter } from './discover'

const SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/

/** Skills "próprias" (adicionadas por pasta externa) são só uma lista de caminhos; skills "aprendidas" o Boobot escreve e guarda inteiras em disco. */
export class SkillsService {
  private readonly registryPath: string
  private readonly learnedDir: string
  constructor(private readonly root: string) {
    this.registryPath = join(root, 'skills-external.json')
    this.learnedDir = join(root, 'skills-learned')
  }

  private async customPaths(): Promise<string[]> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.registryPath, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    } catch { return [] }
  }

  private async saveCustomPaths(paths: string[]): Promise<void> {
    await fs.mkdir(this.root, { recursive: true })
    await fs.writeFile(this.registryPath, JSON.stringify([...new Set(paths)], null, 2))
  }

  async list(): Promise<SkillInfo[]> {
    const skills = await discoverSkills(await this.customPaths(), this.learnedDir)
    return skills.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  /**
   * Um agente (com permissão de escrita) grava ou atualiza uma skill própria do Politron — nunca em
   * ~/.codex/skills nem ~/.claude/skills, que ficam só de leitura. `operation: 'update'` sobrescreve
   * o corpo mantendo o nome já cadastrado; não existe patch incremental nesta primeira versão.
   */
  async save(input: { slug: string; name: string; description: string; content: string; operation: 'create' | 'update' }): Promise<SkillInfo> {
    const slug = input.slug.trim().toLowerCase()
    if (!SLUG.test(slug)) throw new Error('O identificador da skill deve ter só letras minúsculas, números e hífen (ex.: corrigir-login-expirado).')
    const description = input.description.trim().slice(0, 500)
    if (!description) throw new Error('Descreva quando essa skill deve ser usada.')
    const name = input.name.trim().slice(0, 100) || slug
    const dir = join(this.learnedDir, slug)
    const exists = await fs.stat(join(dir, 'SKILL.md')).then(() => true, () => false)
    if (input.operation === 'create' && exists) throw new Error(`Já existe uma skill "${slug}"; use operation "update" para corrigi-la.`)
    if (input.operation === 'update' && !exists) throw new Error(`Não existe skill "${slug}" ainda; use operation "create".`)
    await fs.mkdir(dir, { recursive: true })
    const body = `---\nname: ${name}\ndescription: ${description.replace(/\n/g, ' ')}\nversion: 0.1.0\n---\n\n${input.content.trim()}\n`
    await fs.writeFile(join(dir, 'SKILL.md'), body)
    return { id: `learned:${dir}`, name, description, source: 'learned', path: dir }
  }

  async addFromFolder(owner: Electron.BrowserWindow): Promise<SkillInfo | null> {
    const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory'], title: 'Escolha a pasta da skill (precisa ter um SKILL.md)' })
    if (result.canceled || !result.filePaths[0]) return null
    const dir = result.filePaths[0]
    const text = await fs.readFile(join(dir, 'SKILL.md'), 'utf8').catch(() => { throw new Error('Essa pasta não tem um arquivo SKILL.md.') })
    const meta = parseSkillFrontmatter(text)
    if (!meta?.description) throw new Error('O SKILL.md precisa de "name" e "description" no frontmatter.')
    const paths = await this.customPaths()
    await this.saveCustomPaths([...paths, dir])
    return { id: `custom:${dir}`, name: meta.name || dir, description: meta.description, source: 'custom', path: dir }
  }

  async remove(id: string): Promise<void> {
    const [source, ...rest] = id.split(':')
    const dir = rest.join(':')
    if (source === 'learned') {
      if (!dir.startsWith(this.learnedDir + sep)) throw new Error('Caminho de skill aprendida inválido.')
      await fs.rm(dir, { recursive: true, force: true })
      return
    }
    if (source !== 'custom') throw new Error('Só skills adicionadas ou aprendidas pelo Boobot podem ser removidas por aqui; as demais vêm do Codex ou do Claude Code na sua máquina.')
    await this.saveCustomPaths((await this.customPaths()).filter(path => path !== dir))
  }

  async readContent(id: string): Promise<string> {
    const skill = (await this.list()).find(item => item.id === id)
    if (!skill) throw new Error('Skill não encontrada.')
    return fs.readFile(join(skill.path, 'SKILL.md'), 'utf8')
  }
}

export function registerSkillsIpc(service: SkillsService, routing?: import('../../hosts/rpc').HostRouting): () => void {
  routing?.register('skills:list', () => service.list())
  routing?.register('skills:readContent', (id: string) => service.readContent(id))
  const handle = (channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) => ipcMain.handle(`skills:${channel}`, (event, ...args) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('Janela do Boobot indisponível.')
    return routing ? routing.invoke(`skills:${channel}`, args, () => handler(event, ...args)) : handler(event, ...args)
  })
  handle('list', () => service.list())
  handle('addFromFolder', event => service.addFromFolder(BrowserWindow.fromWebContents(event.sender)!))
  handle('remove', (_event, id) => service.remove(id))
  handle('readContent', (_event, id) => service.readContent(id))
  return () => { for (const channel of ['list', 'addFromFolder', 'remove', 'readContent']) ipcMain.removeHandler(`skills:${channel}`) }
}
