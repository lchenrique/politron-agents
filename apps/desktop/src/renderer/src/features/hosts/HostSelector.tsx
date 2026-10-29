import { useEffect, useState } from 'react'
import { Check, ChevronDown, Monitor, Plus, Settings2, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { HostsSnapshot } from '../../../../shared/hosts'

const statuses = { connected: 'Conectado', connecting: 'Conectando…', disconnected: 'Desconectado', error: 'Sem conexão' }
export function HostSelector() {
  const api = window.hostsAPI
  const [snapshot, setSnapshot] = useState<HostsSnapshot | null>(null)
  const [modal, setModal] = useState<'add' | null>(null)
  const [pairing, setPairing] = useState(''), [name, setName] = useState(''), [endpoint, setEndpoint] = useState(''), [ssh, setSsh] = useState('')
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('')
  useEffect(() => { if (!api) return; void api.snapshot().then(setSnapshot).catch(error => setFeedback(String(error))); return api.onChanged(setSnapshot) }, [api])
  const run = async (action: () => Promise<unknown>, success = '') => { setBusy(true); setFeedback(''); try { await action(); setFeedback(success) } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  if (!api || !snapshot) return null
  const selected = snapshot.hosts.find(host => host.id === snapshot.selectedId)
  const openLocal = () => window.dispatchEvent(new CustomEvent('boobot:open-settings', { detail: 'conexoes' }))
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size={null} className="dsh-panel-row" aria-label="Selecionar host" title={selected?.name || 'Host indisponível'}><Monitor data-icon="inline-start" /><span className="min-w-0 flex-1 truncate text-left">Remoto</span><span className="dsh-meta">{selected ? statuses[selected.status] : ''}</span><ChevronDown data-icon="inline-end" className="text-[var(--dsh-label-caption)]" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuGroup>{snapshot.hosts.map(host => <DropdownMenuItem key={host.id} disabled={busy} onSelect={() => void run(() => api.select(host.id))}><Monitor /><span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{host.name}</span><span className="truncate text-xs text-muted-foreground">{host.transport === 'local' ? 'Este computador' : host.endpoint}</span></span>{host.id === snapshot.selectedId && <Check />}</DropdownMenuItem>)}</DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup><DropdownMenuItem onSelect={() => { setFeedback(''); setModal('add') }}><Plus />Adicionar host</DropdownMenuItem><DropdownMenuItem onSelect={openLocal}><Settings2 />Configurar este host</DropdownMenuItem>{snapshot.selectedId !== 'local' && <DropdownMenuItem disabled={busy} onSelect={() => void run(() => api.remove(snapshot.selectedId))}><Unplug />Remover conexão selecionada</DropdownMenuItem>}</DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    {selected?.error && <p role="status" className="px-3 text-xs text-destructive">{selected.error}</p>}
    {!modal && feedback && <p role="status" className="px-3 text-xs text-muted-foreground">{feedback}</p>}
    <Dialog open={modal !== null} onOpenChange={open => { if (!open && !busy) { setModal(null); setPairing(''); setFeedback('') } }}><DialogContent className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Adicionar host</DialogTitle><DialogDescription>No Boobot do outro computador, ative o host em Configurações → Conexões e copie o link de pareamento. Projetos e tarefas serão executados lá.</DialogDescription></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); void run(async () => { const host = await api.add({ pairing, name, endpoint, ssh }); setPairing(''); await api.select(host.id); setModal(null) }) }}>
        <FieldGroup>
          <Field><FieldLabel htmlFor="host-pairing">Link de pareamento</FieldLabel><Input id="host-pairing" type="password" value={pairing} onChange={event => setPairing(event.target.value)} autoComplete="off" required /><FieldDescription>O link concede controle dos projetos deste host. Compartilhe apenas entre seus computadores.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="host-name">Nome (opcional)</FieldLabel><Input id="host-name" value={name} onChange={event => setName(event.target.value)} placeholder="PC de casa" /></Field>
          <Field><FieldLabel htmlFor="host-endpoint">Endereço alternativo (opcional)</FieldLabel><Input id="host-endpoint" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="ws://meu-pc-na-vpn:6778/boobot" /><FieldDescription>Acesso direto pela rede local ou VPN. O conteúdo também é criptografado pelo Boobot.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="host-ssh">Túnel SSH (opcional)</FieldLabel><Input id="host-ssh" value={ssh} onChange={event => setSsh(event.target.value)} placeholder="usuário@host:22 ou alias SSH" /><FieldDescription>Requer OpenSSH, chave e host conhecido já configurados. O Boobot conecta à porta local do host pelo túnel.</FieldDescription></Field>
          <Button type="submit" disabled={busy || !pairing}>{busy ? 'Conectando…' : 'Conectar'}</Button>
        </FieldGroup>
      </form>
      {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
    </DialogContent></Dialog>
  </>
}
