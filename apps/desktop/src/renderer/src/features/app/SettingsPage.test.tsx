import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SettingsPage } from './SettingsPage'

const appAPI = {
  snapshot: vi.fn().mockResolvedValue({ assistant: { computerUse: false, approvalMode: 'ask' }, terminalEnabled: true }),
  settingsPreferences: vi.fn().mockResolvedValue({ canWrite: true, computerUse: false, approvalMode: 'ask', runtimePermissionMode: 'managed', terminalEnabled: true }),
  modelPreferences: vi.fn().mockResolvedValue({ disabled: [], custom: [] }),
  saveModelPreferences: vi.fn().mockImplementation(async (value) => value),
  hasOpenCodeCredential: vi.fn().mockResolvedValue(false),
  saveOpenCodeCredential: vi.fn().mockResolvedValue(undefined),
  clearOpenCodeCredential: vi.fn().mockResolvedValue(undefined),
  hasClaudeCredential: vi.fn().mockResolvedValue(false),
  openRouterDecisionStatus: vi.fn().mockResolvedValue({ configured: false, modelId: 'typesafe/jev-1.13' }),
  imageGenerationStatus: vi.fn().mockResolvedValue({ provider: 'off', apiProvider: 'openai', model: 'gpt-image-2.5-flare', keys: { openai: false, gemini: false, openrouter: false }, engines: { codex: { available: true } } }),
  saveAssistantPreferences: vi.fn().mockResolvedValue(undefined),
  saveTerminalAccess: vi.fn().mockResolvedValue(undefined),
}
const sampleProviders = [
  { id: 'codex', name: 'Codex', binary: 'codex', found: true, version: 'codex-cli 0.160.1', path: 'C:/codex.exe', models: null },
  { id: 'claude', name: 'Claude Code', binary: 'claude', found: false, version: null, path: null, models: null },
  { id: 'pi', name: 'Pi', binary: 'pi', found: true, version: '0.84.1', path: 'C:/pi.exe', models: [{ id: 'claude-opus-4-6', name: 'claude-opus-4-6 (anthropic)' }] },
]
const providersAPI = {
  list: vi.fn().mockResolvedValue({ providers: sampleProviders, checkedAt: '2026-10-18T12:00:00.000Z' }),
  refresh: vi.fn().mockResolvedValue({ providers: sampleProviders, checkedAt: '2026-10-18T12:00:00.000Z' }),
  onChanged: vi.fn(() => () => undefined),
}
const skillsAPI = {
  list: vi.fn().mockResolvedValue([{ id: 'codex:/skills/brag', name: 'brag', description: 'Use para gravar um vídeo de lançamento.', source: 'codex', path: '/skills/brag' }]),
  addFromFolder: vi.fn(), remove: vi.fn(), readContent: vi.fn(),
}

afterEach(() => vi.unstubAllGlobals())

describe('carregamento leve das configurações', () => {
  it('mantém SVG por padrão e permite optar pelo Rive sem tornar a escolha irreversível', () => {
    localStorage.removeItem('boobot.avatar.renderer')
    vi.stubGlobal('appAPI', appAPI)
    const { unmount } = render(<SettingsPage open />)
    const choice = screen.getByRole('checkbox', { name: 'Experimentar renderer Rive (incompleto)' })
    expect(choice).not.toBeChecked()
    fireEvent.click(choice)
    expect(choice).toBeChecked()
    expect(localStorage.getItem('boobot.avatar.renderer')).toBe('rive')
    fireEvent.click(choice)
    expect(choice).not.toBeChecked()
    expect(localStorage.getItem('boobot.avatar.renderer')).toBeNull()
    unmount()
  })
  it('expõe a restrição do Assistente e salva a liberação de escrita', async () => {
    vi.clearAllMocks()
    appAPI.settingsPreferences.mockResolvedValueOnce({ canWrite: false, computerUse: false, approvalMode: 'ask', runtimePermissionMode: 'managed', terminalEnabled: true })
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /^Assistente$/ }))
    const writing = await screen.findByRole('checkbox', { name: 'Permitir edição de arquivos do workspace' })
    await waitFor(() => expect(writing).not.toBeChecked())
    fireEvent.click(writing)
    await waitFor(() => expect(appAPI.saveAssistantPreferences).toHaveBeenCalledWith({ canWrite: true, computerUse: false, approvalMode: 'ask', runtimePermissionMode: 'managed' }))
  })

  it('oferece acesso total do Codex para o Assistente padrão', async () => {
    vi.clearAllMocks()
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open initialSection="assistente" />)
    fireEvent.click(await screen.findByRole('combobox', { name: 'Permissões do Codex' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Acesso total · full access do Codex' }))
    await waitFor(() => expect(appAPI.saveAssistantPreferences).toHaveBeenCalledWith(expect.objectContaining({ runtimePermissionMode: 'bypass' })))
    expect(screen.getByText(/Acesso total: o Codex roda sem sandbox/)).toBeInTheDocument()
  })

  it('ao abrir Geral não pede snapshot completo nem consulta chaves desnecessárias', async () => {
    vi.clearAllMocks()
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open />)
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    expect(screen.getByText('Aparência')).toBeInTheDocument()
    expect(appAPI.snapshot).not.toHaveBeenCalled()
    expect(appAPI.settingsPreferences).not.toHaveBeenCalled()
    expect(appAPI.hasClaudeCredential).not.toHaveBeenCalled()
    expect(appAPI.openRouterDecisionStatus).not.toHaveBeenCalled()
  })

  it('carrega apenas preferências pequenas quando entra em Assistente', async () => {
    vi.clearAllMocks()
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /^Assistente$/ }))
    await waitFor(() => expect(appAPI.settingsPreferences).toHaveBeenCalledTimes(1))
    expect(appAPI.snapshot).not.toHaveBeenCalled()
    expect(appAPI.hasClaudeCredential).not.toHaveBeenCalled()
    expect(appAPI.openRouterDecisionStatus).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: /Permitir uso do navegador/ })).toBeInTheDocument()
  })

  it('carrega chaves apenas quando entra em Provedores', async () => {
    vi.clearAllMocks()
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /^Provedores$/ }))
    await waitFor(() => {
      expect(appAPI.hasClaudeCredential).toHaveBeenCalledTimes(1)
      expect(appAPI.openRouterDecisionStatus).toHaveBeenCalledTimes(1)
    })
    expect(appAPI.settingsPreferences).not.toHaveBeenCalled()
    expect(appAPI.snapshot).not.toHaveBeenCalled()
  })
})

describe('painel de configurações', () => {
  it('não renderiza nada com open=false', () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    const { container } = render(<SettingsPage open={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('abre em Geral e navega para Provedores mostrando os CLIs detectados', async () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open />)
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    expect(screen.getByText('Aparência')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Provedores/ }))
    await waitFor(() => expect(providersAPI.list).toHaveBeenCalled())
    expect(await screen.findByText('codex-cli 0.160.1')).toBeInTheDocument()
    expect(screen.getByText('não encontrado')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    const cliCard = screen.getByText('CLIs de agentes instaladas').closest('section')!
    fireEvent.click(within(cliCard).getByText('Pi'))
    expect(within(cliCard).getByText('claude-opus-4-6 (anthropic)')).toBeInTheDocument()
  })

  it('é uma página do PageShell: sem botão Fechar nem diálogo, com a navegação de seções ao lado', () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    const { container } = render(<SettingsPage />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fechar' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Seções de configurações' })).toBeInTheDocument()
    expect(container.querySelector('[data-page-shell]')).toBeInTheDocument()
    expect(container.querySelector('.ds-eyebrow')).toBeNull()
  })

  it('explica origem do catálogo e indisponibilidade de credencial no diagnóstico', async () => {
    const detected = [
      { id: 'codex', name: 'Codex', binary: 'codex', found: true, version: '1.0', path: 'C:/codex.exe', models: [{ id: 'actual', name: 'Modelo disponível' }], modelSource: 'runtime' },
      { id: 'claude', name: 'Claude Code', binary: 'claude', found: true, version: '1.0', path: 'C:/claude.exe', models: null, modelReason: 'Configure uma chave de API Anthropic no Politron.' },
    ]
    providersAPI.list.mockResolvedValueOnce({ providers: detected, checkedAt: '2026-10-18T12:00:00.000Z' })
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /Provedores/ }))
    expect(await screen.findByText('Configure uma chave de API Anthropic no Politron.')).toBeInTheDocument()
    const cliCard = screen.getByText('CLIs de agentes instaladas').closest('section')!
    fireEvent.click(within(cliCard).getByText('Claude Code').closest('summary')!)
    expect(screen.getByText('Configure uma chave de API Anthropic no Politron.')).toBeVisible()
    fireEvent.click(within(cliCard).getByText('Codex').closest('summary')!)
    expect(screen.getByText('catálogo do runtime')).toBeInTheDocument()
    expect(screen.getByText('Modelo disponível')).toBeVisible()
  })

  it('aba Skills lista o que já existe e permite adicionar uma pasta', async () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /^Skills$/ }))
    expect(await screen.findByText('brag')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pasta de skill' }))
    await waitFor(() => expect(skillsAPI.addFromFolder).toHaveBeenCalled())
  })
})

describe('hierarquia das seções', () => {
  const sections: [string, RegExp][] = [
    ['Geral', /Modo visual/], ['Assistente', /Assistente padrão/], ['Ferramentas', /terminal/],
    ['Provedores', /CLIs detectadas/], ['Geração de imagens', /Codex ou uma chave de API/], ['Skills', /SKILL\.md/], ['Memória', /lembram entre conversas/], ['Computer Use', /cua-driver/], ['Voz em tempo real', /transcrição/],
    ['Conexões', /outros dispositivos/], ['Telegram', /Chief/], ['Atualizações', /canal de atualização/], ['Atividade', /Comandos rodados/],
  ]

  it('mantém as treze seções na navegação e dá a cada página título e propósito próprios', () => {
    vi.stubGlobal('appAPI', { ...appAPI, voiceStatus: vi.fn().mockResolvedValue({ voiceKeyConfigured: false }) })
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    const { unmount } = render(<SettingsPage open />)
    const nav = screen.getByRole('navigation', { name: 'Seções de configurações' })
    expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(sections.map(([label]) => label))
    // Troca somente o título/descrição do topo; os painéis pesados de Voz/Conexões/Atualizações não são exercitados aqui.
    for (const [label, purpose] of sections.slice(0, 5)) {
      fireEvent.click(within(nav).getByRole('button', { name: label }))
      expect(within(nav).getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('heading', { level: 2, name: label })).toBeInTheDocument()
      const page = screen.getByRole('region', { name: label })
      expect(page).toHaveClass('space-y-4')
      expect(screen.getByRole('heading', { level: 2, name: label }).nextElementSibling?.textContent).toMatch(purpose)
    }
    unmount()
  })

  it('agrupa os controles em cartões nomeados abaixo do título da página', () => {
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open />)
    const page = screen.getByRole('region', { name: 'Geral' })
    const cards = within(page).getAllByRole('region')
    expect(cards.map(card => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual(['Aparência', 'Animação dos Boos'])
    expect(within(cards[1]).getByRole('checkbox', { name: 'Experimentar renderer Rive (incompleto)' })).toBeInTheDocument()
  })

  it('destaca o aviso de Bypass ao lado do modo de aprovação do Assistente', async () => {
    vi.clearAllMocks()
    appAPI.settingsPreferences.mockResolvedValueOnce({ canWrite: true, computerUse: false, approvalMode: 'bypass', runtimePermissionMode: 'managed', terminalEnabled: true })
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open initialSection="assistente" />)
    const warning = await screen.findByText(/No Bypass, o terminal pode alterar outros caminhos/)
    await waitFor(() => expect(warning).toHaveAttribute('data-tone', 'warning'))
    expect(warning.previousElementSibling).toContainElement(screen.getByRole('combobox', { name: 'Modo de aprovação' }))
  })
})

describe('atualizações em Configurações', () => {
  it('abre a área de atualização sem consultar o GitHub em modo dev', async () => {
    const updatesAPI = {
      status: vi.fn().mockResolvedValue({
        currentVersion: '0.1.0-beta.1', channel: 'beta', phase: 'development',
        latestVersion: null, releaseNotes: null, progressPercent: null,
        lastCheckedAt: null, error: null,
      }),
      check: vi.fn(), setChannel: vi.fn(), install: vi.fn(),
      onChanged: vi.fn(() => () => undefined),
    }
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('updatesAPI', updatesAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /^Atualizações$/ }))
    expect(await screen.findByText(/Modo desenvolvimento/)).toBeInTheDocument()
    expect(updatesAPI.status).toHaveBeenCalledTimes(1)
    expect(updatesAPI.check).not.toHaveBeenCalled()
  })
})

describe('Geração de imagens', () => {
  const engines = { codex: { available: false, reason: 'O Codex está instalado, mas não parece logado. Faça login no CLI (codex login) e teste de novo.' } }
  const base = { apiProvider: 'openai' as const, model: 'gpt-image-2.5-flare', keys: { openai: false, gemini: false, openrouter: false }, engines }

  it('mostra quando o motor escolhido não está logado', async () => {
    vi.stubGlobal('appAPI', { ...appAPI, imageGenerationStatus: vi.fn().mockResolvedValue({ ...base, provider: 'codex' }) })
    render(<SettingsPage open initialSection="imagens" />)
    expect(await screen.findByText(/não parece logado/)).toBeInTheDocument()
  })

  it('salva a chave sem exibi-la de volta e testa com a configuração salva', async () => {
    const saved = { ...base, provider: 'api' as const, keys: { ...base.keys, openai: true } }
    const api = {
      ...appAPI,
      imageGenerationStatus: vi.fn().mockResolvedValue({ ...base, provider: 'api' }),
      saveImageGeneration: vi.fn().mockResolvedValue(saved),
      testImageGeneration: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA', provider: 'api' }),
    }
    vi.stubGlobal('appAPI', api)
    render(<SettingsPage open initialSection="imagens" />)
    const key = await screen.findByLabelText('Chave de API de imagens')
    fireEvent.change(key, { target: { value: 'sk-test-0123456789abcdefghij' } })
    expect(screen.getByRole('button', { name: 'Testar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.saveImageGeneration).toHaveBeenCalledWith({ provider: 'api', apiProvider: 'openai', model: 'gpt-image-2.5-flare' }, 'sk-test-0123456789abcdefghij'))
    await waitFor(() => expect(key).toHaveValue(''))
    expect(key).toHaveAttribute('placeholder', 'Chave configurada; cole outra para substituir')
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }))
    expect(await screen.findByAltText('Imagem de teste gerada')).toHaveAttribute('src', 'data:image/png;base64,AAAA')
  })
})

describe('modelos por provedor nas configurações', () => {
  it('interruptor esconde o modelo do seletor e salva a preferência', async () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /Provedores/ }))
    const toggle = await screen.findByRole('switch', { name: 'Ativar modelo claude-opus-4-6 (anthropic)' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    await waitFor(() => expect(appAPI.saveModelPreferences).toHaveBeenCalledWith({ disabled: ['pi:claude-opus-4-6'], custom: [] }))
  })

  it('adiciona um modelo manual ao provedor', async () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /Provedores/ }))
    await screen.findAllByRole('button', { name: '+ Adicionar modelo' })
    const section = document.querySelector('[data-provider="pi"]') as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: '+ Adicionar modelo' }))
    fireEvent.change(within(section).getByLabelText('Id do modelo em Pi'), { target: { value: 'pi-custom' } })
    fireEvent.change(within(section).getByLabelText('Nome do modelo em Pi'), { target: { value: 'Pi Custom' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Salvar modelo' }))
    await waitFor(() => expect(appAPI.saveModelPreferences).toHaveBeenCalledWith({ disabled: [], custom: [{ provider: 'pi', id: 'pi-custom', name: 'Pi Custom' }] }))
  })
})

describe('auditoria de atividade', () => {
  it('lista comandos e arquivos com o Boo e a conversa de cada registro', async () => {
    const activityAPI = {
      ...appAPI,
      activityLog: vi.fn().mockResolvedValue({
        commands: [{ id: 'cmd-1', runId: 'run-1', toolCallId: 't1', agentId: 'agent-1', conversationId: 'conv-1', workspaceId: 'ws-1', command: 'npm test', cwd: 'C:/projeto', output: '', exitCode: 0, status: 'completed', truncated: false, createdAt: '2026-11-12T10:00:00.000Z', finishedAt: '2026-11-12T10:00:05.000Z' }],
        files: [{ id: 'file-1', runId: 'run-1', messageId: 'm1', toolCallId: 't1', agentId: 'agent-1', workspaceId: 'ws-1', path: 'src/app.ts', status: 'applied', before: '', after: '', additions: 3, deletions: 1, truncated: false, binary: false, createdAt: '2026-11-12T10:00:00.000Z' }],
      }),
      snapshot: vi.fn().mockResolvedValue({ assistant: { id: 'assistant', name: 'Assistente', alias: 'assistente', description: '', instructions: '', runtime: 'codex', model: '', color: '#fff', avatar: '', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '' }, agents: [{ id: 'agent-1', name: 'Atlas', alias: 'atlas', description: '', instructions: '', runtime: 'codex', model: '', color: '#fff', avatar: '', canWrite: false, computerUse: false, approvalMode: 'automatic', revision: 1, createdAt: '' }], workspaces: [], conversations: [{ id: 'conv-1', name: 'Refatoração', kind: 'direct', agentIds: ['agent-1'], workspaceId: 'ws-1', createdAt: '', archived: false }], messages: [], runs: [], fileChanges: [], approvals: [], terminalEnabled: true }),
    }
    vi.stubGlobal('appAPI', activityAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open />)
    fireEvent.click(screen.getByRole('button', { name: /Atividade/ }))
    expect(await screen.findByText('npm test')).toBeInTheDocument()
    expect(screen.getByText('Atlas · Refatoração', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText('completed · 0')).toBeInTheDocument()
  })
})
