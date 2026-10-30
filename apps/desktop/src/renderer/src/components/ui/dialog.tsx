import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-[rgb(10_10_14/0.48)] dark:bg-black/65 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} />
)
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { overlayClassName?: string }
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, overlayClassName, children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content ref={ref} className={cn('fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-2xl focus:outline-none', className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" /><span className="sr-only">Fechar</span></DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
)
DialogContent.displayName = DialogPrimitive.Content.displayName
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} className={cn('font-display text-[17px] font-semibold leading-6 tracking-[-0.015em]', className)} {...props} />
)
DialogTitle.displayName = DialogPrimitive.Title.displayName
const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
)
DialogDescription.displayName = DialogPrimitive.Description.displayName
export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription }
