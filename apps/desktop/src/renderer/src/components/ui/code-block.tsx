import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CodeBlock({ code, language, className }: { code: string; language?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch { /* A cópia fica disponível quando o Electron concede acesso à área de transferência. */ }
  }
  return <div data-slot="code-block" className={cn('group/code relative my-2 min-w-0 overflow-hidden rounded-lg border border-border/70 bg-muted/60', className)}>
    <div className="flex h-8 items-center justify-between border-b border-border/60 px-3 text-[10px] text-muted-foreground"><span>{language || 'Código'}</span><Button type="button" size="icon" variant="ghost" className="size-6" aria-label={copied ? 'Código copiado' : 'Copiar código'} title={copied ? 'Copiado' : 'Copiar código'} onClick={() => void copy()}>{copied ? <Check /> : <Copy />}</Button></div>
    <pre className="max-h-[28rem] overflow-auto p-3 text-xs leading-5"><code>{code}</code></pre>
  </div>
}
