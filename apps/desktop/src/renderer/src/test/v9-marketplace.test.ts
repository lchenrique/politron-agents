import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))

import { AppService } from '../../../main/v9/workspace'
import { marketplaceRoot } from '../../../main/marketplace/catalog'
import { SkillsService } from '../../../main/v9/skills/service'
import { parseSkillFrontmatter } from '../../../main/v9/skills/discover'

const dirs: string[] = []
const services: AppService[] = []
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'politron-marketplace-')); dirs.push(path); return path }
afterEach(() => { for (const service of services.splice(0)) { try { service.dispose() } catch { /* teste */ } } for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }) })
const service = () => { const value = new AppService(temp()); services.push(value); return value }
const skillsDir = join(marketplaceRoot(), 'skills')

describe('catálogo de skills', () => {
  it('lê description em bloco dobrado do YAML', () => {
    expect(parseSkillFrontmatter('---\nname: x\ndescription: >\n  Primeira linha\n  segunda linha\nversion: 1\n---\n')).toMatchObject({ name: 'x', description: 'Primeira linha segunda linha', version: '1' })
  })
})

describe('skills por Boo', () => {
  it('skill do Marketplace só aparece para quem a tem; slug desconhecido é ignorado', async () => {
    const skills = new SkillsService(temp(), skillsDir)
    expect((await skills.forAgent()).some(skill => skill.source === 'marketplace')).toBe(false)
    const own = (await skills.forAgent(['virality', 'nao-existe'])).filter(skill => skill.source === 'marketplace')
    expect(own.map(skill => skill.id)).toEqual(['marketplace:virality'])
    expect(own[0]!.description).not.toBe('>')
  })

  it('read_skill lê arquivo auxiliar dentro da pasta e recusa sair dela', async () => {
    const skills = new SkillsService(temp(), skillsDir)
    const pool = await skills.forAgent(['agent-reach'])
    expect(await skills.readContent('marketplace:agent-reach', 'references/social.md', pool)).toBeTruthy()
    expect(await skills.readContent('agent-reach', undefined, pool)).toContain('---')
    await expect(skills.readContent('marketplace:agent-reach', '../virality/SKILL.md', pool)).rejects.toThrow('dentro da pasta')
    await expect(skills.readContent('marketplace:virality', undefined, pool)).rejects.toThrow('não encontrada')
    const both = await skills.forAgent(['customer-research', 'support-customer-research'])
    expect(await skills.readContent('support-customer-research', undefined, both)).toContain('name: customer-research')
    expect(both.filter(skill => skill.name === 'customer-research')).toHaveLength(1)
  })
})
