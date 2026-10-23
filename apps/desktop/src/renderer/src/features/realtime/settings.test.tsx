import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RealtimeSettingsPanel } from './RealtimeCall'
import { useVoicePreferences } from './preferences'
const status = { geminiKey: true, groqKey: false, localModels: false, vadInstalled: false, parakeetInstalled: false, installedPiperVoices: [], settings: { geminiModel: '', geminiVoice: 'Puck', transcriptionModel: 'whisper-large-v3-turbo', piperVoice: 'faber' } }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
it('permite substituir uma chave já configurada sem expor nem remover a anterior primeiro', async () => {
  const api = { status: vi.fn(async () => status), geminiModels: vi.fn(async () => ['gemini-live-fixture']), saveKey: vi.fn(async () => undefined), clearKey: vi.fn(async () => undefined) }
  vi.stubGlobal('realtimeAPI', api); render(<RealtimeSettingsPanel />)
  const input = await screen.findByLabelText('Chave do Gemini Live')
  expect(input).toHaveValue(''); expect(input).toHaveAttribute('type','password')
  fireEvent.change(input, { target: { value: 'chave-ficticia-de-regressao' } })
  fireEvent.click(screen.getByRole('button', { name: 'Substituir chave' }))
  await waitFor(() => expect(api.saveKey).toHaveBeenCalledWith('gemini', 'chave-ficticia-de-regressao'))
  expect(api.clearKey).not.toHaveBeenCalled()
  await waitFor(() => expect(input).toHaveValue(''))
  expect(screen.getByRole('button', { name: 'Remover chave' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('remoção usa o método do provedor selecionado', async () => {
  const api = { status: vi.fn(async () => status), geminiModels: vi.fn(async () => []), saveKey: vi.fn(), clearKey: vi.fn(async () => undefined) }
  vi.stubGlobal('realtimeAPI', api); render(<RealtimeSettingsPanel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Remover chave' }))
  await waitFor(() => expect(api.clearKey).toHaveBeenCalledWith('gemini'))
})
function PreferencesProbe() { const prefs = useVoicePreferences(); return <><p>{prefs.mode}:{String(prefs.headphones)}</p><button onClick={() => { prefs.setMode('free'); prefs.setHeadphones(true) }}>Salvar preferências</button></> }
it('propaga configuração à ligação na mesma janela e por evento de outra janela', () => {
  render(<PreferencesProbe />)
  fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }))
  expect(screen.getByText('free:true')).toBeInTheDocument()
  expect(localStorage.getItem('politron.realtime.mode')).toBe('free')
  localStorage.setItem('politron.realtime.mode','gemini')
  fireEvent(window, new StorageEvent('storage', { key: 'politron.realtime.mode', newValue: 'gemini' }))
  expect(screen.getByText('gemini:true')).toBeInTheDocument()
})

it('oferece PocketTTS na configuração usada pela chamada real, inclusive partindo de Gemini', async () => {
  const pocket = { installed: true, choices: [
    { id: 'rafael', name: 'Rafael · masculina' },
    { id: 'vera', name: 'Vera · feminina' },
  ], selection: { defaultVoiceId: 'rafael', agentVoiceIds: {} } }
  const api = {
    status: vi.fn(async () => ({ ...status, pocketInstalled: true })),
    saveSettings: vi.fn(async (patch: { ttsEngine: string }) => ({ ...status.settings, ...patch })),
    geminiModels: vi.fn(async () => []),
    saveKey: vi.fn(), clearKey: vi.fn(),
  }
  vi.stubGlobal('realtimeAPI', api)
  vi.stubGlobal('appAPI', { pocketVoices: vi.fn(async () => pocket), snapshot: vi.fn(async () => ({ agents: [] })) })
  render(<RealtimeSettingsPanel />)
  const button = await screen.findByRole('radio', { name: /PocketTTS/ })
  fireEvent.click(button)
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ ttsEngine: 'pocket' }))
  expect(localStorage.getItem('politron.realtime.mode')).toBe('free')
  expect(await screen.findByRole('region', { name: 'Vozes PocketTTS' })).toBeInTheDocument()
  await screen.findByRole('option', { name: 'Rafael · masculina' })
  expect(screen.getByLabelText('Selecionar voz PocketTTS')).toHaveValue('rafael')
})
