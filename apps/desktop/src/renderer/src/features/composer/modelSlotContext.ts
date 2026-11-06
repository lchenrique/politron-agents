import { createContext, useContext } from 'react'

/** Encaixe da barra superior onde o seletor de modelo é renderizado (ver ComposerModelSlot). */
export const ModelSlotContext = createContext<{ node: HTMLElement | null; setNode: (node: HTMLElement | null) => void } | null>(null)

export const useModelSlotNode = () => useContext(ModelSlotContext)?.node ?? null
