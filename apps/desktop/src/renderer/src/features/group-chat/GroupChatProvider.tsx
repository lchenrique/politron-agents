/**
 * GroupChatProvider - Context provider for group chat state
 * 
 * Phase 3: Dual Provider Architecture - Nível 1 (MVP)
 * 
 * Provides:
 * - Group channel state management
 * - Message routing via MentionParser
 * - Thread management
 * - Feature flag integration
 */

import React, { createContext, useContext, useCallback, useState, useMemo, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { 
  type GroupChannel, 
  type ChannelMessage,
  type AgentThread,
  createGroupChannel,
  createChannelMessage,
  createAgentThread,
  getOrCreateThread,
  createThreadMessage,
} from './group-channel'
import { 
  parseMentions, 
  resolveMentions,
  routeMessage,
  routeAgentResponse,
  validateMentions,
} from './mention-parser'
import { activeTeamAtom, globalAgentsAtom } from '@/hooks/atoms'
import type { Agent } from '@/types/workspace'

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export interface GroupChatFeatures {
  enabled: boolean
  maxParticipants: number
  autoThreads: boolean
  allowSpontaneousContribution: boolean
}

export const GROUP_CHAT_FEATURES: GroupChatFeatures = {
  enabled: true,
  maxParticipants: 10,
  autoThreads: true,
  allowSpontaneousContribution: false,
}

// =============================================================================
// CONTEXT TYPES
// =============================================================================

interface GroupChatContextValue {
  /** Current group channel */
  channel: GroupChannel | null
  /** Whether group chat is available */
  isAvailable: boolean
  /** Send a message to the channel */
  sendMessage: (text: string) => ChannelMessage | null
  /** Send a response to an agent thread */
  sendToThread: (agentId: string, content: string) => void
  /** Get a specific thread */
  getThread: (agentId: string) => AgentThread | undefined
  /** Get all active threads */
  getActiveThreads: () => AgentThread[]
  /** Get messages that mention a specific agent */
  getMessagesForAgent: (agentId: string) => ChannelMessage[]
  /** Validate mentions in text */
  validateMentions: (text: string) => { isValid: boolean; unknownMentions: string[] }
  /** Feature flags */
  features: GroupChatFeatures
  /** Available agents for mentions */
  availableAgents: Agent[]
}

const GroupChatContext = createContext<GroupChatContextValue | null>(null)

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface GroupChatProviderProps {
  children: ReactNode
}

export function GroupChatProvider({ children }: GroupChatProviderProps) {
  const activeTeam = useAtomValue(activeTeamAtom)
  const globalAgents = useAtomValue(globalAgentsAtom)
  
  // Group channel state
  const [channel, setChannel] = useState<GroupChannel | null>(null)
  
  // Initialize channel when team changes
  useEffect(() => {
    if (!GROUP_CHAT_FEATURES.enabled) {
      setChannel(null)
      return
    }
    
    if (activeTeam) {
      // Use team agents as participants
      const participants: Agent[] = activeTeam.agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        catalogSlug: agent.catalogSlug || agent.id,
        systemPromptPath: agent.systemPromptPath || '',
        status: agent.status as 'idle' | 'running' | 'waiting' | 'blocked' | 'done' | 'error',
        color: agent.color || '#888888',
        currentFiles: agent.currentFiles || [],
        hiredAt: agent.hiredAt || new Date().toISOString(),
      }))
      
      const newChannel = createGroupChannel(
        activeTeam.id,
        `#${activeTeam.name.toLowerCase().replace(/\s+/g, '-')}`,
        participants
      )
      setChannel(newChannel)
    } else if (globalAgents.length > 0) {
      // Use global agents for global chat
      const participants: Agent[] = globalAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        catalogSlug: agent.catalogSlug || agent.id,
        systemPromptPath: '',
        status: 'idle' as const,
        color: agent.color || '#888888',
        currentFiles: [],
        hiredAt: new Date().toISOString(),
      }))
      
      const newChannel = createGroupChannel(
        'global',
        '#global',
        participants
      )
      setChannel(newChannel)
    }
  }, [activeTeam, globalAgents])
  
  // Computed values
  const isAvailable = useMemo(() => {
    return GROUP_CHAT_FEATURES.enabled && (!!activeTeam || globalAgents.length > 0)
  }, [activeTeam, globalAgents.length])
  
  const availableAgents = useMemo(() => {
    return channel?.participants || []
  }, [channel?.participants])
  
  // Send message to channel
  const sendMessage = useCallback((text: string): ChannelMessage | null => {
    if (!channel || !GROUP_CHAT_FEATURES.enabled) {
      console.warn('[GroupChatProvider] Cannot send message: channel not available')
      return null
    }
    
    // Parse mentions
    const mentionStrings = parseMentions(text)
    
    // If autoThreads is enabled and there are mentions, route to threads
    if (GROUP_CHAT_FEATURES.autoThreads && mentionStrings.length > 0) {
      const result = routeMessage(text, 'user', channel)
      
      // Update state with new channel (trigger re-render)
      setChannel({ ...channel })
      
      return result.channelMessage
    }
    
    // No mentions - just add to main channel
    const message = createChannelMessage(text, 'user', [])
    setChannel(prev => {
      if (!prev) return prev
      return {
        ...prev,
        messages: [...prev.messages, message]
      }
    })
    
    return message
  }, [channel])
  
  // Send response to a thread
  const sendToThread = useCallback((agentId: string, content: string) => {
    if (!channel) return
    
    const threadMessage = routeAgentResponse(agentId, content, channel)
    if (threadMessage) {
      setChannel({ ...channel })
    }
  }, [channel])
  
  // Get a specific thread
  const getThread = useCallback((agentId: string): AgentThread | undefined => {
    return channel?.threads.get(agentId)
  }, [channel])
  
  // Get all active threads
  const getActiveThreads = useCallback((): AgentThread[] => {
    if (!channel) return []
    return Array.from(channel.threads.values()).filter(t => t.status === 'active')
  }, [channel])
  
  // Get messages that mention a specific agent
  const getMessagesForAgent = useCallback((agentId: string): ChannelMessage[] => {
    if (!channel) return []
    return channel.messages.filter(m => m.mentions.includes(agentId))
  }, [channel])
  
  // Validate mentions
  const validateMentionsFn = useCallback((text: string) => {
    if (!channel) {
      return { isValid: false, unknownMentions: [] }
    }
    return validateMentions(text, channel)
  }, [channel])
  
  // Context value
  const contextValue = useMemo<GroupChatContextValue>(() => ({
    channel,
    isAvailable,
    sendMessage,
    sendToThread,
    getThread,
    getActiveThreads,
    getMessagesForAgent,
    validateMentions: validateMentionsFn,
    features: GROUP_CHAT_FEATURES,
    availableAgents,
  }), [
    channel,
    isAvailable,
    sendMessage,
    sendToThread,
    getThread,
    getActiveThreads,
    getMessagesForAgent,
    validateMentionsFn,
    availableAgents,
  ])
  
  return (
    <GroupChatContext.Provider value={contextValue}>
      {children}
    </GroupChatContext.Provider>
  )
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access group chat context
 * @throws Error if used outside GroupChatProvider
 */
export function useGroupChat(): GroupChatContextValue {
  const context = useContext(GroupChatContext)
  if (!context) {
    throw new Error('useGroupChat must be used within a GroupChatProvider')
  }
  return context
}

/**
 * Hook to check if group chat is available
 */
export function useGroupChatAvailable(): boolean {
  const context = useContext(GroupChatContext)
  return context?.isAvailable ?? false
}

/**
 * Hook to get channel messages
 */
export function useChannelMessages(): ChannelMessage[] {
  const { channel } = useGroupChat()
  return channel?.messages ?? []
}

/**
 * Hook to get active threads
 */
export function useActiveThreads(): AgentThread[] {
  const { getActiveThreads } = useGroupChat()
  return getActiveThreads()
}

/**
 * Hook to get a specific thread by agent ID
 */
export function useThread(agentId: string): AgentThread | undefined {
  const { getThread } = useGroupChat()
  return getThread(agentId)
}