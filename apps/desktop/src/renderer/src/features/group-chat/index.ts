/**
 * Group Chat - Feature Exports
 * 
 * Phase 3: Dual Provider Architecture - Nível 1 (MVP)
 * 
 * Exports:
 * - Models: GroupChannel, ChannelMessage, AgentThread, ThreadMessage
 * - Utilities: parseMentions, routeMessage, resolveMentionToAgent, validateMentions
 * - Provider: GroupChatProvider, useGroupChat, useGroupChatAvailable
 * - Components: ChannelMessage, ThreadView
 */

export * from './group-channel'
export * from './mention-parser'
export { 
  GroupChatProvider, 
  useGroupChat, 
  useGroupChatAvailable,
  useChannelMessages,
  useActiveThreads,
  useThread,
  GROUP_CHAT_FEATURES,
  type GroupChatFeatures,
} from './GroupChatProvider'

export { ChannelMessage } from './components/ChannelMessage'
export { ThreadView } from './components/ThreadView'