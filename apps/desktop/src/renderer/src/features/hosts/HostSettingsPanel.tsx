import { useEffect, useState } from 'react'
import { Copy, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { HostSettings, HostsSnapshot } from '../../../../shared/hosts'

export function HostSettingsPanel() {
  const api = window.hostsAPI
  const [snapshot, setSnapshot] = useState<HostsSnapshot | null>(null), [settings, setSettings] = useState<HostSettings | null>(null)
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('')
  useEffect(() => { if (!api) return; void api.snapshot().then(value => { setSnapshot(value); setSettings(value.local) }).catch(error => setFeedback(String(error))); return api.onChanged(setSnapshot) }, [api])
  const run = async (action: () => Promise<unknown>, success: string) => { setBusy(true); setFeedback(''); try { await action(); setFeedback(success) } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  if (!api) return <p>Conexões disponíveis no aplicativo desktop.</p>
  if (!settings || !snapshot) return <p role="status">{feedback || 'Carregando configurações do host…'}</p>
  return <FieldGroup>
    <FieldDescription>Este computador pode receber conexões de outro Boobot. Mantenha o aplicativo aberto, inclusive na bandeja. Sair do aplicativo ou desligar o PC encerra o host.</FieldDescription>
    <Field orientation="horizontal"><Checkbox id="host-enabled" checked={settings.enabled} onCheckedChange={value => setSettings({ ...settings, enabled: value === true })} /><FieldLabel htmlFor="host-enabled">Permitir conexão a este computador</FieldLabel></Field>
    <Field orientation="horizontal"><Checkbox id="host-network" checked={settings.address === '0.0.0.0'} onCheckedChange={value => setSettings({ ...settings, address: value ? '0.0.0.0' : '127.0.0.1' })} /><FieldLabel htmlFor="host-network">Aceitar pela rede local ou VPN</FieldLabel></Field>
    <FieldDescription>Desmarcado, aceita apenas conexões locais ou via SSH. Pareamento autenticado é obrigatório em ambos os casos.</FieldDescription>
    <Field><FieldLabel htmlFor="host-port">Porta</FieldLabel><Input id="host-port" type="number" min={1} max={65535} value={settings.port} onChange={event => setSettings({ ...settings, port: Number(event.target.value) })} /></Field>
    <Field><FieldLabel htmlFor="host-advertised">Endereço acessível pelo outro computador</FieldLabel><Input id="host-advertised" value={settings.advertisedUrl} onChange={event => setSettings({ ...settings, advertisedUrl: event.target.value })} /><FieldDescription>Use o IP/nome da rede ou VPN, por exemplo ws://pc-casa:6778/boobot. Para SSH, mantenha 127.0.0.1.</FieldDescription></Field>
    <Button disabled={busy} onClick={() => void run(async () => { const next = await api.configure(settings); setSnapshot(next); setSettings(next.local) }, 'Configuração salva.')}>{busy ? 'Salvando…' : 'Salvar configuração'}</Button>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !snapshot.local.running} onClick={() => void run(() => api.copyPairing(), 'Link copiado. Ele concede controle do host; compartilhe apenas entre seus computadores.')}><Copy data-icon="inline-start" />Copiar pareamento</Button><Button variant="outline" disabled={busy || !snapshot.local.running} onClick={() => void run(async () => { setSnapshot(await api.revoke()) }, 'Conexões revogadas. Copie um novo link para parear novamente.')}><Unplug data-icon="inline-start" />Revogar conexões</Button></div>
    {snapshot.local.error && <p role="alert" className="text-sm text-destructive">{snapshot.local.error}</p>}
    {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
  </FieldGroup>
}
