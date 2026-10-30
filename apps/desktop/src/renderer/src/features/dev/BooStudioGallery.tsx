/** Editor real com rascunho local: não altera nenhum agente salvo. */
import { useState } from 'react'
import type { Agent } from '../../../../shared/v9'
import { PoliCustomizer } from '../app/PoliCustomizer'
import { Button } from '@/components/ui/button'
import { Editor } from '../editors/Editor'

export default function BooStudioGallery() {
  const [agent, setAgent] = useState({ id: 'studio-preview', name: 'Boo', color: '#ffffff', avatar: '', runtime: 'codex' } as Agent)
  const [saved, setSaved] = useState(0)
  const [modalOpen, setModalOpen] = useState(() => new URLSearchParams(window.location.search).has('modal'))
  return <main className="min-h-dvh bg-background p-4 text-foreground md:p-8">
    <div className="mx-auto max-w-4xl"><header className="mb-5"><h1 className="text-lg font-semibold">Aparência do agente</h1><p className="mt-1 text-xs text-muted-foreground">Prévia de desenvolvimento · alterações locais, sem modificar agentes salvos</p></header>
      {modalOpen && <Editor kind="agent" initial={{ ...agent, alias: 'boo', description: '', instructions: 'Ajudar com cuidado.', canWrite: false, computerUse: false, approvalMode: 'ask', revision: 1, createdAt: '' }} agents={[]} models={[]} onPickFolder={async () => null} onSave={async value => { setAgent(current => ({ ...current, ...value })); setSaved(count => count + 1) }} onClose={() => setModalOpen(false)} />}
      <form onSubmit={event => { event.preventDefault(); setSaved(count => count + 1) }}>
        <PoliCustomizer agent={agent} onChange={patch => setAgent(current => ({ ...current, ...patch }))} />
        <footer className="mt-4 flex items-center justify-end gap-4"><output data-testid="studio-saved" data-count={saved} className="text-xs text-muted-foreground">{saved ? 'Exemplo salvo nesta prévia' : 'Rascunho local'}</output><Button type="submit">Salvar exemplo</Button></footer>
      </form>
    </div>
  </main>
}
