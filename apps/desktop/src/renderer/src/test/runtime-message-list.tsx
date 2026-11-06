import type { ComponentProps } from 'react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { MessageList as TranscriptMessageList } from '@/features/chat/MessageList'
import { useV1ThreadRuntime } from '@/features/chat/assistant-ui-adapter'

/** MessageList inside the same assistant-ui runtime AppShell provides, fed by the same V1 messages. */
export function MessageList(props: ComponentProps<typeof TranscriptMessageList>) {
  const { runtime } = useV1ThreadRuntime(props.messages)
  return <AssistantRuntimeProvider runtime={runtime}><TranscriptMessageList {...props} /></AssistantRuntimeProvider>
}
