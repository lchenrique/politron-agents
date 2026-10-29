import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => (
  <input type={type} className={cn('flex h-9 w-full rounded-lg border-[0.5px] border-input bg-card px-3 py-1 text-sm transition-[border-color,box-shadow] placeholder:text-faint-foreground hover:border-border-strong focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50', className)} ref={ref} {...props} />
))
Input.displayName = 'Input'

export { Input }
