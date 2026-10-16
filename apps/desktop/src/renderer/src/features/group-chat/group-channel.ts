/**
 * GroupChannel - Group Chat MVP Model
 * 
 * Phase 3: Dual Provider Architecture - Nível 1 (MVP)
 * 
 * Defines the data structures for group chat with @mention routing:
 * - GroupChannel: a team channel with participants and messages
 * - ChannelMessage: messages in the channel with mention support
 * - AgentThread: private conversation thread with a specific agent
 */

import type { Agent } from '@/types/workspace'

// =============================================================================
// CHANNEL MESSAGE
// =============================================================================

export interface ChannelMessage {
  /** Unique message ID */
  id: string
  /** Author of the message - "user" or agent ID */
  authorId: string
  /** Message content (may contain @mentions) */
  content: string
  /** List of agent IDs mentioned in the message */
  mentions: string[]
  /** Message timestamp */
  timestamp: Date
  /** Thread ID if this message belongs to an agent thread */
  threadId?: string
}

// =============================================================================
// AGENT THREAD
// =============================================================================

/**
 * A private conversation thread between user and a specific agent
 * Messages in threads don't pollute the main channel
 */
export interface AgentThread {
  /** The agent this thread is with */
  agentId: string
  /** Agent name for display */
  agentName: string
  /** Conversation messages in this thread */
  messages: ThreadMessage[]
  /** Last activity timestamp */
  lastActivity: Date
  /** Thread status */
  status: 'active' | 'idle'
}

/**
 * Message inside an agent thread
 */
export interface ThreadMessage {
  id: string
  /** "user" or agentId */
  authorId: string
  content: string
  timestamp: Date
}

// =============================================================================
// GROUP CHANNEL
// =============================================================================

/**
 * A team channel where multiple agents can participate
 * 
 * @example
 * {
 *   id: "ch_team_saas_001",
 *   teamId: "team_saas_001",
 *   name: "#team-saaS",
 *   participants: [frontendDev, backendDev, techLead],
 *   messages: [...],
 *   threads: new Map([["frontend-developer", thread1], ["backend-developer", thread2]])
 * }
 */
export interface GroupChannel {
  /** Unique channel ID */
  id: string
  /** Team ID this channel belongs to */
  teamId: string
  /** Channel name (e.g., "#team-saaS") */
  name: string
  /** All agents participating in this channel */
  participants: Agent[]
  /** Messages in the main channel (non-thread) */
  messages: ChannelMessage[]
  /** Agent threads keyed by agentId */
  threads: Map<string, AgentThread>
}

// =============================================================================
// THREAD MESSAGE (for internal thread state)
// =============================================================================

export interface Thread {
  id: string
  agentId: string
  agentName: string
  messages: ThreadMessage[]
  lastActivity: Date
  status: 'active' | 'idle'
}

// =============================================================================
// MESSAGE CREATION HELPERS
// =============================================================================

/**
 * Creates a new channel message
 */
export function createChannelMessage(
  content: string,
  authorId: string,
  mentions: string[] = []
): ChannelMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    authorId,
    content,
    mentions,
    timestamp: new Date(),
  }
}

/**
 * Creates a new thread message
 */
export function createThreadMessage(
  content: string,
  authorId: string
): ThreadMessage {
  return {
    id: `thread_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    authorId,
    content,
    timestamp: new Date(),
  }
}

/**
 * Creates a new agent thread
 */
export function createAgentThread(agentId: string, agentName: string): AgentThread {
  return {
    agentId,
    agentName,
    messages: [],
    lastActivity: new Date(),
    status: 'idle',
  }
}

/**
 * Creates a new group channel
 */
export function createGroupChannel(
  teamId: string,
  name: string,
  participants: Agent[]
): GroupChannel {
  return {
    id: `ch_${teamId}_${Date.now()}`,
    teamId,
    name,
    participants,
    messages: [],
    threads: new Map(),
  }
}

// =============================================================================
// THREAD ACCESS HELPERS
// =============================================================================

/**
 * Gets a thread by agent ID, returns undefined if not found
 */
export function getThread(channel: GroupChannel, agentId: string): AgentThread | undefined {
  return channel.threads.get(agentId)
}

/**
 * Gets or creates a thread for an agent
 */
export function getOrCreateThread(
  channel: GroupChannel,
  agentId: string,
  agentName: string
): AgentThread {
  let thread = channel.threads.get(agentId)
  if (!thread) {
    thread = createAgentThread(agentId, agentName)
    channel.threads.set(agentId, thread)
  }
  return thread
}

/**
 * Adds a message to a thread
 */
export function addMessageToThread(
  channel: GroupChannel,
  agentId: string,
  content: string,
  authorId: string
): void {
  const thread = getOrCreateThread(channel, agentId, channel.participants.find(p => p.id === agentId)?.name || agentId)
  thread.messages.push(createThreadMessage(content, authorId))
  thread.lastActivity = new Date()
  thread.status = 'active'
}

/**
 * Gets all active threads (threads with recent activity)
 */
export function getActiveThreads(channel: GroupChannel): AgentThread[] {
  return Array.from(channel.threads.values()).filter(t => t.status === 'active')
}