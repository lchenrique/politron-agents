/** Skills do Marketplace de um Boo: marca e desmarca quais ele usa. Skills globais valem para todos e não aparecem aqui. */
import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import type { SkillInfo } from '../../../../shared/skills'

const slugOf = (skill: SkillInfo) => skill.id.replace(/^marketplace:/, '')

export function AgentSkills({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!window.skillsAPI) { setSkills([]); return }
    window.skillsAPI.list().then(items => setSkills(items.filter(item => item.source === 'marketplace')), () => setSkills([]))
  }, [])
  const selected = useMemo(() => new Set(value), [value])
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    const list = (skills || []).filter(skill => !term || `${slugOf(skill)} ${skill.description}`.toLocaleLowerCase('pt-BR').includes(term))
    return list.sort((a, b) => Number(selected.has(slugOf(b))) - Number(selected.has(slugOf(a))) || slugOf(a).localeCompare(slugOf(b)))
  }, [skills, query, selected])
  const toggle = (slug: string, on: boolean) => onChange(on ? [...value, slug] : value.filter(item => item !== slug))

  if (skills === null) return <p className="text-sm text-muted-foreground">Carregando skills…</p>
  if (!skills.length) return <p className="text-sm text-muted-foreground">Nenhuma skill do Marketplace disponível.</p>
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{value.length ? `${value.length} skill${value.length === 1 ? '' : 's'} do Marketplace neste Boo.` : 'Este Boo ainda não tem skills do Marketplace.'} As skills globais (Configurações → Skills) continuam valendo para todos.</p>
    <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar skill…" aria-label="Buscar skill" />
    <ul className="max-h-[420px] space-y-1 overflow-y-auto">
      {visible.map(skill => {
        const slug = slugOf(skill)
        return <li key={skill.id}>
          <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted">
            <Checkbox checked={selected.has(slug)} onCheckedChange={checked => toggle(slug, checked === true)} aria-label={slug} className="mt-0.5" />
            <span className="min-w-0"><span className="block font-mono text-xs">{slug}</span><span className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</span></span>
          </label>
        </li>
      })}
    </ul>
  </div>
}
