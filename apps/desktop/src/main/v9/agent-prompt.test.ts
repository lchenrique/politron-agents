import { describe, expect, it } from 'vitest'
import { buildAgentSystemPrompt } from './agent-prompt'
import type { Agent } from '../../shared/v9'

const agent = { id: 'a1', name: 'Nina', alias: 'nina', instructions: 'Cuide do frontend.' } as Agent

describe('preâmbulo de sistema compartilhado entre Codex e Claude', () => {
  it('usa Boo e Boobot com as regras de colaboração entre motores', () => {
    const prompt = buildAgentSystemPrompt(agent, '')
    expect(prompt).toContain('Este aplicativo se chama Boobot.')
    expect(prompt).toContain('Cada agente é um Boo')
    expect(prompt).toContain('group_members e ask_agent')
    expect(prompt).toContain('delegation_result')
    expect(prompt).toContain('ask_agent com delegation_id')
    expect(prompt).toContain('Não afirme ter feito uma ação sem resultado real de ferramenta.')
    expect(prompt).toContain('não são ferramentas nem dependências disponíveis')
    expect(prompt).toContain('Não execute CLIs desses produtos')
    expect(prompt).toContain('@nina')
  })

  it('orienta o Chief a montar a equipe quando útil e distinguir Boos temporários', () => {
    const prompt = buildAgentSystemPrompt({ ...agent, role: 'chief' })
    expect(prompt).toContain('agent_create')
    expect(prompt).toContain('group_members')
    expect(prompt).toContain('purpose=team')
    expect(prompt).toContain('purpose=task')
    expect(prompt).toContain('Boos dessa equipe devem ser PERMANENTES')
    expect(prompt).toContain('temporary=true')
    expect(prompt).toContain('team_set')
    expect(prompt).toContain('conclua')
  })

  it('Chief age direto, confirma só o que não tem volta e nunca aprova a si mesmo; Boo comum segue com propostas', () => {
    const chief = buildAgentSystemPrompt({ ...agent, role: 'chief' })
    for (const name of ['project_list', 'project_overview', 'session_history', 'project_create', 'session_send', 'agent_update', 'self_update', 'project_delete', 'settings_update']) expect(chief).toContain(name)
    expect(chief).toContain('mesmo no Bypass')
    expect(chief).toContain('nunca responde nem aprova essas confirmações')
    expect(chief).toContain('Documentos\\Boobot\\<nome>')
    expect(chief).not.toContain('propose_self_profile')
    const worker = buildAgentSystemPrompt(agent)
    expect(worker).toContain('propose_self_profile')
    expect(worker).not.toContain('project_create')
  })

  it('explica o bypass e o acesso por ferramentas sem confundir o sandbox nativo com a pasta', () => {
    const prompt = buildAgentSystemPrompt({ ...agent, role: 'chief', approvalMode: 'bypass' }, '')
    expect(prompt).toContain('Bypass')
    expect(prompt).toContain('workspace_write')
    expect(prompt).toContain('somente leitura')
    expect(prompt).not.toContain('Toda criação e delegação exige aprovação')
    expect(prompt).not.toContain('cada comando exige aprovação')
    expect(prompt).toContain('continue_on_result=true')
  })

  it('pede links Markdown relativos para arquivos e terminal interno sem janela externa', () => {
    const prompt = buildAgentSystemPrompt(agent)
    expect(prompt).toContain('[src/app.ts](src/app.ts)')
    expect(prompt).toContain('não transforme em link caminhos dentro de blocos de código')
    expect(prompt).toContain('workspace_start_process')
    expect(prompt).toContain('Nunca abra um terminal ou janela externa')
  })

  it('anexa as instruções do projeto só quando existem', () => {
    expect(buildAgentSystemPrompt(agent)).not.toContain('Instruções do projeto')
    expect(buildAgentSystemPrompt(agent, 'Use TypeScript estrito.')).toContain('Instruções do projeto:\nUse TypeScript estrito.')
  })
})
