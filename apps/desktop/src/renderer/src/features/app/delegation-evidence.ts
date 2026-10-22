import type { Approval, FileChange, Message } from '../../../../shared/v9'

export function selectVisibleRunEvidence(messages: Message[], fileChanges: FileChange[], approvals: Approval[]) {
  const messageRunIds = new Set(messages.map(message => message.runId).filter((id): id is string => !!id))
  return {
    fileChanges: fileChanges.filter(change => messageRunIds.has(change.runId)),
    approvals: approvals.filter(approval => messageRunIds.has(approval.runId)),
  }
}
