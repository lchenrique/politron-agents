import { useEffect, useRef, useState } from 'react'
import { Check, FileCode } from 'lucide-react'
import { isCardExpired, type CardAnswer, type InteractiveCard } from '../../../../shared/interactive-card'
import styles from './DecisionGateCard.module.css'

type DecisionCard = Extract<InteractiveCard, { kind: 'choice' }>

/**
 * Cartão de decisão do mock: o Boo pede uma escolha única entre alternativas e só executa
 * depois da aprovação humana. A seleção começa na opção recomendada, como no mock.
 * Nada é executado aqui: a resposta sai por `onAnswer`.
 */
export function DecisionGateCard({ card, resolved, onAnswer, onInspect }: {
  card: DecisionCard
  /** Resposta já registrada; torna o cartão somente leitura. */
  resolved?: CardAnswer
  onAnswer: (answer: CardAnswer) => Promise<void> | void
  /** Ação secundária do rodapé, ex.: abrir o diff do arquivo citado na etiqueta. */
  onInspect?: () => void
}) {
  const recomendada = card.options.find(option => option.recommended)?.id ?? card.options[0]?.id ?? ''
  const [selected, setSelected] = useState(recomendada)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const expired = !resolved && isCardExpired(card)
  const final: CardAnswer | undefined = resolved ?? (expired ? { status: 'expired' } : undefined)

  useEffect(() => { if (!card.options.some(option => option.id === selected)) setSelected(recomendada) }, [card.options, recomendada, selected])

  const approve = async () => {
    if (final || locked.current || !selected) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      await onAnswer({ status: 'answered', values: { choice: selected } })
    } catch (cause) {
      locked.current = false
      setBusy(false)
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a decisão.')
    }
  }

  if (final) {
    const escolhida = final.status === 'answered'
      ? card.options.find(option => option.id === (final.values.choice as string))?.label
      : undefined
    return <section aria-label="Decisão registrada" className={styles.aprovado}>
      <div className={styles.aprovadoTexto}>
        <Check aria-hidden className={styles.aprovadoIcone} />
        <span>
          {escolhida
            ? <><strong>{escolhida}</strong> aprovada e aplicada.</>
            : final.status === 'expired' ? 'Esta decisão expirou sem resposta.' : 'Decisão dispensada.'}
        </span>
      </div>
      {onInspect && <button type="button" className={styles.aprovadoLink} onClick={onInspect}>Ver detalhes</button>}
    </section>
  }

  return <section aria-label="Decisão solicitada pelo Boo" aria-busy={busy} className={styles.cartao}>
    <header className={styles.cabecalho}>
      <div className={styles.cabecalhoTexto}>
        <span aria-hidden className={styles.pulso} />
        <span className={styles.titulo}>{card.title}</span>
      </div>
      {card.badge && <span className={styles.etiqueta}>{card.badge}</span>}
    </header>

    {card.text && <p className={styles.texto}>{card.text}</p>}

    <div className={styles.opcoes} role="radiogroup" aria-label="Opções de decisão">
      {card.options.map(option => <button
        key={option.id}
        type="button"
        role="radio"
        aria-checked={selected === option.id}
        disabled={busy}
        className={styles.opcao}
        data-selecionada={selected === option.id}
        onClick={() => setSelected(option.id)}
      >
        <span className={styles.opcaoTitulo}>
          <span>{option.label}</span>
          {option.recommended && <span className={styles.recomendado}>Recomendado</span>}
        </span>
        {option.description && <span className={styles.opcaoDescricao}>{option.description}</span>}
      </button>)}
    </div>

    <footer className={styles.rodape}>
      {onInspect
        ? <button type="button" className={styles.acaoSecundaria} disabled={busy} onClick={onInspect}>
          <FileCode aria-hidden className={styles.acaoSecundariaIcone} />
          <span>Inspecionar no Diff</span>
        </button>
        : <span />}
      <button type="button" className={styles.acaoPrimaria} disabled={busy || !selected} onClick={() => void approve()}>
        <Check aria-hidden className={styles.acaoPrimariaIcone} />
        <span>{card.confirmLabel || 'Aprovar'} {card.options.find(option => option.id === selected)?.label.match(/^Opção [A-Z]/)?.[0] || ''}</span>
      </button>
    </footer>

    {error && <p role="alert" className={styles.erro}>{error}</p>}
  </section>
}
