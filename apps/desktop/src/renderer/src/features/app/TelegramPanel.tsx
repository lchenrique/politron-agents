import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BOTFATHER_URL, type TelegramStatus } from '../../../../shared/telegram'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { errorText } from './appShellShared'

/** QR gerado localmente (SVG), sem serviço externo. */
function QrLink({ url, label }: { url: string; label: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let active = true
    void QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(value => { if (active) setSvg(value) }).catch(() => undefined)
    return () => { active = false }
  }, [url])
  return <div className="flex flex-wrap items-center gap-4">
    <div className="size-36 shrink-0 rounded-md bg-white p-1.5">{svg && <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`QR code para ${url}`} className="size-full" />}</div>
    <div className="min-w-0 space-y-1 text-xs leading-5">
      <p className="font-medium">{label}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-primary underline-offset-2 hover:underline">{url}</a>
    </div>
  </div>
}

const STATE_TEXT = (status: TelegramStatus) => !status.hasToken ? 'Sem bot configurado.'
  : status.state === 'connected' ? `Conectado${status.botUsername ? ` como @${status.botUsername}` : ''}.`
    : status.state === 'connecting' ? 'Conectando ao Telegram…'
      : status.state === 'error' ? status.error || 'Erro na conexão com o Telegram.'
        : 'Desligado.'

/** Configurações → Telegram: token criptografado no main, pareamento por QR e chats autorizados. */
export function TelegramPanel() {
  const api = window.telegramAPI
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('')
  useEffect(() => {
    if (!api) return
    let active = true
    const load = () => void api.status().then(value => { if (active) setStatus(value) }).catch(error => { if (active) setFeedback(errorText(error)) })
    load()
    // O pareamento acontece no celular: o estado é relido enquanto a seção está aberta.
    const timer = setInterval(load, 2000)
    return () => { active = false; clearInterval(timer) }
  }, [api])
  if (!api) return <p className="text-xs text-muted-foreground">O Telegram só pode ser configurado no app desktop.</p>
  const run = async (action: () => Promise<TelegramStatus>, done = '') => {
    setBusy(true); setFeedback('')
    try { setStatus(await action()); setFeedback(done) } catch (error) { setFeedback(errorText(error)) } finally { setBusy(false) }
  }
  const tone = status?.state === 'error' ? 'warning' : undefined
  return <div className="space-y-5">
    <section aria-label="Criar o bot" className="space-y-3">
      <ol className="list-decimal space-y-0.5 pl-5 text-xs leading-5 text-muted-foreground">
        <li>Escaneie o QR com o celular para abrir o @BotFather no Telegram.</li>
        <li>Mande <code>/newbot</code>, escolha um nome e um @username terminado em bot.</li>
        <li>Copie o token que o BotFather enviar e cole no campo abaixo.</li>
      </ol>
      <QrLink url={BOTFATHER_URL} label="Abrir o @BotFather" />
    </section>
    <div className="space-y-2">
      <label className="block space-y-1.5 text-xs font-medium">Token do bot<Input aria-label="Token do bot do Telegram" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder={status?.hasToken ? 'Token configurado; cole outro para trocar de bot' : '123456789:AA…'} className="h-10 font-mono text-xs" /></label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !token.trim()} onClick={() => void run(async () => { const next = await api.saveToken(token); setToken(''); return next }, 'Token validado e salvo. O canal está ligado.')}>{busy ? 'Validando…' : 'Salvar e validar'}</Button>
        {status?.hasToken && <Button variant="outline" disabled={busy} onClick={() => void run(() => api.clearToken(), 'Token removido e chats desconectados.')}>Remover token</Button>}
      </div>
      <p className="text-xs text-muted-foreground">O token fica criptografado neste computador e nunca aparece de novo aqui. O Boobot só faz chamadas de saída ao Telegram; nenhuma porta é aberta.</p>
    </div>
    {status?.hasToken && <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs font-medium"><Checkbox aria-label="Canal Telegram ligado" checked={status.enabled} disabled={busy} onCheckedChange={value => void run(() => api.setEnabled(value === true))} />Canal Telegram ligado</label>
      <p role="status" data-tone={tone} className="rounded-md text-xs leading-5 text-muted-foreground data-[tone=warning]:border data-[tone=warning]:border-warning/30 data-[tone=warning]:bg-warning-soft data-[tone=warning]:px-3 data-[tone=warning]:py-2 data-[tone=warning]:text-foreground">{STATE_TEXT(status)}</p>
    </div>}
    {status?.hasToken && <section aria-label="Parear o celular" className="space-y-3">
      <Button variant="outline" disabled={busy || !status.enabled} onClick={() => void run(() => api.createPairingCode())}>Gerar código de pareamento</Button>
      {status.pairing && <div className="space-y-2">
        {status.pairing.link && <QrLink url={status.pairing.link} label="Escaneie para parear: o Telegram envia o código ao bot com um toque." />}
        <p className="text-xs leading-5 text-muted-foreground">Ou envie ao bot <code className="font-mono text-foreground">/parear {status.pairing.code}</code>. O código vale uma vez, até {new Date(status.pairing.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>
      </div>}
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Chats pareados</p>
        {status.chats.length ? <ul className="space-y-1.5">{status.chats.map(chat => <li key={chat.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs">
          <span className="min-w-0 truncate"><span className="font-medium">{chat.name}</span> <span className="text-muted-foreground">· desde {new Date(chat.pairedAt).toLocaleDateString('pt-BR')}</span></span>
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void run(() => api.revokeChat(chat.id), `${chat.name} não tem mais acesso.`)}>Revogar</Button>
        </li>)}</ul> : <p className="text-xs text-muted-foreground">Nenhum chat pareado ainda.</p>}
      </div>
    </section>}
    <p role="status" className="text-xs text-muted-foreground empty:hidden">{feedback}</p>
  </div>
}
