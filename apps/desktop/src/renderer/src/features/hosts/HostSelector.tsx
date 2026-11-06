import { useEffect, useState } from 'react'
import { Check, ChevronDown, Monitor, Plus, Settings2, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Menu, MenuGroup, MenuItemButton } from '@/components/dsh'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { HostsSnapshot } from '../../../../shared/hosts'

const statuses = { connected: 'Conectado', connecting: 'Conectando…', disconnected: 'Desconectado', error: 'Sem conexão' }
/** Botão da barra da janela: nome do host e estado da conexão. */
export function HostSelector() {
  const api = window.hostsAPI
  const [snapshot, setSnapshot] = useState<HostsSnapshot | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<'add' | null>(null)
  const [pairing, setPairing] = useState(''), [name, setName] = useState(''), [endpoint, setEndpoint] = useState(''), [ssh, setSsh] = useState('')
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('')
  useEffect(() => { if (!api) return; void api.snapshot().then(setSnapshot).catch(error => setFeedback(String(error))); return api.onChanged(setSnapshot) }, [api])
  const run = async (action: () => Promise<unknown>, success = '') => { setBusy(true); setFeedback(''); try { await action(); setFeedback(success) } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  if (!api || !snapshot) return null
  const selected = snapshot.hosts.find(host => host.id === snapshot.selectedId)
  const openLocal = () => window.dispatchEvent(new CustomEvent('boobot:open-settings', { detail: 'conexoes' }))
  return <>
    <Menu open={menuOpen} onClose={() => setMenuOpen(false)} align="start" portal listClassName="w-80" autoFocus
      anchor={<Button variant="ghost" size={null} className="flex h-7 max-w-48 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-[var(--dsh-label-secondary)] hover:bg-[var(--dsh-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring" aria-label="Selecionar host" title={[selected?.name || 'Host indisponível', selected ? statuses[selected.status] : '', selected?.error].filter(Boolean).join(' · ')}
        aria-haspopup="menu" aria-expanded={menuOpen} onKeyDown={event => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setMenuOpen(value => !value) } }} onClick={() => setMenuOpen(value => !value)}>
        <><Monitor className="size-3.5 shrink-0" /><span className="min-w-0 truncate">{selected?.name || 'Host'}</span>{selected && <span aria-label={statuses[selected.status]} className={'size-1.5 shrink-0 rounded-full ' + (selected.status === 'connected' ? 'bg-success' : selected.status === 'connecting' ? 'bg-warning' : 'bg-destructive')} />}<ChevronDown className="size-3 shrink-0 opacity-70" /></>
      </Button>}>
      <MenuGroup label="Hosts">
        {snapshot.hosts.map(host => <MenuItemButton key={host.id} disabled={busy} icon={<Monitor />} onSelect={() => { setMenuOpen(false); void run(() => api.select(host.id)) }}>
          <span className="flex min-w-0 flex-1 items-center gap-2"><span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{host.name}</span><span className="truncate text-xs text-muted-foreground">{host.transport === 'local' ? 'Este computador' : host.endpoint}</span></span>{host.id === snapshot.selectedId && <Check className="size-4 shrink-0" aria-label="Selecionado" />}</span>
        </MenuItemButton>)}
      </MenuGroup>
      <MenuGroup label="Gerenciar">
        <MenuItemButton icon={<Plus />} onSelect={() => { setMenuOpen(false); setFeedback(''); setModal('add') }}>Adicionar host</MenuItemButton>
        <MenuItemButton icon={<Settings2 />} onSelect={() => { setMenuOpen(false); openLocal() }}>Configurar este host</MenuItemButton>
        {snapshot.selectedId !== 'local' && <MenuItemButton icon={<Unplug />} disabled={busy} onSelect={() => { setMenuOpen(false); void run(() => api.remove(snapshot.selectedId)) }}>Remover conexão selecionada</MenuItemButton>}
      </MenuGroup>
    </Menu>
    {selected?.error && <p role="status" className="sr-only">{selected.error}</p>}
    {!modal && feedback && <p role="status" className="sr-only">{feedback}</p>}
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
