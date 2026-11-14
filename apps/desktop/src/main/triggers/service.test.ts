// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TriggerService, type CommandRunner, type FolderWatch, type TriggerHost } from './service'
import { renderTriggerTemplate, type Trigger } from '../../shared/triggers'
import { WorkspaceStore } from '../v9/store'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: { fromWebContents: vi.fn() } }))

const CONV = '22222222-2222-4222-8222-222222222222'
const CHILD = '55555555-5555-4555-8555-555555555555'
const dirs: string[] = []
afterEach(() => { vi.useRealTimers(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z') }) })

function setup(options: { gh?: boolean; ghOutput?: () => string } = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'boobot-trigger-')); dirs.push(folder)
  const rows = new Map<string, Trigger>()
  const runs: { conversationId: string; status: string }[] = []
  const listeners = new Map<string, (file: string) => void>()
  const watch: FolderWatch = vi.fn((path, onChange) => { listeners.set(path, onChange); return () => listeners.delete(path) })
  const run: CommandRunner = vi.fn(async (_command, args) => {
    if (!options.gh) throw new Error('ENOENT')
    return args[0] === '--version' ? 'gh version 2.60.0' : options.ghOutput?.() || '[]'
  })
  const host = {
    send: vi.fn(async () => undefined),
    snapshot: vi.fn(() => ({ conversations: [{ id: CONV }, { id: CHILD, parentConversationId: CONV }] })),
    store: {
      triggers: () => [...rows.values()].map(item => ({ ...item })),
      trigger: (id: string) => { const value = rows.get(id); if (!value) throw new Error('Gatilho não encontrado.'); return { ...value } },
      putTrigger: (value: Trigger) => { rows.set(value.id, { ...value }) },
      deleteTrigger: (id: string) => { rows.delete(id) },
      conversation: (id: string) => { if (id !== CONV) throw new Error('Conversa não encontrada.'); return { id, archived: false, workspaceId: 'ws' } },
      workspace: () => ({ path: folder }),
      runs: () => runs,
    },
  } as unknown as TriggerHost & { send: ReturnType<typeof vi.fn> }
  const service = new TriggerService(host, { watch, run })
  const change = (file: string) => listeners.get(folder)!(file)
  return { folder, rows, runs, host, service, run, watch, change, listeners }
}
const sentTexts = (s: ReturnType<typeof setup>) => s.host.send.mock.calls.map(call => call[1] as string)

describe('modelo de mensagem', () => {
  it('troca variáveis conhecidas e mantém as desconhecidas', () => {
    expect(renderTriggerTemplate('{arquivos} em {pasta} {outra}', { arquivos: 'a.txt', pasta: 'D:\\x' })).toBe('a.txt em D:\\x {outra}')
  })
})

describe('gatilho de pasta', () => {
  it('valida pasta e conversa ao salvar', async () => {
    const s = setup()
    await expect(s.service.save({ source: { kind: 'folder', path: 'relativa' }, conversationId: CONV })).rejects.toThrow(/caminho completo/)
    await expect(s.service.save({ source: { kind: 'folder', path: join(s.folder, 'nao-existe') }, conversationId: CONV })).rejects.toThrow(/não existe/)
    await expect(s.service.save({ source: { kind: 'folder', path: s.folder }, conversationId: 'outra' })).rejects.toThrow(/conversa/)
  })

  it('agrupa mudanças com debounce e envia uma mensagem à conversa pelo send normal', async () => {
    const s = setup()
    const trigger = await s.service.save({ name: 'Entrada', source: { kind: 'folder', path: s.folder }, conversationId: CONV, template: 'Mudou: {arquivos} ({quantidade})' })
    s.change('a.txt'); s.change('b.txt'); s.change('a.txt'); s.change('.git/index'); s.change('node_modules/x/y.js')
    await vi.advanceTimersByTimeAsync(1_500)
    expect(s.host.send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(s.host.send).toHaveBeenCalledTimes(1)
    expect(s.host.send).toHaveBeenCalledWith(CONV, '[Gatilho: Entrada]\nMudou: - a.txt\n- b.txt (2)', undefined, undefined, undefined, false, true, false, expect.objectContaining({ delivery: 'queue', returnAfterAcceptance: true }))
    expect(s.rows.get(trigger.id)).toMatchObject({ lastFiredAt: expect.any(String), lastError: null })
  })

  it('desligado não observa; religado volta a observar', async () => {
    const s = setup()
    const trigger = await s.service.save({ source: { kind: 'folder', path: s.folder }, conversationId: CONV })
    await s.service.save({ id: trigger.id, enabled: false })
    expect(s.listeners.size).toBe(0)
    await s.service.save({ id: trigger.id, enabled: true })
    expect(s.listeners.size).toBe(1)
    s.service.remove(trigger.id)
    expect(s.listeners.size).toBe(0)
  })

  it('arquivo alterado pelo próprio Boo (execução ativa na conversa ou numa delegação dela) não dispara de novo', async () => {
    const s = setup()
    await s.service.save({ source: { kind: 'folder', path: s.folder }, conversationId: CONV })
    s.change('pedido.txt')
    await vi.advanceTimersByTimeAsync(2_100)
    expect(s.host.send).toHaveBeenCalledTimes(1)
    // O Boo está trabalhando por causa do disparo e grava um arquivo.
    s.runs.push({ conversationId: CONV, status: 'running' })
    await vi.advanceTimersByTimeAsync(10_000)
    s.change('resultado.txt')
    await vi.advanceTimersByTimeAsync(2_100)
    // Mesmo depois de a execução terminar, o lote que começou com ela fica descartado.
    s.runs.length = 0
    s.change('resultado.txt')
    await vi.advanceTimersByTimeAsync(2_100)
    // Delegação: conversa filha da conversa-alvo também conta como o Boo trabalhando.
    await vi.advanceTimersByTimeAsync(10_000)
    s.runs.push({ conversationId: CHILD, status: 'running' })
    s.change('do-filho.txt')
    await vi.advanceTimersByTimeAsync(2_100)
    expect(s.host.send).toHaveBeenCalledTimes(1)
    // Pouco depois de terminar ainda é tratado como dele; passada a folga, uma mudança externa volta a disparar.
    s.runs.length = 0
    await vi.advanceTimersByTimeAsync(6_000)
    s.change('novo-do-usuario.txt')
    await vi.advanceTimersByTimeAsync(2_100)
    expect(s.host.send).toHaveBeenCalledTimes(2)
    expect(sentTexts(s)[1]).toContain('novo-do-usuario.txt')
  })

  it('limita a 3 disparos por minuto e registra o motivo', async () => {
    const s = setup()
    const trigger = await s.service.save({ source: { kind: 'folder', path: s.folder }, conversationId: CONV })
    for (let i = 0; i < 5; i++) {
      s.change(`f${i}.txt`)
      await vi.advanceTimersByTimeAsync(7_500)
    }
    expect(s.host.send).toHaveBeenCalledTimes(3)
    expect(s.rows.get(trigger.id)!.lastError).toMatch(/3 disparos por minuto/)
    await vi.advanceTimersByTimeAsync(60_000)
    s.change('depois.txt')
    await vi.advanceTimersByTimeAsync(2_100)
    expect(s.host.send).toHaveBeenCalledTimes(4)
  })

  it('falha no envio fica registrada no gatilho', async () => {
    const s = setup()
    s.host.send.mockRejectedValueOnce(new Error('Esta conversa está arquivada.'))
    const trigger = await s.service.save({ source: { kind: 'folder', path: s.folder }, conversationId: CONV })
    s.change('x.txt')
    await vi.advanceTimersByTimeAsync(2_100)
    expect(s.rows.get(trigger.id)!.lastError).toBe('Não foi possível enviar: Esta conversa está arquivada.')
  })
})

describe('gatilhos do GitHub', () => {
  it('sem gh: indisponível com mensagem clara e não deixa ligar', async () => {
    const s = setup({ gh: false })
    expect((await s.service.availability()).github).toEqual({ available: false, reason: expect.stringMatching(/GitHub CLI \(gh\) não encontrado/) })
    await expect(s.service.save({ source: { kind: 'github-issue', label: 'bug' }, conversationId: CONV })).rejects.toThrow(/gh/)
    const off = await s.service.save({ source: { kind: 'github-ci' }, conversationId: CONV, enabled: false })
    expect(off.enabled).toBe(false)
    await s.service.pollGithub()
    expect(s.run).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['run']), expect.anything())
  })

  it('issue nova com label: a primeira leitura só registra, as seguintes disparam com as variáveis', async () => {
    let issues = [{ number: 1, title: 'Antiga', url: 'https://github.com/o/r/issues/1' }]
    const s = setup({ gh: true, ghOutput: () => JSON.stringify(issues) })
    const trigger = await s.service.save({ source: { kind: 'github-issue', label: 'bug' }, conversationId: CONV, template: '#{numero} {titulo} [{label}] {url}' })
    await s.service.pollGithub()
    expect(s.run).toHaveBeenCalledWith('gh', ['issue', 'list', '--label', 'bug', '--state', 'open', '--json', 'number,title,url', '--limit', '30'], s.folder)
    expect(s.host.send).not.toHaveBeenCalled()
    issues = [{ number: 2, title: 'Login quebra', url: 'https://github.com/o/r/issues/2' }, ...issues]
    await s.service.pollGithub()
    await s.service.pollGithub()
    expect(sentTexts(s)).toEqual([`[Gatilho: ${trigger.name}]\n#2 Login quebra [bug] https://github.com/o/r/issues/2`])
  })

  it('CI falho dispara uma vez por execução', async () => {
    let runs: unknown[] = []
    const s = setup({ gh: true, ghOutput: () => JSON.stringify(runs) })
    await s.service.save({ source: { kind: 'github-ci' }, conversationId: CONV, template: '{workflow} em {branch}: {url}' })
    await s.service.pollGithub()
    runs = [{ databaseId: 9, workflowName: 'CI', headBranch: 'main', url: 'https://github.com/o/r/actions/runs/9', displayTitle: 'fix' }]
    await s.service.pollGithub()
    await s.service.pollGithub()
    expect(sentTexts(s)).toEqual(['[Gatilho: CI falhou]\nCI em main: https://github.com/o/r/actions/runs/9'])
  })

  it('erro do gh fica no gatilho sem derrubar os outros', async () => {
    const s = setup({ gh: true, ghOutput: () => 'não é json' })
    const trigger = await s.service.save({ source: { kind: 'github-ci' }, conversationId: CONV })
    await s.service.pollGithub()
    expect(s.rows.get(trigger.id)!.lastError).toMatch(/^GitHub: /)
  })
})

describe('persistência', () => {
  it('v9_triggers grava, lista e apaga no store', () => {
    vi.useRealTimers()
    const directory = mkdtempSync(join(tmpdir(), 'boobot-trigger-store-')); dirs.push(directory)
    const store = new WorkspaceStore(directory)
    try {
      const value: Trigger = { id: 't1', name: 'Pasta', source: { kind: 'folder', path: directory }, conversationId: CONV, template: '{arquivos}', enabled: true, lastFiredAt: null, lastError: null, createdAt: 'x', updatedAt: 'x' }
      store.putTrigger(value)
      expect(store.triggers()).toEqual([value])
      store.putTrigger({ ...value, enabled: false })
      expect(store.trigger('t1').enabled).toBe(false)
      store.deleteTrigger('t1')
      expect(store.triggers()).toEqual([])
    } finally { store.close() }
  })
})
