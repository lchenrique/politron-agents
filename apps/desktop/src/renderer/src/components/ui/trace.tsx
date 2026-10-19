import * as React from 'react'
import { Check, ChevronRight, CircleAlert, CircleDashed, LoaderCircle } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type TraceStatus = 'running' | 'error' | 'pending' | 'complete'

function Trace({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="trace" className={cn('flex min-w-0 flex-col gap-1', className)} {...props} />
}

function TraceLine({ className, status, children, ...props }: React.ComponentProps<'div'> & { status?: TraceStatus }) {
  const Icon = status === 'running' ? LoaderCircle : status === 'error' ? CircleAlert : status === 'pending' ? CircleDashed : status === 'complete' ? Check : null
  return <div data-slot="trace-line" data-status={status} className={cn('flex min-w-0 items-center gap-2 rounded-md py-1 text-xs text-muted-foreground', status === 'error' && 'text-destructive', className)} {...props}>
    {Icon && <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', status === 'running' && 'animate-spin')} />}
    {children}
  </div>
}

function TraceIcon({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="trace-icon" className={cn('flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5', className)} {...props} />
}

function TraceTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="trace-title" className={cn('min-w-0 flex-1 truncate font-medium text-foreground/80', className)} {...props} />
}

function TraceDescription({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="trace-description" className={cn('shrink-0 text-[10px] text-muted-foreground', className)} {...props} />
}

function TraceCollapsible({ className, ...props }: React.ComponentProps<typeof Collapsible>) {
  return <Collapsible data-slot="trace-collapsible" className={cn('min-w-0', className)} {...props} />
}

function TraceCollapsibleTrigger({ className, children, ...props }: React.ComponentProps<typeof CollapsibleTrigger>) {
  return <CollapsibleTrigger className={cn('group/trace flex w-full items-center gap-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)} {...props}>
    {children}<ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/trace:rotate-90" />
  </CollapsibleTrigger>
}

function TraceCollapsibleContent({ className, ...props }: React.ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent data-slot="trace-content" className={cn('min-w-0 overflow-hidden pl-6 pt-1 text-xs text-muted-foreground', className)} {...props} />
}

export { Trace, TraceLine, TraceIcon, TraceTitle, TraceDescription, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent }
