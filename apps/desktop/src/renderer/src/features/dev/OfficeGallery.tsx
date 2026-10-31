/** Prévia de desenvolvimento do escritório com execuções fictícias em todos os estados; nada chega ao processo principal. */
import type { Agent, Message, Run, Snapshot } from '../../../../shared/v9'
import { emptySnapshot } from '../app/appShellShared'
import { OfficePage } from '../office/OfficePage'

const at = '2026-10-31T01:00:00.000Z'
const agent = (id: string, name: string, color: string, extra: Partial<Agent> = {}): Agent => ({ id, name, alias: id, description: '', instructions: '', runtime: 'claude', model: '', color, avatar: '', canWrite: true, computerUse: false, approvalMode: 'automatic', revision: 1, createdAt: at, ...extra })
const agents = [
  agent('chief', 'Chief', '#4140eb', { role: 'chief', pitsAccentColor: '#ffd23f' }), agent('freya', 'Freya', '#7ee0b5'), agent('hermes', 'Hermes', '#e9eaf0'),
  agent('tyr', 'Tyr', '#ff8fa3'), agent('luna', 'Luna', '#8fd3ff'), agent('mimir', 'Mimir', '#c3b1ff'),
]
const run = (id: string, agentId: string, status: Run['status'], parentId: string | null = null) => ({ id, agentId, conversationId: `c-${id}`, status, parentId, rootId: id, ancestry: [agentId], createdAt: at }) as unknown as Run
const runs = [run('r-chief', 'chief', 'running'), run('r-freya', 'freya', 'running', 'r-chief'), run('r-hermes', 'hermes', 'running', 'r-chief'), run('r-tyr', 'tyr', 'waiting'), run('r-luna', 'luna', 'queued', 'r-chief')]
const tool = (runId: string, text: string) => ({ id: `t-${runId}`, conversationId: `c-${runId}`, agentId: runId.slice(2), author: '', role: 'activity', text, status: 'running', runId, createdAt: at, tool: { name: 'workspace_write', status: 'running', startedAt: at } }) as Message
const messages = [tool('r-freya', 'Edição · src/features/board/BoardCard.tsx'), tool('r-hermes', 'Terminal · npm run test')]
const snapshot = { ...emptySnapshot, agents, runs, messages } as unknown as Snapshot

export default function OfficeGallery() {
  return <div className="h-dvh bg-background" data-office-gallery>
    <OfficePage snapshot={snapshot} onOpenAgent={() => undefined} onOpenConversation={() => undefined} />
  </div>
}
