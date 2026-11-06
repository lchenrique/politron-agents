import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { MessagePrimitive, ThreadPrimitive, type ToolCallMessagePartComponent } from '@assistant-ui/react'
import type { Message } from '../../../../shared/v9'
import { ToolCallTree } from '@/components/dsh'
import { activityToolCall } from './tool-call'

type RootProps = Omit<ComponentProps<typeof MessagePrimitive.Root>, 'children'>
type Bridge = { message: Message; toolActive: boolean; rootProps: RootProps; children: ReactNode }

/** Carries the V1 message and its surrounding UI into the component assistant-ui mounts for that message id. */
const BridgeContext = createContext<Bridge | null>(null)

const ActivityTool: ToolCallMessagePartComponent = () => {
  const bridge = useContext(BridgeContext)
  return bridge && <ToolCallTree call={activityToolCall(bridge.message, bridge.toolActive)} />
}
const ACTIVITY_PARTS = { tools: { Override: ActivityTool } }

/** The activity's tool-call part, rendered with the existing ToolCallTree. */
export function ActivityParts() {
  return <MessagePrimitive.Parts components={ACTIVITY_PARTS} />
}

function BridgedMessage() {
  const bridge = useContext(BridgeContext)
  // MessagePrimitive.Root carries data-message-id, so it replaces the transcript's own wrapper element.
  return bridge && <MessagePrimitive.Root {...bridge.rootProps}>{bridge.children}</MessagePrimitive.Root>
}
const MESSAGE_COMPONENTS = { Message: BridgedMessage }

/**
 * Mounts a V1 message through the assistant-ui runtime (by id, so virtualization and prepended history keep
 * their identity). Renders nothing until the runtime has synced that id.
 */
export function RuntimeMessage({ message, toolActive = false, children, ...rootProps }: RootProps & { message: Message; toolActive?: boolean; children: ReactNode }) {
  return <BridgeContext.Provider value={{ message, toolActive, rootProps, children }}>
    <ThreadPrimitive.Unstable_MessageById messageId={message.id} components={MESSAGE_COMPONENTS} />
  </BridgeContext.Provider>
}
