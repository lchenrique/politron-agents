import css from './Transcript.module.css'

/** Marcadores DSH para saltar entre turnos já carregados na conversa. */
export function TurnNavigator({ count, activeIndex, onNavigate }: {
  count: number
  activeIndex: number
  onNavigate: (index: number) => void
}) {
  return (
    <div className={css.navigatorDock}><nav className={css.navigator} aria-label="Navegação por turnos">
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          className={css.navigatorMark}
          aria-label={`Ir para o turno ${index + 1}`}
          aria-current={activeIndex === index ? 'location' : undefined}
          onClick={() => onNavigate(index)}
        />
      ))}
    </nav></div>
  )
}
