/** Prévia de desenvolvimento do escritório com execuções fictícias; os botões simulam eventos sem chamar o processo principal. */
import { useState } from 'react'
import type { Agent, Message, Run, Snapshot } from '../../../../shared/v9'
import { Button } from '@/components/ui/button'
import { emptySnapshot } from '../app/appShellShared'
import { OfficePage } from '../office/OfficePage'

const at = '2026-10-31T01:00:00.000Z'
const agent = (id: string, name: string, color: string, extra: Partial<Agent> = {}): Agent => ({ id, name, alias: id, description: '', instructions: '', runtime: 'claude', model: '', color, avatar: '', canWrite: true, computerUse: false, approvalMode: 'automatic', revision: 1, createdAt: at, ...extra })
const agents = [
  agent('chief', 'Chief', '#4140eb', { role: 'chief', pitsAccentColor: '#ffd23f', pitsHeadAccessory: 'boo-king-crown' }), agent('freya', 'Freya', '#7ee0b5'), agent('hermes', 'Hermes', '#e9eaf0'),
  agent('tyr', 'Tyr', '#ff8fa3'), agent('luna', 'Luna', '#8fd3ff'), agent('mimir', 'Mimir', '#c3b1ff'),
]
const run = (id: string, agentId: string, status: Run['status'], parentId: string | null = null) => ({ id, agentId, conversationId: `c-${id}`, status, parentId, rootId: id, ancestry: [agentId], createdAt: at }) as unknown as Run
const tool = (runId: string, text: string) => ({ id: `t-${runId}`, conversationId: `c-${runId}`, agentId: runId.slice(2), author: '', role: 'activity', text, status: 'running', runId, createdAt: at, tool: { name: 'workspace_write', status: 'running', startedAt: at } }) as Message

export default function OfficeGallery() {
  const [lunaWorking, setLunaWorking] = useState(false)
  const [freyaDone, setFreyaDone] = useState(false)
  const runs = [run('r-chief', 'chief', 'running'), run('r-freya', 'freya', freyaDone ? 'completed' : 'running', 'r-chief'), run('r-hermes', 'hermes', 'running', 'r-chief'), run('r-tyr', 'tyr', 'waiting'),
    ...(lunaWorking ? [run('r-luna', 'luna', 'running', 'r-chief')] : [])]
  const messages = [tool('r-freya', 'Edição · src/features/board/BoardCard.tsx'), tool('r-hermes', 'Terminal · npm run test'), ...(lunaWorking ? [tool('r-luna', 'Leitura · docs/quality.md')] : [])]
  const snapshot = { ...emptySnapshot, agents, runs: freyaDone ? runs.map(item => item.id === 'r-freya' ? { ...item, status: 'completed' } as Run : item) : runs, messages: freyaDone ? messages.filter(item => item.runId !== 'r-freya') : messages } as unknown as Snapshot
  return <div className="flex h-dvh flex-col bg-background" data-office-gallery>
    <div className="flex gap-2 px-7 pt-4">
      <Button size="sm" variant="outline" onClick={() => setLunaWorking(value => !value)}>{lunaWorking ? 'Luna termina' : 'Chief delega para Luna'}</Button>
      <Button size="sm" variant="outline" onClick={() => setFreyaDone(value => !value)}>{freyaDone ? 'Freya volta a trabalhar' : 'Freya conclui'}</Button>
    </div>
    <div className="min-h-0 flex-1"><OfficePage snapshot={snapshot} onOpenAgent={() => undefined} onOpenConversation={() => undefined} /></div>
  </div>
}
