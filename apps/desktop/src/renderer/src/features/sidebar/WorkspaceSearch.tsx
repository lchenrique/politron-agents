import { useMemo } from 'react'
import type { ComponentProps } from 'react'
import ActionSearchBar, { type CommandItem } from '@/components/kokonutui/action-search-bar'
import type { Sidebar } from './Sidebar'
import { buildPaletteItems } from './sidebarIndex'

type WorkspaceSearchProps = Pick<ComponentProps<typeof Sidebar>, 'snapshot' | 'onStartConversation' | 'onSelectWorkspace' | 'onSelectConversation' | 'onOpenAgent' | 'onOpenEditor'> & {
  onSectionChange: (section: 'projects' | 'agents') => void
}

/** Busca rápida da TitleBar. */
export function WorkspaceSearch({ snapshot, onStartConversation, onSelectWorkspace, onSelectConversation, onOpenAgent, onOpenEditor, onSectionChange }: WorkspaceSearchProps) {
  const items = useMemo(() => buildPaletteItems(snapshot, new Map(snapshot.workspaces.map(item => [item.id, item])), new Map(snapshot.agents.map(item => [item.id, item]))), [snapshot])
  const onSelect = (item: CommandItem) => {
    const [type, id] = item.id.split(':')
    if (type === 'create') {
      if (id === 'session') void onStartConversation()
      if (id === 'workspace') onOpenEditor({ kind: 'workspace' })
      if (id === 'agent') onOpenEditor({ kind: 'agent' })
    } else if (type === 'workspace') { onSectionChange('projects'); onSelectWorkspace?.(id) }
    else if (type === 'conversation') { onSectionChange('projects'); onSelectConversation(id) }
    else if (type === 'agent') {
      const agent = snapshot.agents.find(agent => agent.id === id)
      if (agent) { onSectionChange('agents'); void onOpenAgent(agent) }
    }
  }
  return <ActionSearchBar iconOnly items={items} onSelect={onSelect} shortcut label="Busca rápida" placeholder="Buscar projetos, agentes, comandos…" className="boobot-sidebar-search !max-w-none" surfaceClassName="!border-border !bg-popover !shadow-xl dark:!border-border dark:!bg-popover" />
}
