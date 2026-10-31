import { useEffect, useRef } from 'react'
import { delegationNotice, type PwaDelegation, type PwaDelegationState } from './pwa-agent-model'

/** Avisa (uma vez) quando uma delegação do Chief termina, falha ou passa a precisar do usuário. */
export function usePwaDelegationNotices(delegations: PwaDelegation[], onNotice: (text: string) => void) {
  const previous = useRef<Map<string, PwaDelegationState> | null>(null)
  useEffect(() => {
    const seen = previous.current
    previous.current = new Map(delegations.map(item => [item.id, item.state]))
    if (!seen) return
    for (const item of delegations) {
      const text = delegationNotice(seen.get(item.id), item)
      if (text) onNotice(text)
    }
  }, [delegations, onNotice])
}
