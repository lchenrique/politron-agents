import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {}, BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false } }))

import { AppService } from '../../../main/v9/workspace'
import { loadTeams, marketplaceRoot } from '../../../main/marketplace/catalog'
import { SkillsService } from '../../../main/v9/skills/service'
import { parseSkillFrontmatter } from '../../../main/v9/skills/discover'

const dirs: string[] = []
const services: AppService[] = []
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'politron-marketplace-')); dirs.push(path); return path }
afterEach(() => { for (const service of services.splice(0)) { try { service.dispose() } catch { /* teste */ } } for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }) })
const service = () => { const value = new AppService(temp()); services.push(value); return value }
const skillsDir = join(marketplaceRoot(), 'skills')

describe('catálogo do Marketplace', () => {
  it('equipe de Instagram: 6 Boos, 54 skills únicas e todas existem no catálogo', async () => {
    const team = (await loadTeams()).find(item => item.id === 'instagram')!
    expect(team.members).toHaveLength(6)
    expect(team.members.some(member => member.key === team.leader)).toBe(true)
    const skills = team.members.flatMap(member => member.skills)
    expect(new Set(skills).size).toBe(54)
    for (const slug of skills) expect(existsSync(join(skillsDir, slug, 'SKILL.md')), slug).toBe(true)
  })

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
  })
})

describe('contratar equipe', () => {
  it('global: cria os 6 Boos com skills e a conversa em grupo liderada pelo diretor', async () => {
    const app = service()
    const result = await app.hireTeam({ teamId: 'instagram', runtime: 'claude' })
    const agents = result.agentIds.map(id => app.store.agent(id))
    expect(agents).toHaveLength(6)
    expect(agents.every(agent => agent.runtime === 'claude' && (agent.skillIds?.length || 0) > 0)).toBe(true)
    const conversation = app.store.conversation(result.conversationId)
    expect(conversation).toMatchObject({ kind: 'group', responseMode: 'leader', leaderAgentId: agents[0]!.id, name: 'Equipe de Instagram' })
    expect(app.store.workspace(conversation.workspaceId).name).toBe('Livre')
  })

  it('contratar de novo não mexe nos Boos existentes e sufixa as menções', async () => {
    const app = service()
    const first = await app.hireTeam({ teamId: 'instagram', runtime: 'codex' })
    const second = await app.hireTeam({ teamId: 'instagram', runtime: 'codex' })
    const firstAliases = first.agentIds.map(id => app.store.agent(id).alias)
    expect(second.agentIds.map(id => app.store.agent(id).alias)).toEqual(firstAliases.map(alias => `${alias}-2`))
    expect(first.agentIds.map(id => app.store.agent(id).alias)).toEqual(firstAliases)
  })

  it('projeto: entra na equipe padrão; projeto cheio recusa sem criar nenhum Boo', async () => {
    const app = service()
    const workspace = app.store.workspace(app.saveConversation({ workspacePath: temp() }).workspaceId)
    const hired = await app.hireTeam({ teamId: 'instagram', workspaceId: workspace.id, runtime: 'codex' })
    expect(app.store.workspace(workspace.id).defaultAgentIds).toEqual(hired.agentIds)
    expect(app.store.conversation(hired.conversationId).workspaceId).toBe(workspace.id)
    const before = app.store.agents().length
    await expect(app.hireTeam({ teamId: 'instagram', workspaceId: workspace.id, runtime: 'codex' })).rejects.toThrow('cabem até 10')
    expect(app.store.agents()).toHaveLength(before)
  })

  it('erro no meio desfaz os Boos já criados', async () => {
    const app = service()
    const before = app.store.agents().length
    const original = app.store.saveConversation.bind(app.store)
    app.store.saveConversation = () => { throw new Error('falhou de propósito') }
    await expect(app.hireTeam({ teamId: 'instagram', runtime: 'codex' })).rejects.toThrow('falhou de propósito')
    app.store.saveConversation = original
    expect(app.store.agents()).toHaveLength(before)
  })
})
