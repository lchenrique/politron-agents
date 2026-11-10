import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isCardExpired, redactAnswer, validateAnswer, type CardAnswer, type InteractiveCard } from '../../../../shared/interactive-card'
import { DecisionGateCard } from './DecisionGateCard'

/**
 * Cartão interativo do Boo no transcript. Depois da resposta (ou da expiração) o cartão fica só leitura
 * e mostra o resumo sem os campos secretos. A resposta vai por `onAnswer`; nada é executado aqui.
 */
export function InteractiveCardView({ card, resolved, onAnswer, onInspect }: {
  card: InteractiveCard
  /** Resposta já registrada (cartão persistido); torna o cartão somente leitura. */
  resolved?: CardAnswer
  onAnswer: (answer: CardAnswer) => Promise<void> | void
  /** Ação secundária do cartão de decisão (abrir o diff citado na etiqueta). */
  onInspect?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const locked = useRef(false)
  const expired = !resolved && isCardExpired(card)
  const final: CardAnswer | undefined = resolved ?? (expired ? { status: 'expired' } : undefined)

  const send = async (answer: CardAnswer) => {
    if (final || locked.current) return
    const problem = validateAnswer(card, answer)
    if (problem) { setError(problem); return }
    locked.current = true; setBusy(true); setError('')
    try { await onAnswer(answer) } catch (cause) {
      locked.current = false; setBusy(false); setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a resposta.')
    }
  }

  const heading = <>
    <p className="font-medium">{card.title}</p>
    {card.text && <p className="mt-1 text-sm text-muted-foreground">{card.text}</p>}
  </>

  // Cartão de decisão do mock: layout próprio, com opções lado a lado e ação primária.
  if (card.kind === 'choice' && card.variant === 'decision-gate') {
    return <DecisionGateCard card={card} resolved={final} onAnswer={onAnswer} onInspect={onInspect} />
  }

  if (final) return <section aria-label="Cartão do Boo" className="max-w-xl rounded-lg border border-border/60 bg-card p-3 text-sm">
    {heading}
    <p role="status" className="mt-2 text-xs text-muted-foreground">Resposta: {redactAnswer(card, final)}</p>
  </section>

  return <section aria-label="Cartão do Boo" aria-busy={busy} className="max-w-xl rounded-lg border border-border/60 bg-card p-3 text-sm">
    {heading}
    <div className="mt-3 flex flex-wrap gap-2">
      {card.kind === 'confirm' && <>
        <Button size="sm" disabled={busy} onClick={() => void send({ status: 'answered', values: { confirmed: true } })}>{card.confirmLabel || 'Confirmar'}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void send({ status: 'answered', values: { confirmed: false } })}>{card.cancelLabel || 'Cancelar'}</Button>
      </>}
      {card.kind === 'quick-replies' && card.options.map(option =>
        <Button key={option.id} size="sm" variant="outline" disabled={busy} title={option.description} onClick={() => void send({ status: 'answered', values: { choice: option.id } })}>{option.label}</Button>)}
    </div>
    {card.kind === 'choice' && <fieldset className="mt-3 space-y-1" disabled={busy}>
      <legend className="sr-only">{card.title}</legend>
      {card.options.map(option => <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
        <input type={card.multiple ? 'checkbox' : 'radio'} name={card.id} className="mt-1" checked={picked.includes(option.id)}
          onChange={() => setPicked(card.multiple ? (current => current.includes(option.id) ? current.filter(id => id !== option.id) : [...current, option.id]) : () => [option.id])} />
        <span>{option.label}{option.description && <span className="block text-xs text-muted-foreground">{option.description}</span>}</span>
      </label>)}
      <Button size="sm" className="mt-2" disabled={busy || !picked.length}
        onClick={() => void send({ status: 'answered', values: card.multiple ? { choices: picked } : { choice: picked[0] } })}>Enviar resposta</Button>
    </fieldset>}
    {card.kind === 'form' && <form className="mt-3 space-y-2" onSubmit={event => { event.preventDefault(); void send({ status: 'answered', values }) }}>
      {card.fields.map(field => <label key={field.id} className="block text-xs text-muted-foreground">
        {field.label}{field.required && ' *'}
        <Input className="mt-1" type={field.secret ? 'password' : 'text'} autoComplete={field.secret ? 'off' : undefined} placeholder={field.placeholder}
          value={values[field.id] ?? ''} disabled={busy} onChange={event => setValues(current => ({ ...current, [field.id]: event.target.value }))} />
      </label>)}
      <Button size="sm" type="submit" disabled={busy}>{card.submitLabel || 'Enviar'}</Button>
    </form>}
    <div className="mt-2 flex items-center justify-between">
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : <span />}
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void send({ status: 'dismissed' })}>Dispensar</Button>
    </div>
  </section>
}
