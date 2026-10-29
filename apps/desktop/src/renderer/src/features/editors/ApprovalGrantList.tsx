import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { ApprovalGrant } from '../../../../shared/v9'
import { Button } from '@/components/ui/button'
import { errorText } from '../app/appShellShared'

export function ApprovalGrantList({ agentId }: { agentId: string }) {
  const [grants, setGrants] = useState<ApprovalGrant[]>([])
  const [problem, setProblem] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = window.appAPI?.approvalGrants
    if (!load) return () => { active = false }
    void load(agentId).then(value => { if (active) setGrants(value) }).catch(error => { if (active) setProblem(errorText(error)) })
    return () => { active = false }
  }, [agentId])

  const revoke = async (grant: ApprovalGrant) => {
    setRemoving(grant.id); setProblem('')
    try {
      await window.appAPI.removeApprovalGrant(grant.id, agentId)
      setGrants(current => current.filter(item => item.id !== grant.id))
    } catch (error) { setProblem(errorText(error)) }
    finally { setRemoving(null) }
  }

  if (grants.length === 0 && !problem) return <p className="text-xs text-muted-foreground">Nenhuma permissão de “Sempre permitir” salva para este agente.</p>
  return <section aria-label="Permissões sempre permitidas" className="space-y-2 rounded-lg border border-border/70 p-3">
    <div><h4 className="text-sm font-medium">Sempre permitir</h4><p className="text-xs leading-5 text-muted-foreground">Cada regra vale para a mesma ação, deste agente, no workspace indicado. Você pode revogá-la aqui.</p></div>
    {grants.map(grant => <div key={grant.id} className="flex items-center gap-2 border-t border-border/50 pt-2">
      <span className="min-w-0 flex-1 text-xs"><span className="block truncate font-medium">{grant.summary}</span><span className="text-muted-foreground">{grant.workspaceName || grant.workspaceId}</span></span>
      <Button type="button" variant="ghost" size="sm" aria-label={`Revogar ${grant.summary}`} disabled={removing === grant.id} onClick={() => void revoke(grant)}><Trash2 aria-hidden="true" className="size-3.5" />Revogar</Button>
    </div>)}
    {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
  </section>
}
