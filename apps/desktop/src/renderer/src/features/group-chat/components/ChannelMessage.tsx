/**
 * ChannelMessage - Message component with @mention highlighting
 * 
 * Phase 3: Dual Provider Architecture - Nível 1 (MVP)
 * 
 * Displays channel messages with:
 * - Author avatar/icon
 * - Message content with highlighted @mentions
 * - Timestamp
 * - Thread indicator if message has a thread
 */

import { memo, useMemo } from 'react'
import { User, Bot, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { extractRawMentions, parseMentions } from '../mention-parser'
import type { ChannelMessage as ChannelMessageType } from '../group-channel'

interface ChannelMessageProps {
  message: ChannelMessageType
  className?: string
  showThreadIndicator?: boolean
  onThreadClick?: (agentId: string) => void
}

export const ChannelMessage = memo(function ChannelMessage({
  message,
  className,
  showThreadIndicator = true,
  onThreadClick,
}: ChannelMessageProps) {
  const isUser = message.authorId === 'user'
  const rawMentions = useMemo(() => extractRawMentions(message.content), [message.content])
  const mentions = useMemo(() => parseMentions(message.content), [message.content])
  
  // Format timestamp
  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp)
    return date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }, [message.timestamp])
  
  // Render content with highlighted mentions
  const renderedContent = useMemo(() => {
    if (mentions.length === 0) {
      return message.content
    }
    
    // Split content by mentions and render highlighted
    const parts: Array<{ type: 'text' | 'mention'; content: string }> = []
    let remainingText = message.content
    let offset = 0
    
    for (const mention of rawMentions) {
      const mentionIndex = remainingText.indexOf(mention)
      if (mentionIndex === -1) continue
      
      // Add text before mention
      if (mentionIndex > 0) {
        parts.push({ type: 'text', content: remainingText.slice(0, mentionIndex) })
      }
      
      // Add highlighted mention
      parts.push({ type: 'mention', content: mention })
      
      // Move past the mention
      remainingText = remainingText.slice(mentionIndex + mention.length)
    }
    
    // Add remaining text
    if (remainingText) {
      parts.push({ type: 'text', content: remainingText })
    }
    
    return parts
  }, [message.content, mentions.length, rawMentions])
  
  return (
    <div className={cn('flex w-full gap-3 py-2 px-4 hover:bg-muted/30 rounded-md transition-colors', className)}>
      {/* Avatar */}
      <div className="shrink-0">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center border',
          isUser 
            ? 'bg-muted border-border/20' 
            : 'bg-primary/10 border-primary/20'
        )}>
          {isUser ? (
            <User className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Bot className="w-4 h-4 text-primary" />
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: Author + Time */}
        <div className="flex items-center gap-2 mb-1">
          <span className={cn(
            'text-sm font-medium',
            isUser ? 'text-muted-foreground' : 'text-primary'
          )}>
            {isUser ? 'Você' : message.authorId}
          </span>
          <span className="text-xs text-muted-foreground/60">
            {formattedTime}
          </span>
          
          {/* Thread indicator if message has mentions */}
          {showThreadIndicator && message.mentions.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <MessageSquare className="w-3 h-3 text-muted-foreground/60" />
              <span className="text-xs text-muted-foreground/60">
                {message.mentions.length} menção{message.mentions.length > 1 ? 'ões' : ''}
              </span>
            </div>
          )}
        </div>
        
        {/* Message content */}
        <div className="text-sm text-foreground">
          {Array.isArray(renderedContent) ? (
            <span>
              {renderedContent.map((part, index) => (
                part.type === 'mention' ? (
                  <span 
                    key={index}
                    className="text-primary bg-primary/10 px-1.5 py-0.5 rounded font-medium"
                  >
                    {part.content}
                  </span>
                ) : (
                  <span key={index}>{part.content}</span>
                )
              ))}
            </span>
          ) : (
            renderedContent
          )}
        </div>
        
        {/* Mention chips */}
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {mentions.map((mention) => (
              <span 
                key={mention}
                className="inline-flex items-center gap-1 text-xs bg-primary/5 text-primary px-2 py-0.5 rounded-full"
              >
                <span className="text-primary/60">@</span>
                {mention}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

ChannelMessage.displayName = 'ChannelMessage'