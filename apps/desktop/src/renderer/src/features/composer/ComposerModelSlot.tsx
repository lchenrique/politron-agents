import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * O seletor de modelo mora na barra superior do chat, mas a lógica (modelo por conversa, esforço, opções) continua no Composer:
 * ele renderiza o controle por portal dentro deste encaixe. Sem encaixe (chat em aba, testes), o controle fica no composer.
 */
const ModelSlotContext = createContext<{ node: HTMLElement | null; setNode: (node: HTMLElement | null) => void } | null>(null)

export function ModelSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  return <ModelSlotContext.Provider value={{ node, setNode }}>{children}</ModelSlotContext.Provider>
}

export const useModelSlotNode = () => useContext(ModelSlotContext)?.node ?? null

/** Ponto da barra superior onde o seletor aparece. */
export function ModelSlot() {
  const context = useContext(ModelSlotContext)
  if (!context) return null
  return <span ref={context.setNode} data-model-slot className="flex min-w-0 items-center" />
}
