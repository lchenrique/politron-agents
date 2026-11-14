import { useEffect, useState } from 'react'
import { DEFAULT_BLOCKED_ACTIONS, type BlockedActionRules } from '../../../../shared/blocked-actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { errorText } from './appShellShared'

const RULES: Array<{ key: 'forcePushMain' | 'deleteOutsideWorkspace' | 'productionEnvWrite'; label: string; hint: string }> = [
  { key: 'forcePushMain', label: 'Push forçado para main ou master', hint: 'git push --force, -f ou +main.' },
  { key: 'deleteOutsideWorkspace', label: 'Apagar fora da pasta do workspace', hint: 'rm -rf, del, Remove-Item e afins com alvo fora da pasta ou na própria pasta.' },
  { key: 'productionEnvWrite', label: 'Escrever em .env de produção', hint: '.env.production, .env.prod e variantes.' },
]

/** Lista do que nunca fazer: recusa a ação com mensagem ao agente, sem pedir aprovação, mesmo em Acesso total. */
export function BlockedActionsPanel() {
  const [rules, setRules] = useState<BlockedActionRules>(DEFAULT_BLOCKED_ACTIONS)
  const [patterns, setPatterns] = useState('')
  const [feedback, setFeedback] = useState('')
  useEffect(() => {
    let active = true
    void window.appAPI.settingsPreferences().then(value => { if (!active || !value.blockedActions) return; setRules(value.blockedActions); setPatterns(value.blockedActions.patterns.join('\n')) }).catch(error => { if (active) setFeedback(errorText(error)) })
    return () => { active = false }
  }, [])
  const save = async (next: BlockedActionRules) => {
    setFeedback('')
    try { const saved = await window.appAPI.saveBlockedActions(next); setRules(saved); setPatterns(saved.patterns.join('\n')); setFeedback('Lista salva.') }
    catch (error) { setFeedback(errorText(error)) }
  }
  return <div className="space-y-3">
    <div className="divide-y divide-border rounded-md border border-border">
      {RULES.map(rule => <label key={rule.key} className="flex items-start gap-3 px-3 py-2.5 text-sm">
        <Checkbox checked={rules[rule.key]} onCheckedChange={checked => void save({ ...rules, [rule.key]: checked === true })} className="mt-0.5" />
        <span><span className="font-medium">{rule.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{rule.hint}</span></span>
      </label>)}
    </div>
    <label className="block space-y-1.5 text-sm">Padrões extras de comando
      <Textarea value={patterns} onChange={event => setPatterns(event.target.value)} rows={3} className="w-full resize-y border border-input bg-background px-3 py-2 font-mono text-xs" placeholder={'Uma expressão regular por linha, por exemplo:\nnpm\\s+publish'} />
      <span className="block text-xs text-muted-foreground">Comparados com o comando inteiro, sem diferenciar maiúsculas. Até 20 linhas.</span>
    </label>
    <div className="flex items-center gap-3">
      <Button type="button" size="sm" variant="outline" onClick={() => void save({ ...rules, patterns: patterns.split('\n') })}>Salvar padrões</Button>
      <p role="status" className="text-xs text-muted-foreground empty:hidden">{feedback}</p>
    </div>
  </div>
}
