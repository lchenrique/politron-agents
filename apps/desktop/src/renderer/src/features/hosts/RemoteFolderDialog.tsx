import { useEffect, useState } from 'react'
import { Folder, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/dsh'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { RemoteDirectory } from '../../../../shared/hosts'

export function RemoteFolderDialog() {
  const api = window.hostsAPI
  const [request, setRequest] = useState<string | null>(null), [listing, setListing] = useState<RemoteDirectory | null>(null)
  const [path, setPath] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const browse = async (path?: string) => { if (!api) return; setBusy(true); setError(''); try { const data = await api.browse(path); setListing(data); setPath(data.path) } catch (error) { setError(String(error)) } finally { setBusy(false) } }
  useEffect(() => api?.onFolderRequest(id => { setRequest(id); setListing(null); void browse() }), [api])
  const finish = async (path: string | null) => { if (!api || !request) return; try { await api.resolveFolder(request, path); setRequest(null) } catch (error) { setError(String(error)); if (path === null) setRequest(null) } }
  return <Modal open={!!request} onClose={() => { void finish(null) }} title="Escolher pasta no host" description="Esta pasta pertence ao computador remoto." closeLabel="Fechar" contentClassName="max-h-full overflow-y-auto">
    <form onSubmit={event => { event.preventDefault(); void browse(path) }}><FieldGroup><Field><FieldLabel htmlFor="remote-path">Caminho no host</FieldLabel><Input id="remote-path" value={path} onChange={event => setPath(event.target.value)} /></Field><Button type="submit" variant="outline" disabled={busy}>Abrir caminho</Button></FieldGroup></form>
    <Button variant="ghost" disabled={busy || !listing || listing.parent === listing.path} onClick={() => void browse(listing?.parent)}><ArrowUp data-icon="inline-start" />Pasta acima</Button>
    <div className="flex max-h-64 flex-col overflow-y-auto">{listing?.directories.map(directory => <Button key={directory.path} variant="ghost" className="justify-start" disabled={busy} onClick={() => void browse(directory.path)}><Folder data-icon="inline-start" /><span className="truncate">{directory.name}</span></Button>)}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button disabled={busy || !listing} onClick={() => void finish(listing!.path)}>Selecionar esta pasta</Button>
  </Modal>
}
