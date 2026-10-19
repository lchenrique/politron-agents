import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [], fromWebContents: () => ({ isDestroyed: () => false }) }, ipcMain: { handle: vi.fn(), removeHandler: vi.fn() }, dialog: { showOpenDialog: vi.fn() } }))

import { parseSkillFrontmatter } from './discover'
import { SkillsService } from './service'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function makeSkill(baseDir: string, slug: string, frontmatter: string) {
  const dir = join(baseDir, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n# ${slug}\nConteúdo.`)
  return dir
}

describe('frontmatter de SKILL.md', () => {
  it('lê name e description, ignorando aspas e campos aninhados', () => {
    const meta = parseSkillFrontmatter('---\nname: minha-skill\ndescription: "Use quando precisar disso."\nversion: 0.1.0\nmetadata:\n  type: user\n---\n\n# Corpo')
    expect(meta).toMatchObject({ name: 'minha-skill', description: 'Use quando precisar disso.' })
  })

  it('devolve null sem bloco de frontmatter', () => {
    expect(parseSkillFrontmatter('# Sem frontmatter\nTexto comum.')).toBeNull()
  })
})

describe('SkillsService', () => {
  it('lista skills próprias cadastradas, em ordem alfabética', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-skills-'))
    dirs.push(root)
    const externalBase = mkdtempSync(join(tmpdir(), 'politron-skills-external-'))
    dirs.push(externalBase)
    const zebra = makeSkill(externalBase, 'zebra', 'name: zebra\ndescription: Use para zebra.')
    const abelha = makeSkill(externalBase, 'abelha', 'name: abelha\ndescription: Use para abelha.')
    const { promises: fs } = await import('node:fs')
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(join(root, 'skills-external.json'), JSON.stringify([zebra, abelha]))

    const service = new SkillsService(root)
    // A lista inclui também as skills reais do Codex/Claude Code já instaladas nesta máquina; olha só as próprias.
    const custom = (await service.list()).filter(skill => skill.source === 'custom')
    expect(custom.map(skill => skill.name)).toEqual(['abelha', 'zebra'])
  })

  it('lê o conteúdo completo e recusa remover skills que não são próprias', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-skills-'))
    dirs.push(root)
    const dir = makeSkill(root, 'minha', 'name: minha\ndescription: Teste.')
    const { promises: fs } = await import('node:fs')
    await fs.writeFile(join(root, 'skills-external.json'), JSON.stringify([dir]))

    const service = new SkillsService(root)
    const skill = (await service.list()).find(item => item.name === 'minha')!
    expect(await service.readContent(skill.id)).toContain('Conteúdo.')
    await expect(service.remove('codex:' + dir)).rejects.toThrow(/pelo Boobot/i)
    await service.remove(skill.id)
    expect((await service.list()).some(item => item.name === 'minha')).toBe(false)
  })

  it('agente grava uma skill aprendida, atualiza o corpo e ela aparece na lista como "learned"', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-skills-'))
    dirs.push(root)
    const service = new SkillsService(root)
    const saved = await service.save({ slug: 'corrigir-login-expirado', name: 'Corrigir login expirado', description: 'Use quando o token de login expirar sem aviso.', content: 'Passo 1: renove o token.', operation: 'create' })
    expect(saved).toMatchObject({ source: 'learned', name: 'Corrigir login expirado' })
    const listed = (await service.list()).find(item => item.id === saved.id)!
    expect(listed.description).toBe('Use quando o token de login expirar sem aviso.')
    expect(await service.readContent(saved.id)).toContain('Passo 1: renove o token.')

    await expect(service.save({ slug: 'corrigir-login-expirado', name: 'x', description: 'x', content: 'x', operation: 'create' })).rejects.toThrow(/já existe/i)
    await service.save({ slug: 'corrigir-login-expirado', name: 'Corrigir login expirado', description: 'Use quando o token expirar; agora checa o refresh token primeiro.', content: 'Passo 1: renove o refresh token.', operation: 'update' })
    expect(await service.readContent(saved.id)).toContain('refresh token')

    await service.remove(saved.id)
    expect((await service.list()).some(item => item.id === saved.id)).toBe(false)
  })

  it('recusa identificador de skill fora do padrão e descrição vazia', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-skills-'))
    dirs.push(root)
    const service = new SkillsService(root)
    await expect(service.save({ slug: 'Com Espaço', name: 'x', description: 'x', content: 'x', operation: 'create' })).rejects.toThrow(/letras minúsculas/i)
    await expect(service.save({ slug: 'skill-valida', name: 'x', description: '  ', content: 'x', operation: 'create' })).rejects.toThrow(/descreva quando/i)
  })
})
