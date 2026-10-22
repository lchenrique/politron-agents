import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { UpdateSnapshot } from '../../../../shared/updates'

export function UpdateReadyCallout({ onOpen }: { onOpen: () => void }) {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    const api = window.updatesAPI
    if (!api) return
    let active = true
    const accept = (value: UpdateSnapshot) => {
      if (active) setVersion(value.phase === 'downloaded' ? value.latestVersion : null)
    }
    void api.status().then(accept).catch(() => undefined)
    const off = api.onChanged(accept)
    return () => { active = false; off() }
  }, [])
  if (!version) return null
  return <div className="fixed bottom-20 right-5 z-[60] flex max-w-sm items-center gap-3 rounded-xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl" role="status">
    <span>Boobot {version} está pronto para instalar.</span>
    <Button size="sm" variant="outline" onClick={onOpen}>Ver</Button>
  </div>
}
