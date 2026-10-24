import { memo, useEffect, useRef, useState } from 'react'

type TextPart = { id: number; text: string; animated: boolean }

/** Texto simples e em blocos curtos durante o streaming; o Markdown entra quando a resposta termina. */
export const StreamingText = memo(function StreamingText({ text }: { text: string }) {
  const [parts, setParts] = useState<TextPart[]>(() => text ? [{ id: 0, text, animated: false }] : [])
  const previousText = useRef(text)
  const nextId = useRef(1)
  const pendingText = useRef('')
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const previous = previousText.current
    if (text === previous) return
    previousText.current = text

    if (!text.startsWith(previous)) {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = null
      pendingText.current = ''
      const id = nextId.current++
      setParts(text ? [{ id, text, animated: false }] : [])
      return
    }

    pendingText.current += text.slice(previous.length)
    if (flushTimer.current) return
    flushTimer.current = setTimeout(() => {
      const delta = pendingText.current
      pendingText.current = ''
      flushTimer.current = null
      if (delta) {
        const id = nextId.current++
        setParts(current => [...current, { id, text: delta, animated: true }])
      }
    }, 48)
  }, [text])

  useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current) }, [])

  return <div className="boobot-markdown prose prose-sm min-w-0 max-w-none break-words whitespace-pre-wrap text-[14px] leading-6" data-streaming-text>
    {parts.map(part => <span key={part.id} className={part.animated ? 'chat-stream-text-chunk' : undefined}>{part.text}</span>)}
  </div>
})
