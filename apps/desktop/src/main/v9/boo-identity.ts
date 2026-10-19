import { PIT_COLOR_PALETTE, type Agent } from '../../shared/v9'

/** Nomes de mitologias misturadas. Preferência semântica, sem sobrescrever escolhas do usuário. */
const MYTH_NAMES = [
  { name: 'Atena', terms: /arquitet|planej|estrateg|lider|organiz/i },
  { name: 'Hefesto', terms: /codig|program|desenvolv|implement|constr|backend|frontend/i },
  { name: 'Hermes', terms: /integr|comunic|mensag|api|conex/i },
  { name: 'Thoth', terms: /pesquis|document|conhec|escrit|analise/i },
  { name: 'Freya', terms: /design|interface|visual|estet|criativ/i },
  { name: 'Tyr', terms: /segur|auditor|risco|conform/i },
  { name: 'Brigid', terms: /marketing|conteud|campanha|arte/i },
  { name: 'Mimir', terms: /dados|ciencia|metric|inteligencia/i },
  { name: 'Íris', terms: /suporte|atend|relacion/i },
  { name: 'Argos', terms: /teste|qualidade|revis|verific/i },
  { name: 'Seshat', terms: /relator|especific|registro/i },
  { name: 'Inari', terms: /negoc|produto|vend|comerc/i },
  { name: 'Lugh', terms: /automac|operac|infra|devops/i },
  { name: 'Héstia', terms: /cuidado|acolhim|bem-estar/i },
  { name: 'Eir', terms: /saude|medic|nutri/i },
  { name: 'Hórus', terms: /monitor|observ|visao/i },
]

export function booAlias(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')
}

/** Reúso de nomes é evitado até entre propostas de uma mesma equipe. */
export function chooseBooIdentity(input: { name?: string; color?: string; description?: string; instructions: string }, existing: Pick<Agent, 'name' | 'alias' | 'color'>[]): { name: string; alias: string; color: string } {
  const normalized = (name: string) => booAlias(name)
  const taken = new Set(existing.map(item => normalized(item.name)))
  const meaning = input.description + ' ' + input.instructions
  const selected = MYTH_NAMES.find(item => item.terms.test(meaning) && !taken.has(normalized(item.name)))
    || MYTH_NAMES.find(item => !taken.has(normalized(item.name)))
  const proposed = (input.name || '').trim()
  const name = proposed || selected?.name || 'Boo ' + (existing.length + 1)
  // Um nome definido pelo usuário prevalece; a menção pode receber sufixo para evitar conflitos.
  const base = booAlias(name) || 'boo'
  const aliases = new Set(existing.map(item => item.alias.toLocaleLowerCase('pt-BR')))
  let alias = base
  for (let n = 2; aliases.has(alias); n++) alias = base + '-' + n
  const previousColors = new Set(existing.map(item => item.color.toLowerCase()))
  const preferred = PIT_COLOR_PALETTE.find(color => !previousColors.has(color.toLowerCase())) || PIT_COLOR_PALETTE[existing.length % PIT_COLOR_PALETTE.length]
  return { name, alias, color: /^#[a-f0-9]{6}$/i.test(input.color || '') ? input.color! : preferred }
}
