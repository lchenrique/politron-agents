import { useEffect, useState } from 'react'
import { DEFAULT_IMAGE_MODELS, type ImageApiProvider, type ImageGenerationSettings, type ImageGenerationStatus } from '../../../../shared/v9'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorText } from './appShellShared'

const IMAGE_PROVIDER_LABEL: Record<ImageGenerationSettings['provider'], string> = { off: 'Desativada', codex: 'Codex (conta ChatGPT)', antigravity: 'Antigravity (Gemini)', api: 'Chave de API' }
const IMAGE_API_LABEL: Record<ImageApiProvider, string> = { openai: 'OpenAI (GPT Image)', gemini: 'Google Gemini (Nano Banana)', openrouter: 'OpenRouter' }

/** Escolha do provedor da ferramenta generate_image; a chave salva nunca volta ao renderer. */
export function ImageGenerationPanel() {
  const [status, setStatus] = useState<ImageGenerationStatus | null>(null)
  const [draft, setDraft] = useState<ImageGenerationSettings>({ provider: 'off', apiProvider: 'openai', model: DEFAULT_IMAGE_MODELS.openai })
  const [key, setKey] = useState(''), [busy, setBusy] = useState<'' | 'save' | 'test'>(''), [feedback, setFeedback] = useState(''), [preview, setPreview] = useState('')
  useEffect(() => {
    let active = true
    // A leitura consulta o login do Codex e do agy; pode levar alguns segundos.
    void window.appAPI.imageGenerationStatus().then(value => { if (!active) return; setStatus(value); setDraft({ provider: value.provider, apiProvider: value.apiProvider, model: value.model }) }).catch(error => { if (active) setFeedback(errorText(error)) })
    return () => { active = false }
  }, [])
  const engine = draft.provider === 'codex' || draft.provider === 'antigravity' ? status?.engines[draft.provider] : null
  const hasKey = !!status?.keys[draft.apiProvider]
  const saved = !!status && status.provider === draft.provider && status.apiProvider === draft.apiProvider && status.model === draft.model && !key.trim()
  const save = async () => {
    setBusy('save'); setFeedback(''); setPreview('')
    try {
      const next = await window.appAPI.saveImageGeneration(draft, key.trim() || undefined)
      setStatus(next); setKey('')
      setFeedback(draft.provider === 'off' ? 'Geração de imagens desativada.' : 'Configuração salva. Use Testar para gerar uma imagem de prova.')
    } catch (error) { setFeedback(errorText(error)) } finally { setBusy('') }
  }
  const clearKey = async () => {
    setBusy('save'); setFeedback('')
    try { setStatus(await window.appAPI.clearImageGenerationKey(draft.apiProvider)); setFeedback('Chave removida.') } catch (error) { setFeedback(errorText(error)) } finally { setBusy('') }
  }
  const test = async () => {
    setBusy('test'); setPreview('')
    setFeedback(draft.provider === 'api' ? 'Gerando imagem de teste…' : 'Gerando imagem de teste. O CLI costuma levar cerca de um minuto…')
    try { const result = await window.appAPI.testImageGeneration(); setPreview(result.dataUrl); setFeedback('Imagem de teste gerada.') } catch (error) { setFeedback(errorText(error)) } finally { setBusy('') }
  }
  const warn = 'rounded-md text-xs leading-5 text-muted-foreground data-[tone=warning]:border data-[tone=warning]:border-warning/30 data-[tone=warning]:bg-warning-soft data-[tone=warning]:px-3 data-[tone=warning]:py-2 data-[tone=warning]:text-foreground'
  return <div className="space-y-4">
    <label className="block space-y-1.5 text-xs font-medium">Quem gera as imagens<Select value={draft.provider} onValueChange={value => setDraft(current => ({ ...current, provider: value as ImageGenerationSettings['provider'] }))}><SelectTrigger aria-label="Quem gera as imagens" className="h-10"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(IMAGE_PROVIDER_LABEL) as ImageGenerationSettings['provider'][]).map(id => <SelectItem key={id} value={id}>{IMAGE_PROVIDER_LABEL[id]}</SelectItem>)}</SelectContent></Select></label>
    {(draft.provider === 'codex' || draft.provider === 'antigravity') && <p data-tone={engine && !engine.available ? 'warning' : undefined} className={warn}>
      {!status ? 'Verificando o login do CLI…' : engine?.available
        ? draft.provider === 'codex' ? 'Codex logado. Usa a geração de imagens da sua conta ChatGPT, sem chave extra. Cada imagem leva cerca de um minuto.' : 'Antigravity logado. Usa o gerador de imagens do Gemini na sua conta Google, sem chave extra. Cada imagem leva cerca de um minuto.'
        : engine?.reason}
    </p>}
    {draft.provider === 'api' && <>
      <label className="block space-y-1.5 text-xs font-medium">Provedor da chave<Select value={draft.apiProvider} onValueChange={value => setDraft(current => ({ ...current, apiProvider: value as ImageApiProvider, model: DEFAULT_IMAGE_MODELS[value as ImageApiProvider] }))}><SelectTrigger aria-label="Provedor da chave" className="h-10"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(IMAGE_API_LABEL) as ImageApiProvider[]).map(id => <SelectItem key={id} value={id}>{IMAGE_API_LABEL[id]}</SelectItem>)}</SelectContent></Select></label>
      <label className="block space-y-1.5 text-xs font-medium">Modelo de imagem<Input aria-label="Modelo de imagem" value={draft.model} onChange={event => setDraft(current => ({ ...current, model: event.target.value }))} placeholder={DEFAULT_IMAGE_MODELS[draft.apiProvider]} className="h-10 font-mono text-xs" /></label>
      <label className="block space-y-1.5 text-xs font-medium">Chave de API<Input aria-label="Chave de API de imagens" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder={hasKey ? 'Chave configurada; cole outra para substituir' : 'Cole a chave do provedor'} className="h-10 font-mono text-xs" /></label>
      <p className="text-xs text-muted-foreground">{hasKey ? 'Chave configurada e criptografada neste computador.' : 'Sem chave salva para este provedor.'} O prompt da imagem vai para o provedor escolhido e o uso é cobrado na sua conta.</p>
    </>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={!!busy || saved} onClick={() => void save()}>{busy === 'save' ? 'Salvando…' : 'Salvar'}</Button>
      <Button variant="outline" disabled={!!busy || !saved || status?.provider === 'off'} onClick={() => void test()}>{busy === 'test' ? 'Gerando…' : 'Testar'}</Button>
      {draft.provider === 'api' && hasKey && <Button variant="outline" disabled={!!busy} onClick={() => void clearKey()}>Remover chave</Button>}
    </div>
    <p role="status" className="text-xs text-muted-foreground empty:hidden">{feedback}</p>
    {preview && <img src={preview} alt="Imagem de teste gerada" className="max-h-64 rounded-md border border-border object-contain" />}
  </div>
}
