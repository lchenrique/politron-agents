/**
 * ThreadView - Collapsible agent thread component
 * 
 * Phase 3: Dual Provider Architecture - Nível 1 (MVP)
 * 
 * Displays a private conversation thread with an agent:
 * - Collapsible using Radix UI Collapsible
 * - Shows agent name and status
 * - Message list with user/agent distinction
 * - Expand/collapse animation
 */

import { memo, useMemo, useState } from 'react'
import { 
  ChevronDown, 
  ChevronRight, 
  Bot, 
  User, 
  MessageCircle,
  Clock
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { AgentThread } from '../group-channel'

interface ThreadViewProps {
  thread: AgentThread
  className?: string
  defaultExpanded?: boolean
  onMessageSubmit?: (content: string) => void
}

export const ThreadView = memo(function ThreadView({
  thread,
  className,
  defaultExpanded = false,
  onMessageSubmit,
}: ThreadViewProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded)
  
  // Format last activity time
  const lastActivityText = useMemo(() => {
    const now = new Date()
    const diff = now.getTime() - new Date(thread.lastActivity).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    
    if (minutes < 1) return 'agora mesmo'
    if (minutes < 60) return `${minutes}min`
    if (hours < 24) return `${hours}h`
    return new Date(thread.lastActivity).toLocaleDateString('pt-BR')
  }, [thread.lastActivity])
  
  // Count messages
  const userMessages = useMemo(() => 
    thread.messages.filter(m => m.authorId === 'user').length, 
    [thread.messages]
  )
  const agentMessages = useMemo(() => 
    thread.messages.filter(m => m.authorId !== 'user').length, 
    [thread.messages]
  )
  
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('border rounded-lg overflow-hidden', className)}
    >
      {/* Thread Header - Always visible */}
      <CollapsibleTrigger className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
        {/* Expand/Collapse Icon */}
        <div className="shrink-0">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        
        {/* Agent Avatar */}
        <div className="shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
        </div>
        
        {/* Agent Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">
              {thread.agentName}
            </span>
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded',
              thread.status === 'active' 
                ? 'bg-emerald-500/10 text-emerald-600' 
                : 'bg-muted text-muted-foreground'
            )}>
              {thread.status === 'active' ? 'ativa' : 'inativa'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageCircle className="w-3 h-3" />
            <span>{thread.messages.length} mensagens</span>
            <span className="text-muted-foreground/50">•</span>
            <Clock className="w-3 h-3" />
            <span>{lastActivityText}</span>
          </div>
        </div>
        
        {/* Message counts (when collapsed) */}
        {!isOpen && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {userMessages}
            </span>
            <span className="flex items-center gap-1">
              <Bot className="w-3 h-3" />
              {agentMessages}
            </span>
          </div>
        )}
      </CollapsibleTrigger>
      
      {/* Thread Content - Collapsible */}
      <CollapsibleContent className="border-t bg-muted/20">
        {/* Messages */}
        <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
          {thread.messages.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Nenhuma mensagem nesta conversa
            </div>
          ) : (
            thread.messages.map((message) => (
              <ThreadMessageItem key={message.id} message={message} />
            ))
          )}
        </div>
        
        {/* Quick Reply Input (optional) */}
        {onMessageSubmit && thread.status === 'active' && (
          <div className="p-3 border-t bg-muted/30">
            <QuickReplyInput onSubmit={onMessageSubmit} />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
})

ThreadView.displayName = 'ThreadView'

// =============================================================================
// THREAD MESSAGE ITEM
// =============================================================================

interface ThreadMessageItemProps {
  message: {
    id: string
    authorId: string
    content: string
    timestamp: Date
  }
}

const ThreadMessageItem = memo(function ThreadMessageItem({ message }: ThreadMessageItemProps) {
  const isUser = message.authorId === 'user'
  
  const formattedTime = useMemo(() => {
    return new Date(message.timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }, [message.timestamp])
  
  return (
    <div className={cn(
      'flex gap-2 p-2 rounded-md',
      isUser ? 'bg-muted/50' : 'bg-primary/5'
    )}>
      {/* Avatar */}
      <div className="shrink-0">
        <div className={cn(
          'w-6 h-6 rounded flex items-center justify-center',
          isUser ? 'bg-muted' : 'bg-primary/10'
        )}>
          {isUser ? (
            <User className="w-3 h-3 text-muted-foreground" />
          ) : (
            <Bot className="w-3 h-3 text-primary" />
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn(
            'text-xs font-medium',
            isUser ? 'text-muted-foreground' : 'text-primary'
          )}>
            {isUser ? 'Você' : 'Agente'}
          </span>
          <span className="text-xs text-muted-foreground/60">
            {formattedTime}
          </span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </div>
  )
})

ThreadMessageItem.displayName = 'ThreadMessageItem'

// =============================================================================
// QUICK REPLY INPUT
// =============================================================================

interface QuickReplyInputProps {
  onSubmit: (content: string) => void
}

const QuickReplyInput = memo(function QuickReplyInput({ onSubmit }: QuickReplyInputProps) {
  const [value, setValue] = useState('')
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) {
      onSubmit(value.trim())
      setValue('')
    }
  }
  
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Responder..."
        className="flex-1 text-sm px-3 py-2 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Enviar
      </button>
    </form>
  )
})

QuickReplyInput.displayName = 'QuickReplyInput'