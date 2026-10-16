/**
 * MentionParser - @mention Routing for Group Chat MVP
 * 
 * Phase 3: Dual Provider Architecture - Nível 1 (MVP)
 * 
 * Handles:
 * - Parsing @mentions from message text
 * - Routing messages to mentioned agents
 * - Creating agent threads automatically
 */

import type { Agent } from '@/types/workspace'
import {
  type GroupChannel,
  type ChannelMessage,
  createChannelMessage,
  getOrCreateThread,
  createThreadMessage,
} from './group-channel'

// =============================================================================
// MENTION PATTERNS
// =============================================================================

/**
 * Regex to match @mentions in text
 * Matches @agent-slug, @agent-name, @agent name with spaces
 */
const MENTION_PATTERN = /@([a-zA-Z][a-zA-Z0-9_-]*(?:\s+[a-zA-Z][a-zA-Z0-9_-]*)*)/g

// =============================================================================
// PARSE MENTIONS
// =============================================================================

/**
 * Parses @mentions from message text and returns agent IDs
 * 
 * @param text - Message text containing @mentions
 * @returns Array of agent IDs mentioned (without @ prefix)
 * 
 * @example
 * parseMentions("implementa o login @frontend-dev") // ["frontend-developer"]
 * parseMentions("@frontend-dev e @backend-dev") // ["frontend-developer", "backend-developer"]
 * parseMentions("sem menções") // []
 */
export function parseMentions(text: string): string[] {
  if (!text) return []
  
  const mentions: string[] = []
  const matches = text.matchAll(MENTION_PATTERN)
  
  for (const match of matches) {
    // Normalize the mention: lowercase, replace spaces with hyphens
    const mention = match[1].toLowerCase().trim().replace(/\s+/g, '-')
    if (mention && !mentions.includes(mention)) {
      mentions.push(mention)
    }
  }
  
  return mentions
}

/**
 * Extracts raw @mention strings from text (without normalization)
 * Useful for display purposes
 * 
 * @param text - Message text
 * @returns Array of raw @mentions including the @ symbol
 */
export function extractRawMentions(text: string): string[] {
  if (!text) return []
  
  const mentions: string[] = []
  const matches = text.matchAll(MENTION_PATTERN)
  
  for (const match of matches) {
    const mention = `@${match[1]}`
    if (!mentions.includes(mention)) {
      mentions.push(mention)
    }
  }
  
  return mentions
}

// =============================================================================
// AGENT RESOLUTION
// =============================================================================

/**
 * Resolves a mention string to an agent in the channel
 * 
 * @param mention - The mention string (e.g., "frontend-developer" from @frontend-developer)
 * @param participants - List of agents in the channel
 * @returns The matching Agent or undefined
 * 
 * Matching logic:
 * 1. Exact match on id (case-insensitive)
 * 2. Exact match on name (case-insensitive)
 * 3. Partial match on name (contains)
 */
export function resolveMentionToAgent(
  mention: string,
  participants: Agent[]
): Agent | undefined {
  const normalizedMention = mention.toLowerCase().trim()
  
  // Try exact ID match first
  const exactIdMatch = participants.find(
    p => p.id.toLowerCase() === normalizedMention
  )
  if (exactIdMatch) return exactIdMatch
  
  // Try exact name match
  const exactNameMatch = participants.find(
    p => p.name.toLowerCase() === normalizedMention
  )
  if (exactNameMatch) return exactNameMatch
  
  // Try partial name match (contains)
  const partialNameMatch = participants.find(
    p => p.name.toLowerCase().includes(normalizedMention) ||
         normalizedMention.includes(p.name.toLowerCase())
  )
  if (partialNameMatch) return partialNameMatch
  
  return undefined
}

/**
 * Resolves multiple mentions to agents
 * 
 * @param mentions - Array of mention strings
 * @param participants - List of agents in the channel
 * @returns Array of resolved agents (excluding unknown mentions)
 */
export function resolveMentions(
  mentions: string[],
  participants: Agent[]
): Agent[] {
  const resolved: Agent[] = []
  
  for (const mention of mentions) {
    const agent = resolveMentionToAgent(mention, participants)
    if (agent && !resolved.find(a => a.id === agent.id)) {
      resolved.push(agent)
    }
  }
  
  return resolved
}

// =============================================================================
// ROUTE MESSAGE
// =============================================================================

/**
 * Route result containing which agents were mentioned and their threads
 */
export interface RouteResult {
  /** The channel message that was added to the main channel */
  channelMessage: ChannelMessage
  /** Map of agentId -> whether a thread was created/updated */
  routedTo: Map<string, boolean>
}

/**
 * Routes a message to mentioned agents by creating/updated threads
 * 
 * This is the core routing logic:
 * 1. Parse mentions from message text
 * 2. Add message to main channel
 * 3. For each mentioned agent, create or update their thread
 * 
 * @param text - Message text from user
 * @param authorId - Author ID (typically "user")
 * @param channel - The group channel to route to
 * @returns RouteResult with the created message and routing info
 * 
 * @example
 * const result = routeMessage("implementa o login @frontend-dev", "user", channel)
 * // - Message added to channel.messages
 * // - Thread for frontend-developer created/updated with the message
 */
export function routeMessage(
  text: string,
  authorId: string,
  channel: GroupChannel
): RouteResult {
  // Parse mentions from text
  const mentionStrings = parseMentions(text)
  
  // Resolve mentions to actual agents
  const mentionedAgents = resolveMentions(mentionStrings, channel.participants)
  
  // Create the channel message
  const message = createChannelMessage(text, authorId, mentionStrings)
  message.threadId = undefined // Main channel message
  
  // Add to main channel
  channel.messages.push(message)
  
  // Route to mentioned agents' threads
  const routedTo = new Map<string, boolean>()
  
  for (const agent of mentionedAgents) {
    // Get or create thread for this agent
    const thread = getOrCreateThread(channel, agent.id, agent.name)
    
    // Add message to thread
    thread.messages.push(createThreadMessage(text, authorId))
    thread.lastActivity = new Date()
    thread.status = 'active'
    
    routedTo.set(agent.id, true)
  }
  
  return {
    channelMessage: message,
    routedTo,
  }
}

/**
 * Routes an agent's response to a thread
 * 
 * Called when an agent responds to a message in their thread
 * 
 * @param agentId - The agent who is responding
 * @param content - The response content
 * @param channel - The group channel
 * @returns The created thread message or undefined if no thread exists
 */
export function routeAgentResponse(
  agentId: string,
  content: string,
  channel: GroupChannel
) {
  const thread = channel.threads.get(agentId)
  if (!thread) {
    console.warn(`[MentionRouter] No thread found for agent ${agentId}`)
    return undefined
  }
  
  const threadMessage = createThreadMessage(content, agentId)
  thread.messages.push(threadMessage)
  thread.lastActivity = new Date()
  
  return threadMessage
}

// =============================================================================
// HIGHLIGHT MENTIONS IN TEXT
// =============================================================================

/**
 * Replaces @mentions with highlighted spans for rendering
 * 
 * @param text - Message text
 * @param mentionClass - CSS class for highlighted mentions
 * @returns React-compatible array of strings and elements
 */
export function highlightMentions(
  text: string,
  mentionClass: string = 'text-primary bg-primary/10 px-1 rounded'
): string[] {
  if (!text) return []
  
  // Split by mention pattern, keeping the matches
  const parts: string[] = []
  let lastIndex = 0
  const regex = new RegExp(MENTION_PATTERN)
  let match
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    // Add the highlighted mention
    parts.push(match[0])
    lastIndex = match.index + match[0].length
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  
  return parts
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validates if a message has valid mentions for the given channel
 * 
 * @param text - Message text
 * @param channel - Group channel to validate against
 * @returns Object with isValid flag and list of unknown mentions
 */
export function validateMentions(
  text: string,
  channel: GroupChannel
): { isValid: boolean; unknownMentions: string[] } {
  const mentionStrings = parseMentions(text)
  const unknownMentions: string[] = []
  
  for (const mention of mentionStrings) {
    const agent = resolveMentionToAgent(mention, channel.participants)
    if (!agent) {
      unknownMentions.push(mention)
    }
  }
  
  return {
    isValid: unknownMentions.length === 0,
    unknownMentions,
  }
}