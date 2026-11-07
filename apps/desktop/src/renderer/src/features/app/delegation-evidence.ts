import type { Approval, Conversation, FileChange, Message } from '../../../../shared/v9'

/** Pendências das conversas delegadas a partir desta (filhas, netas…): o líder repassa o que precisa do usuário. */
export function selectDescendantApprovals(conversationId: string, conversations: Conversation[], approvals: Approval[]) {
  const descendants = new Set<string>()
  let frontier = [conversationId]
  while (frontier.length) {
    const parents = new Set(frontier)
    frontier = conversations.filter(item => item.parentConversationId && parents.has(item.parentConversationId) && item.id !== conversationId && !descendants.has(item.id)).map(item => item.id)
    for (const id of frontier) descendants.add(id)
  }
  return approvals.filter(approval => approval.status === 'pending' && descendants.has(approval.conversationId))
}

export function selectVisibleRunEvidence(messages: Message[], fileChanges: FileChange[], approvals: Approval[]) {
  const messageRunIds = new Set(messages.map(message => message.runId).filter((id): id is string => !!id))
  return {
    fileChanges: fileChanges.filter(change => messageRunIds.has(change.runId)),
    approvals: approvals.filter(approval => messageRunIds.has(approval.runId)),
  }
}
