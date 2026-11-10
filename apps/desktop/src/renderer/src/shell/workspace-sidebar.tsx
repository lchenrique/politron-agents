import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Database, FolderPlus, GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SidebarMode } from './activity-rail'
import { ColoredFolder, FOLDER_COLORS, MiniBoo, SectionLabel } from './primitives'
import { ColorSwatches, FloatingMenu, FloatingMenuItem, FloatingMenuHeader } from './floating-menu'
import type { BooRow, QueueRow, WorkspaceRow } from './appearance'
import { ColorPicker } from './color-picker'

/**
 * Sidebar contextual de 248px: o conteúdo muda com o modo escolhido no activity
 * rail (visão unificada, workspaces, equipe, fila e memória), exatamente como no
 * HTML de referência. As linhas são dados reais do snapshot.
 */

export interface SidebarMemory {
  entries: number
  mcp: ReadonlyArray<{ id: string; name: string; enabled: boolean }>
}

export interface WorkspaceSidebarProps {
  mode: SidebarMode
  boos: BooRow[]
  workspaces: WorkspaceRow[]
  queue: QueueRow[]
  memory: SidebarMemory
  activeAgentId?: string
  worktrees: number
  onSelectAgent: (boo: BooRow) => void
  onSelectSession: (workspaceId: string, sessionId: string) => void
  onToggleWorkspace: (id: string) => void
  onNewBoo: () => void
  onEditBoo: (id: string) => void
  onDeleteBoo: (id: string) => void
  onBooColor: (id: string, hex: string) => void
  onNewWorkspace: () => void
  onEditWorkspace: (id: string) => void
  onDeleteWorkspace: (id: string) => void
  onWorkspaceColor: (id: string, hex: string) => void
  onNewSession: (workspaceId: string) => void
  onRenameSession: (workspaceId: string, sessionId: string) => void
  onDeleteSession: (workspaceId: string, sessionId: string) => void
  onMoveSession: (sessionId: string, targetWorkspaceId: string) => void
  onOpenTool: (tool: 'squad' | 'memory') => void
}

const TITLES: Record<SidebarMode, string> = {
  all: 'Workspace',
  workspaces: 'Projetos & Pastas',
  boos: 'Equipe de Boos',
  queue: 'Fila & Automações',
  memory: 'Memória & MCP',
}

type MenuTarget = { kind: 'boo' | 'ws' | 'session'; id: string; workspaceId?: string }

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const { mode, boos, workspaces, queue, memory, activeAgentId, worktrees } = props
  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState<{ target: MenuTarget; anchor: HTMLElement } | null>(null)
  const [dragSession, setDragSession] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ kind: 'boo' | 'ws'; id: string; anchor: HTMLElement; color: string; label: string } | null>(null)
  const [dropWorkspace, setDropWorkspace] = useState<string | null>(null)
  const query = filter.trim().toLowerCase()

  const filteredBoos = useMemo(() => boos.filter(boo => !query || boo.name.toLowerCase().includes(query) || boo.role.toLowerCase().includes(query)), [boos, query])
  const filteredWorkspaces = useMemo(() => workspaces
    .map(workspace => {
      if (!query) return workspace
      if (workspace.name.toLowerCase().includes(query)) return workspace
      const sessions = workspace.sessions.filter(session => session.title.toLowerCase().includes(query))
      return sessions.length ? { ...workspace, sessions, expanded: true } : null
    })
    .filter((workspace): workspace is WorkspaceRow => workspace !== null), [workspaces, query])

  const openMenu = (target: MenuTarget) => (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const anchor = event.currentTarget
    setMenu(current => current && current.target.kind === target.kind && current.target.id === target.id ? null : { target, anchor })
  }
  const closeMenu = () => setMenu(null)

  const boo = menu?.target.kind === 'boo' ? boos.find(item => item.id === menu.target.id) : undefined
  const workspace = menu?.target.kind === 'ws' ? workspaces.find(item => item.id === menu.target.id)
    : menu?.target.kind === 'session' ? workspaces.find(item => item.id === menu.target.workspaceId) : undefined
  const session = menu?.target.kind === 'session' ? workspace?.sessions.find(item => item.id === menu.target.id) : undefined

  const headerAction = mode === 'boos' || mode === 'all'
    ? <button type="button" onClick={props.onNewBoo} title="Adicionar Novo Boo à Equipe" className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"><Plus className="size-3 text-[var(--accent-primary)]" /><span>Boo</span></button>
    : mode === 'workspaces'
      ? <button type="button" onClick={props.onNewWorkspace} title="Criar Nova Pasta de Workspace" className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"><FolderPlus className="size-3 text-[var(--accent-primary)]" /><span>Pasta</span></button>
      : null

  return (
    <aside aria-label="Navegação do workspace" className="boobot-chrome flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <SectionLabel className="font-mono !text-[11px] !font-normal tracking-wider text-[var(--text-secondary)]">{TITLES[mode]}</SectionLabel>
        <div className="flex items-center gap-1">{headerAction}</div>
      </div>

      <div className="shrink-0 px-2.5 pt-2.5 pb-1.5">
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute top-2 left-2.5 size-3.5 text-[var(--text-muted)]"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
          <input
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder="Filtrar no sidebar..."
            aria-label="Filtrar no sidebar"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] py-1 pr-2.5 pl-8 text-[12px] text-[var(--text-primary)] transition placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
        {(mode === 'all' || mode === 'boos') ? (
          <section>
            <div className="mb-1 flex items-center justify-between px-2">
              <SectionLabel>Agentes · arraste</SectionLabel>
              <button type="button" onClick={() => props.onOpenTool('squad')} className="text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]" title="Gerenciar equipe completa">Gerenciar</button>
            </div>
            <div className="space-y-0.5">
              {filteredBoos.map(row => {
                const isTarget = row.id === activeAgentId
                return (
                  <div key={row.id} className="group relative select-none">
                    <div
                      draggable
                      onDragStart={event => event.dataTransfer.setData('text/plain', `boo:${row.id}`)}
                      onClick={() => props.onSelectAgent(row)}
                      style={{ borderLeft: `2px solid ${isTarget ? row.color : 'transparent'}` }}
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition',
                        isTarget ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
                      )}
                      title={`${row.name} — ${row.role} (${row.model})`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <GripVertical className="size-3 shrink-0 cursor-grab text-[var(--border-strong)] opacity-0 transition group-hover:opacity-100" />
                        <MiniBoo color={row.color} variant={row.variant} size={22} />
                        <span className={cn('truncate text-[12.5px]', isTarget ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-primary)]')}>{row.name}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={cn('text-[11px]', row.waiting ? 'font-medium text-amber-400' : 'text-[var(--text-muted)]')}>{row.waiting ? 'Decisão' : row.shortRole}</span>
                        <span style={{ background: row.color }} className={cn('size-1.5 rounded-full', row.waiting && 'animate-pulse-dot')} />
                        <button type="button" onClick={openMenu({ kind: 'boo', id: row.id })} title={`Ações de ${row.name}`} aria-label={`Ações de ${row.name}`} className="flex size-5 items-center justify-center rounded-md text-[var(--text-secondary)] opacity-0 transition group-hover:opacity-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filteredBoos.length === 0 ? <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">Nenhum agente encontrado.</p> : null}
            </div>
          </section>
        ) : null}

        {(mode === 'all' || mode === 'workspaces') ? (
          <section>
            <div className="mb-1 flex items-center justify-between px-2">
              <SectionLabel>Workspaces</SectionLabel>
              <button type="button" onClick={props.onNewWorkspace} title="Criar nova pasta de workspace" className="rounded p-0.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-primary)]">
                <FolderPlus className="size-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {filteredWorkspaces.map(row => (
                <div key={row.id} className="select-none">
                  <div
                    draggable
                    onDragOver={event => { if (dragSession) { event.preventDefault(); setDropWorkspace(row.id) } }}
                    onDragLeave={() => setDropWorkspace(current => current === row.id ? null : current)}
                    onDrop={event => {
                      event.preventDefault()
                      const sessionId = event.dataTransfer.getData('text/plain').replace('session:', '')
                      setDropWorkspace(null)
                      setDragSession(null)
                      if (sessionId && row.id !== '__free__') props.onMoveSession(sessionId, row.id)
                    }}
                    onClick={() => props.onToggleWorkspace(row.id)}
                    className={cn('group flex cursor-pointer items-center justify-between gap-1 rounded-lg px-1.5 py-1.5 transition hover:bg-[var(--bg-elevated)]', dropWorkspace === row.id && 'sb-drop-inside')}
                    title={`${row.name} (${row.branch})`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <GripVertical className="size-3 shrink-0 cursor-grab text-[var(--border-strong)] opacity-0 transition group-hover:opacity-100" />
                      {row.expanded ? <ChevronDown className="size-3.5 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--text-secondary)]" /> : <ChevronRight className="size-3.5 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--text-secondary)]" />}
                      <ColoredFolder color={row.color} open={row.expanded} />
                      <span className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">{row.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <span className="px-1 font-mono text-[10.5px] text-[var(--text-muted)]">{row.sessions.length}</span>
                      <button type="button" onClick={openMenu({ kind: 'ws', id: row.id })} title={`Ações de ${row.name}`} aria-label={`Ações de ${row.name}`} className="flex size-5 items-center justify-center rounded-md text-[var(--text-secondary)] opacity-0 transition group-hover:opacity-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100">
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {row.expanded ? (
                    <div className="mt-0.5 ml-[18px] space-y-0.5 border-l pl-2" style={{ borderLeftColor: `${row.color}40` }}>
                      {row.sessions.map(item => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={event => { setDragSession(item.id); event.dataTransfer.setData('text/plain', `session:${item.id}`); event.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { setDragSession(null); setDropWorkspace(null) }}
                          onClick={() => props.onSelectSession(row.id, item.id)}
                          className={cn(
                            'group flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-left transition',
                            item.active ? 'bg-[var(--bg-hover)] font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
                            dragSession === item.id && 'sb-dragging',
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span style={{ background: item.active ? row.color : 'var(--border-strong)' }} className="size-1.5 shrink-0 rounded-full" />
                            <span className="truncate text-[12px]">{item.title}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {item.hasGate ? <span className="size-1.5 rounded-full bg-amber-400 animate-pulse-dot" title="Aguardando decisão" /> : null}
                            <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{item.time}</span>
                            <button type="button" onClick={openMenu({ kind: 'session', id: item.id, workspaceId: row.id })} title="Ações da conversa" aria-label="Ações da conversa" className="flex size-4 items-center justify-center rounded text-[var(--text-secondary)] opacity-0 transition group-hover:opacity-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100">
                              <MoreHorizontal className="size-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {row.sessions.length === 0 ? <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">Sem conversas.</p> : null}
                    </div>
                  ) : null}
                </div>
              ))}
              {filteredWorkspaces.length === 0 ? <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">Nenhuma pasta encontrada.</p> : null}
            </div>
          </section>
        ) : null}

        {mode === 'queue' ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-2">
              <SectionLabel className="font-mono">Pipeline da Equipe</SectionLabel>
              <span className="font-mono text-[10px] text-[var(--accent-primary)]">{queue.length} etapas</span>
            </div>
            {queue.length === 0 ? <p className="px-2 text-[11px] text-[var(--text-muted)]">Nada na fila agora.</p> : null}
            {queue.map(item => (
              <div key={item.id} className="space-y-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[var(--text-primary)]">@{item.boo}</span>
                  <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px]', item.state === 'done' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/15 text-amber-300')}>{item.time}</span>
                </div>
                <p className="text-[11.5px] leading-snug text-[var(--text-secondary)]">{item.task}</p>
              </div>
            ))}
          </section>
        ) : null}

        {mode === 'memory' ? (
          <section className="space-y-3">
            <div className="space-y-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-[var(--text-primary)]">Bright Memory</span>
                <span className="font-mono text-[10px] text-[var(--accent-primary)]">{memory.entries} notas</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Decisões de arquitetura e padrões compartilhados entre sessões.</p>
              <button type="button" onClick={() => props.onOpenTool('memory')} className="mt-1 w-full rounded bg-[var(--bg-card)] py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]">Abrir Painel de Memória</button>
            </div>
            <div className="space-y-1.5">
              <div className="px-1"><SectionLabel className="font-mono">Servidores MCP</SectionLabel></div>
              {memory.mcp.length === 0 ? <p className="px-2 text-[11px] text-[var(--text-muted)]">Nenhum servidor configurado.</p> : null}
              {memory.mcp.map(server => (
                <div key={server.id} className="flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-2 text-[11.5px] text-[var(--text-secondary)]">
                  <span className="truncate">{server.name}</span>
                  <span className={cn('size-2 rounded-full', server.enabled ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-muted)]')} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="flex h-[32px] shrink-0 items-center justify-between border-t border-[var(--border-subtle)] px-3 text-[11px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[var(--accent-primary)]" />
          <span>Local Daemon Ativo</span>
        </span>
        <span className="font-mono text-[10.5px]">{worktrees} worktrees</span>
      </div>

      {menu ? (
        <FloatingMenu anchor={menu.anchor} onClose={closeMenu} width={240}>
          {boo ? (
            <>
              <div className="flex items-center gap-2 px-2.5 pb-1">
                <MiniBoo color={boo.color} variant={boo.variant} size={18} />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{boo.name}</div>
                  <div className="truncate text-[10.5px] text-[var(--text-muted)]">{boo.role}</div>
                </div>
              </div>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              <FloatingMenuHeader>Cor do agente</FloatingMenuHeader>
              <div className="pb-2">
                <ColorSwatches current={boo.color} colors={FOLDER_COLORS} onPick={hex => { props.onBooColor(boo.id, hex); closeMenu() }} onCustom={anchor => setPicker({ kind: 'boo', id: boo.id, anchor, color: boo.color, label: '@' + boo.name })} />
              </div>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              <FloatingMenuItem icon={<PencilIcon />} label="Editar agente" onClick={() => { closeMenu(); props.onEditBoo(boo.id) }} />
              {!boo.isChief ? <FloatingMenuItem icon={<TrashIcon />} label="Excluir agente" danger onClick={() => { closeMenu(); props.onDeleteBoo(boo.id) }} /> : null}
            </>
          ) : null}

          {workspace && menu.target.kind === 'ws' ? (
            <>
              <div className="flex items-center gap-2 px-2.5 pb-1">
                <ColoredFolder color={workspace.color} open />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{workspace.name}</div>
                  <div className="truncate font-mono text-[10.5px] text-[var(--text-muted)]">{workspace.branch} · {workspace.path}</div>
                </div>
              </div>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              <FloatingMenuHeader>Cor da pasta</FloatingMenuHeader>
              <div className="pb-2">
                <ColorSwatches current={workspace.color} colors={FOLDER_COLORS} onPick={hex => { props.onWorkspaceColor(workspace.id, hex); closeMenu() }} onCustom={anchor => setPicker({ kind: 'ws', id: workspace.id, anchor, color: workspace.color, label: workspace.name })} />
              </div>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              <FloatingMenuItem icon={<Plus className="size-3.5" />} label="Nova conversa" onClick={() => { closeMenu(); props.onNewSession(workspace.id) }} />
              <FloatingMenuItem icon={<PencilIcon />} label="Editar pasta" onClick={() => { closeMenu(); props.onEditWorkspace(workspace.id) }} />
              {workspaces.length > 1 ? <FloatingMenuItem icon={<TrashIcon />} label="Excluir pasta" danger onClick={() => { closeMenu(); props.onDeleteWorkspace(workspace.id) }} /> : null}
            </>
          ) : null}

          {session && workspace ? (
            <>
              <div className="min-w-0 px-2.5 pb-1">
                <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{session.title}</div>
                <div className="truncate text-[10.5px] text-[var(--text-muted)]">{workspace.name} · {session.time}</div>
              </div>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              <FloatingMenuItem icon={<PencilIcon />} label="Renomear conversa" onClick={() => { closeMenu(); props.onRenameSession(workspace.id, session.id) }} />
              <FloatingMenuItem icon={<TrashIcon />} label="Excluir conversa" danger onClick={() => { closeMenu(); props.onDeleteSession(workspace.id, session.id) }} />
            </>
          ) : null}
        </FloatingMenu>
      ) : null}
      {picker ? (
        <ColorPicker
          anchor={picker.anchor}
          label={picker.label}
          color={picker.color}
          onChange={hex => { if (picker.kind === 'boo') props.onBooColor(picker.id, hex); else props.onWorkspaceColor(picker.id, hex) }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </aside>
  )
}

function PencilIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><path d="M12 20h9" strokeLinecap="round" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
