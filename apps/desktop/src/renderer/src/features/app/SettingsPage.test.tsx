import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsPage } from './SettingsPage'

const appAPI = {
  snapshot: vi.fn().mockResolvedValue({ assistant: { computerUse: false, approvalMode: 'ask' }, terminalEnabled: true }),
  settingsPreferences: vi.fn().mockResolvedValue({ canWrite: true, computerUse: false, approvalMode: 'ask', terminalEnabled: true }),
  hasClaudeCredential: vi.fn().mockResolvedValue(false),
  openRouterDecisionStatus: vi.fn().mockResolvedValue({ configured: false, modelId: 'typesafe/jev-1.13' }),
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
    const { unmount } = render(<SettingsPage open onOpenChange={vi.fn()} />)
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
    appAPI.settingsPreferences.mockResolvedValueOnce({ canWrite: false, computerUse: false, approvalMode: 'ask', terminalEnabled: true })
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Assistente$/ }))
    const writing = await screen.findByRole('checkbox', { name: 'Permitir edição de arquivos do workspace' })
    await waitFor(() => expect(writing).not.toBeChecked())
    fireEvent.click(writing)
    await waitFor(() => expect(appAPI.saveAssistantPreferences).toHaveBeenCalledWith({ canWrite: true, computerUse: false, approvalMode: 'ask' }))
  })

  it('ao abrir Geral não pede snapshot completo nem consulta chaves desnecessárias', async () => {
    vi.clearAllMocks()
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Tema e modo de cor')).toBeInTheDocument()
    expect(appAPI.snapshot).not.toHaveBeenCalled()
    expect(appAPI.settingsPreferences).not.toHaveBeenCalled()
    expect(appAPI.hasClaudeCredential).not.toHaveBeenCalled()
    expect(appAPI.openRouterDecisionStatus).not.toHaveBeenCalled()
  })

  it('carrega apenas preferências pequenas quando entra em Assistente', async () => {
    vi.clearAllMocks()
    vi.stubGlobal('appAPI', appAPI)
    render(<SettingsPage open onOpenChange={vi.fn()} />)
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
    render(<SettingsPage open onOpenChange={vi.fn()} />)
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
  it('não renderiza nada fechado, e abre como diálogo (não substitui o chat)', () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('abre em Geral e navega para Provedores mostrando os CLIs detectados', async () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Tema e modo de cor')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Provedores/ }))
    await waitFor(() => expect(providersAPI.list).toHaveBeenCalled())
    expect(await screen.findByText('codex-cli 0.160.1')).toBeInTheDocument()
    expect(screen.getByText('Não encontrado')).toBeInTheDocument()
    expect(screen.getByText('1 modelos')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Pi'))
    expect(screen.getByText('claude-opus-4-6 (anthropic)')).toBeInTheDocument()
  })

  it('fechar chama onOpenChange, não desmonta a conversa por trás (ela nem é renderizada aqui)', () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    const onOpenChange = vi.fn()
    render(<SettingsPage open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
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
    render(<SettingsPage open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Provedores/ }))
    expect(await screen.findByText('Configure uma chave de API Anthropic no Politron.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Claude Code').closest('summary')!)
    expect(screen.getByText('Configure uma chave de API Anthropic no Politron.')).toBeVisible()
    fireEvent.click(screen.getByText('Codex').closest('summary')!)
    expect(screen.getByText('Catálogo do runtime')).toBeInTheDocument()
    expect(screen.getByText('Modelo disponível')).toBeVisible()
  })

  it('aba Skills lista o que já existe e permite adicionar uma pasta', async () => {
    vi.stubGlobal('appAPI', appAPI)
    vi.stubGlobal('providersAPI', providersAPI)
    vi.stubGlobal('skillsAPI', skillsAPI)
    render(<SettingsPage open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Skills$/ }))
    expect(await screen.findByText('brag')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pasta de skill' }))
    await waitFor(() => expect(skillsAPI.addFromFolder).toHaveBeenCalled())
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
    render(<SettingsPage open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Atualizações$/ }))
    expect(await screen.findByText(/Modo desenvolvimento/)).toBeInTheDocument()
    expect(updatesAPI.status).toHaveBeenCalledTimes(1)
    expect(updatesAPI.check).not.toHaveBeenCalled()
  })
})
