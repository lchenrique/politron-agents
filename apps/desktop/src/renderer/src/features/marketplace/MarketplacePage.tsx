/** Marketplace: equipes prontas de Boos, gratuitas, que a pessoa contrata para um projeto ou como equipe global. */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Loader2, Search, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/dsh'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Agent, Model, Snapshot } from '../../../../shared/v9'
import type { MarketplaceMember, MarketplaceTeam } from '../../../../shared/marketplace'
import { PoliAvatar } from '../app/PoliAvatar'
import { ModelSelector } from '../composer/ModelSelector'
import { errorText } from '../app/appShellShared'
import './marketplace.css'

const RUNTIMES: { id: Agent['runtime']; label: string }[] = [
  { id: 'codex', label: 'Codex' }, { id: 'claude', label: 'Claude Agent SDK' }, { id: 'pi', label: 'Pi Coding Agent (CLI)' },
  { id: 'opencode', label: 'OpenCode' }, { id: 'antigravity', label: 'Antigravity' },
]
const PROVIDER: Record<Agent['runtime'], string> = { codex: 'Codex', claude: 'Claude Code', pi: 'Pi', opencode: 'OpenCode', antigravity: 'Antigravity' }
const GLOBAL = '__global__'

/** Membro do catálogo desenhado como um Boo de verdade (cor e acessório da equipe). */
const memberAgent = (member: MarketplaceMember) => ({ id: `market-${member.key}`, name: member.name, alias: member.alias, color: member.color, pitsHeadAccessory: member.pitsHeadAccessory, avatar: '' }) as unknown as Agent
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const skillCount = (team: MarketplaceTeam) => new Set(team.members.flatMap(member => member.skills)).size
/** Líder no meio e os demais alternando dos dois lados: a equipe aparece como um grupo, não como uma fila. */
function lineup(team: MarketplaceTeam) {
  const leader = team.members.find(member => member.key === team.leader) || team.members[0]!
  const others = team.members.filter(member => member !== leader)
  return [...others.filter((_, index) => index % 2 === 1).reverse(), leader, ...others.filter((_, index) => index % 2 === 0)]
}

export function MarketplacePage({ snapshot, models, onHired, onNotice }: {
  snapshot: Snapshot
  models: Model[]
  onHired: (conversationId: string) => void
  onNotice: (message: string) => void
}) {
  const [teams, setTeams] = useState<MarketplaceTeam[] | null>(null)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<MarketplaceTeam | null>(null)
  const [hiring, setHiring] = useState<MarketplaceTeam | null>(null)
  const [area, setArea] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!window.appAPI.marketplaceTeams) { setTeams([]); setError('O Marketplace está disponível só no app do computador.'); return }
    window.appAPI.marketplaceTeams().then(setTeams, cause => { setTeams([]); setError(errorText(cause)) })
  }, [])
  const areas = useMemo(() => [...new Set((teams || []).map(team => team.area))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [teams])
  const visible = useMemo(() => {
    const term = normalize(query.trim())
    return (teams || []).filter(team => (!area || team.area === area) && (!term || normalize([team.name, team.area, team.description, ...team.members.flatMap(member => [member.name, member.role, ...member.skills])].join(' ')).includes(term)))
  }, [teams, area, query])

  return <section className="market" aria-label="Marketplace de equipes">
    <header className="market__header">
      <div className="market__heading">
        <h1 className="market__title">Marketplace</h1>
        <p className="market__summary">Equipes prontas de Boos, de graça. Escolha uma, diga para onde ela vai e comece a trabalhar.</p>
      </div>
      {!!teams?.length && <label className="market__search">
        <Search aria-hidden="true" className="size-4" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar equipe, papel ou skill" aria-label="Buscar equipe, papel ou skill" />
      </label>}
    </header>
    {areas.length > 1 && <div className="market__filters" role="group" aria-label="Filtrar por área">
      {['', ...areas].map(item => <button key={item || 'todas'} type="button" className="market-chip" aria-pressed={area === item} onClick={() => setArea(item)}>
        {item || 'Todas'}<span className="market-chip__count">{item ? teams!.filter(team => team.area === item).length : teams!.length}</span>
      </button>)}
    </div>}
    {teams === null ? <p className="market__empty"><Loader2 className="size-4 animate-spin" /> Carregando equipes…</p>
      : error ? <p className="market__empty" role="alert">{error}</p>
      : !teams.length ? <p className="market__empty"><Store className="size-4" /> Nenhuma equipe no catálogo ainda.</p>
      : !visible.length ? <p className="market__empty">Nenhuma equipe combina com essa busca. <button type="button" className="market__reset" onClick={() => { setQuery(''); setArea('') }}>Limpar filtros</button></p>
      : <div className="market__grid">
        {visible.map(team => {
          const stage = lineup(team)
          const middle = (stage.length - 1) / 2
          return <article key={team.id} className="market-card" aria-labelledby={`team-${team.id}`} style={{ '--team': stage[Math.round(middle)]!.color } as CSSProperties}>
            <div className="market-card__stage" aria-hidden="true">
              {stage.map((member, index) => {
                const lead = member.key === team.leader
                return <span key={member.key} className="market-card__boo" data-lead={lead || undefined} style={{ '--i': index, '--drop': `${Math.abs(index - middle) * 3}px` } as CSSProperties}>
                  <PoliAvatar agent={memberAgent(member)} size={lead ? 40 : 30} motionPolicy="hover" />
                </span>
              })}
            </div>
            <h2 id={`team-${team.id}`} className="market-card__name">{team.name}</h2>
            <p className="market-card__meta">{team.area} · {plural(team.members.length, 'Boo', 'Boos')} · {plural(skillCount(team), 'skill', 'skills')}</p>
            <p className="market-card__description">{team.description}</p>
            <footer className="market-card__actions">
              <Button variant="ghost" size="sm" onClick={() => setViewing(team)}>Ver equipe</Button>
              <Button size="sm" onClick={() => setHiring(team)}>Contratar</Button>
            </footer>
          </article>
        })}
      </div>}
    {viewing && <TeamDialog team={viewing} onClose={() => setViewing(null)} onHire={() => { setHiring(viewing); setViewing(null) }} />}
    {hiring && <HireDialog team={hiring} snapshot={snapshot} models={models} onClose={() => setHiring(null)} onHired={(conversationId, where) => { setHiring(null); onNotice(`${hiring.name} contratada ${where}.`); onHired(conversationId) }} />}
  </section>
}

/** Quem é cada Boo da equipe, o que faz e quais skills traz. */
function TeamDialog({ team, onClose, onHire }: { team: MarketplaceTeam; onClose: () => void; onHire: () => void }) {
  return <Modal open onClose={onClose} title={team.name} closeLabel="Fechar" description={`${team.area} · ${plural(team.members.length, 'Boo', 'Boos')} · ${plural(skillCount(team), 'skill', 'skills')}. ${team.description}`}
    className="market-team-modal" footer={<><Button variant="ghost" onClick={onClose}>Fechar</Button><Button onClick={onHire}>Contratar</Button></>}>
    <ul className="market-team" aria-label={`Membros da ${team.name}`}>
      {team.members.map(member => <li key={member.key} className="market-detail">
        <div className="market-detail__head">
          <PoliAvatar agent={memberAgent(member)} size={34} motionPolicy="never" />
          <span><strong>{member.name}</strong>{member.key === team.leader && <span className="market-detail__lead">líder</span>}<span className="market-detail__role">{member.role}</span></span>
        </div>
        <p className="market-detail__text">{member.description}</p>
        <p className="market-detail__skills" aria-label={`Skills de ${member.name}`}>{member.skills.map(skill => <span key={skill} className="market-skill">{skill}</span>)}</p>
      </li>)}
    </ul>
  </Modal>
}

function HireDialog({ team, snapshot, models, onClose, onHired }: { team: MarketplaceTeam; snapshot: Snapshot; models: Model[]; onClose: () => void; onHired: (conversationId: string, where: string) => void }) {
  const chief = snapshot.agents.find(agent => agent.role === 'chief')
  const projects = useMemo(() => snapshot.workspaces.filter(item => !item.archived && item.kind !== 'worktree' && !(item.kind === 'free' && item.name === 'Livre')), [snapshot.workspaces])
  const [destination, setDestination] = useState(GLOBAL)
  const [runtime, setRuntime] = useState<Agent['runtime']>(chief?.runtime || 'codex')
  const [model, setModel] = useState(chief?.model || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const project = projects.find(item => item.id === destination)
  const full = !!project && project.defaultAgentIds.length + team.members.length > 10
  const hire = async () => {
    setBusy(true); setError('')
    try {
      const result = await window.appAPI.hireTeam!({ teamId: team.id, workspaceId: project?.id, runtime, model: model || undefined })
      onHired(result.conversationId, project ? `para o projeto ${project.name}` : 'como equipe global')
    } catch (cause) { setError(errorText(cause)); setBusy(false) }
  }
  return <Modal open onClose={busy ? () => undefined : onClose} title={`Contratar ${team.name}`} closeLabel="Fechar" description={`${team.members.length} Boos novos, cada um com suas skills. Depois dá para editar ou excluir como qualquer Boo.`}
    footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button><Button onClick={() => void hire()} disabled={busy || full}>{busy ? <><Loader2 className="size-4 animate-spin" /> Contratando…</> : 'Contratar'}</Button></>}>
    <div className="market-hire">
      <fieldset className="market-hire__where">
        <legend>Para onde a equipe vai?</legend>
        <label className="market-hire__option"><input type="radio" name="destination" checked={destination === GLOBAL} onChange={() => setDestination(GLOBAL)} /><span><strong>Equipe global (livre)</strong><span>Disponível em qualquer conversa, sem projeto.</span></span></label>
        {projects.map(item => <label key={item.id} className="market-hire__option"><input type="radio" name="destination" checked={destination === item.id} onChange={() => setDestination(item.id)} /><span><strong>{item.name}</strong><span>{item.defaultAgentIds.length ? `Já tem ${item.defaultAgentIds.length} Boo${item.defaultAgentIds.length === 1 ? '' : 's'} na equipe padrão.` : 'Entra na equipe padrão do projeto.'}</span></span></label>)}
      </fieldset>
      {full && <p className="market-hire__warn" role="alert">Esse projeto já tem {project!.defaultAgentIds.length} Boos e cabem até 10. Escolha outro destino ou tire alguns Boos de lá.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm">Motor<Select value={runtime} onValueChange={value => { setRuntime(value as Agent['runtime']); setModel('') }}><SelectTrigger aria-label="Motor"><SelectValue /></SelectTrigger><SelectContent>{RUNTIMES.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></label>
        <div className="flex min-w-0 flex-col gap-1.5 text-sm [&_button]:w-full [&_button]:max-w-none [&_button]:justify-between"><span>Modelo</span><ModelSelector label="Modelo" variant="outline" allowInherit={false} value={model ? `${runtime}:${model}` : ''} onValueChange={value => setModel(value.replace(/^(codex|claude|pi|opencode|antigravity):/, ''))} models={models.filter(item => item.runtime === runtime).map(item => ({ ...item, provider: PROVIDER[runtime] }))} /></div>
      </div>
      {error && <p className="market-hire__warn" role="alert">{error}</p>}
    </div>
  </Modal>
}
