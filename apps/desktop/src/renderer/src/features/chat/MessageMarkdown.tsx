import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '@/components/ai/code-block'

/** O mesmo conteúdo e os mesmos componentes no aplicativo e na PWA. */
export const MessageMarkdown = memo(function MessageMarkdown({ children }: { children: string }) {
  return <div className="boobot-markdown prose prose-sm min-w-0 max-w-none break-words text-[14px] leading-6 prose-p:my-2 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      pre({ children }) { return <>{children}</> },
      code({ className, children }) {
        const language = /language-([^\s]+)/.exec(className || '')?.[1]
        const raw = String(children)
        if (language || raw.endsWith('\n')) return <CodeBlock className="not-prose my-4" code={raw.replace(/\n$/, '')} language={language} />
        return <code className={className}>{children}</code>
      },
      table({ children }) {
        return <div className="my-4 max-w-full overflow-x-auto" role="region" aria-label="Tabela da resposta" tabIndex={0}>
          <table>{children}</table>
        </div>
      },
      a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> },
    }}>{children}</ReactMarkdown>
  </div>
})
