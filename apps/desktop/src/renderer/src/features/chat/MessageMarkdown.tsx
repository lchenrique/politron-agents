import { createContext, memo, useContext, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import { CodeBlock } from '@/components/ai/code-block'
import { classifyMessageLink } from './message-link'

/** Roteamento de links do Desktop. Sem provider (galerias e testes), o link mantém o comportamento web normal. */
export interface MessageLinkHandlers {
  openUrl: (url: string, mode: 'internal' | 'external') => void
  openFile: (path: string) => void
  blocked: () => void
  workspaceRoot?: string
}
export const MessageLinkContext = createContext<MessageLinkHandlers | null>(null)

function MessageLink({ href, children }: { href?: string; children?: ReactNode }) {
  const handlers = useContext(MessageLinkContext)
  if (!handlers) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  const target = classifyMessageLink(href, handlers?.workspaceRoot)
  if (target.kind === 'anchor') return <a href={href}>{children}</a>
  return <a href={href} title={target.kind === 'url' ? `${target.url}\nCtrl+clique abre no navegador do sistema` : target.kind === 'file' ? `Abrir ${target.path} no editor` : undefined}
    // Clique do meio abriria uma janela nova pelo Electron, fora do roteamento validado.
    onAuxClick={event => event.preventDefault()}
    onClick={event => {
      event.preventDefault()
      if (target.kind === 'url') handlers.openUrl(target.url, event.ctrlKey || event.metaKey ? 'external' : 'internal')
      else if (target.kind === 'file') handlers.openFile(target.path)
      else handlers.blocked()
    }}>{children}</a>
}

const MARKDOWN_CLASS = 'boobot-markdown prose prose-sm min-w-0 max-w-none break-words text-[14px] leading-6 prose-p:my-2 prose-code:rounded-smprose-code:bg-muted prose-code:px-1 prose-code:py-0.5'

/** Caminhos locais só passam quando o Desktop roteia links; sem roteamento vale o filtro padrão. */
const linkUrlTransform = (handlers: MessageLinkHandlers | null) => (url: string, key: string) => {
  if (handlers && key === 'href' && (/^file:/i.test(url) || /^[a-z]:[\\/]/i.test(url) || /^[\\/]/.test(url))) return url
  return defaultUrlTransform(url)
}

const MARKDOWN_COMPONENTS: Components = {
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
  a: MessageLink,
}

/** Markdown das respostas, com a política de links do Desktop. */
export const MessageMarkdown = memo(function MessageMarkdown({ children }: { children: string }) {
  const handlers = useContext(MessageLinkContext)
  return <div className={MARKDOWN_CLASS}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={linkUrlTransform(handlers)} components={MARKDOWN_COMPONENTS}>{children}</ReactMarkdown>
  </div>
})

/** Parte de texto do assistant-ui com as mesmas políticas de link e código do Markdown acima. */
export function AssistantUIMessageText() {
  const handlers = useContext(MessageLinkContext)
  return <MarkdownTextPrimitive className={MARKDOWN_CLASS} remarkPlugins={[remarkGfm]} defer smooth={false} urlTransform={linkUrlTransform(handlers)} components={MARKDOWN_COMPONENTS} />
}
