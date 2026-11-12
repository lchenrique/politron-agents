import { useCallback, useEffect, useState } from 'react'
import { CUA_DRIVER_URL, type ComputerUseStatus } from '../../../../shared/computer-use'
import { Button } from '@/components/ui/button'
import { errorText } from './appShellShared'

const SOURCE_LABEL = { boobot: 'pasta do Boobot', cua: 'instalação oficial do Cua', openbot: 'cópia do OpenBot' } as const
const RUNTIME_LABEL: Record<string, string> = { codex: 'Codex', claude: 'Claude', pi: 'Pi', opencode: 'OpenCode' }

/** Configurações → Computer Use: estado do cua-driver, motores suportados, o que a aprovação concede e as autorizações vigentes (revogáveis). */
export function ComputerUsePanel() {
  const api = window.computerUseAPI
  const [status, setStatus] = useState<ComputerUseStatus | null>(null)
  const [feedback, setFeedback] = useState('')
  const reload = useCallback(async () => {
    if (!api) return
    try { setStatus(await api.status()); setFeedback('') } catch (error) { setFeedback(errorText(error)) }
  }, [api])
  useEffect(() => { void reload() }, [reload])
  if (!api) return <p className="text-sm text-muted-foreground">O Computer Use está disponível somente no aplicativo desktop.</p>
  const driver = status?.driver
  return <div className="space-y-4 text-sm">
    <section aria-label="Estado do driver" className="space-y-1">
      <p className="font-medium">Driver cua-driver: {!driver ? 'verificando…' : driver.state === 'installed' ? `instalado (versão ${driver.version})` : driver.state === 'invalid' ? 'encontrado, mas não executa' : 'não instalado'}</p>
      {driver?.path && <p className="break-all text-xs text-muted-foreground">{driver.path}{driver.source ? ` · ${SOURCE_LABEL[driver.source]}` : ''}</p>}
      {driver && driver.state !== 'installed' && <p className="text-xs text-muted-foreground">{driver.error} Instale o projeto open source <a className="underline" href={CUA_DRIVER_URL} target="_blank" rel="noreferrer">trycua/cua</a> (licença MIT). O Boobot não baixa nem copia o binário sozinho; sem ele, o controle do Windows fica indisponível.</p>}
      <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>Verificar de novo</Button>
    </section>
    <section aria-label="Motores" className="space-y-1">
      <p className="font-medium">Motores</p>
      <ul className="space-y-0.5 text-xs text-muted-foreground">{status?.runtimes.map(item => <li key={item.runtime}><span className="font-medium text-foreground">{RUNTIME_LABEL[item.runtime] ?? item.runtime}</span>: {item.supported ? 'disponível' : 'indisponível'}. {item.note}</li>)}</ul>
    </section>
    <section aria-label="O que a aprovação permite" className="space-y-1">
      <p className="font-medium">O que a aprovação permite</p>
      <p className="text-xs text-muted-foreground">Fica desligado até você ativar Computer Use no Boo e no projeto. A primeira ação de desktop em cada conversa pede a sua aprovação no computador (no Telegram a resposta é só na janela do Boobot). Autorizado, o Boo vê janelas, clica, digita e abre ou fecha programas como se fosse você, inclusive em sites e apps em que você está logado. Títulos de janelas e textos lidos são dados, nunca ordens. Cada ferramenta usada aparece no histórico da conversa, sem o texto digitado. O servidor do driver só roda durante a execução do Boo.</p>
    </section>
    <section aria-label="Autorizações vigentes" className="space-y-1">
      <p className="font-medium">Autorizações vigentes</p>
      {status && !status.grants.length && <p className="text-xs text-muted-foreground">Nenhuma conversa autorizada.</p>}
      <ul className="space-y-1">{status?.grants.map(grant => <li key={`${grant.conversationId}:${grant.agentId}`} className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">{grant.agentName} em {grant.conversationTitle || 'conversa sem título'}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void api.revoke(grant.conversationId, grant.agentId).then(setStatus).catch(error => setFeedback(errorText(error)))}>Revogar</Button>
      </li>)}</ul>
    </section>
    {feedback && <p role="alert" className="text-xs text-destructive">{feedback}</p>}
  </div>
}
