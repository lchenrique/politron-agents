import { homedir } from 'node:os'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { DEFAULT_BLOCKED_ACTIONS, type BlockedActionRules } from '../../shared/blocked-actions'

/** Ação que um agente quer executar: comando de shell e/ou arquivos que vai escrever. */
export interface GuardedAction { command?: string; paths?: string[]; cwd?: string }

// shortcut: heurística por texto, como isSensitiveCommand; comando ofuscado (eval, base64, script em arquivo) escapa. Trocar por isolamento real do processo quando houver.
const DELETE_VERBS = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'unlink', 'remove-item', 'ri', 'rimraf', 'shred'])
const WINDOWS_VERBS = new Set(['rmdir', 'rd', 'del', 'erase'])
const CD_VERBS = new Set(['cd', 'chdir', 'pushd', 'set-location', 'sl'])
const PROD_ENV = /^\.env(?:\.[\w.-]*)?$/i
const isProdEnvFile = (path: string) => { const name = basename(path.replace(/\\/g, '/')); return PROD_ENV.test(name) && /(^|\.)(prod|production)(\.|$)/i.test(name.slice(4)) }
const ENV_WRITE_VERB = /(^|[\s;&|(])(tee|cp|mv|copy|move|ren|rename|truncate|Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Rename-Item|Clear-Content|sc|ac)(\s|$)|\bsed\s+(-\w*\s+)*-i/i

const segments = (command: string) => command.split(/&&|\|\||[;|\n\r]/).map(part => part.trim()).filter(Boolean)
const tokens = (segment: string) => [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3])

function isInside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path !== '' && path !== '..' && !path.startsWith('..') && !isAbsolute(path)
}

/** Alvo fora da pasta, a própria pasta ou caminho com variável que não dá para conferir. */
function unsafeDeleteTarget(token: string, cwd: string, root: string): boolean {
  if (/[$%]/.test(token)) return true
  const expanded = token === '~' || /^~[\\/]/.test(token) ? homedir() + token.slice(1) : token
  return !isInside(root, resolve(cwd, expanded))
}

function deletesOutside(command: string, root: string, start: string): string | null {
  let cwd = start
  for (const segment of segments(command)) {
    const words = tokens(segment)
    const first = words[0]?.toLowerCase()
    if (first && CD_VERBS.has(first)) { const target = words.slice(1).find(word => !word.startsWith('-')); cwd = target ? resolve(cwd, target.startsWith('~') ? homedir() + target.slice(1) : target) : homedir(); continue }
    // Procura o verbo em qualquer posição: cobre sudo, bash -lc "rm ..." e o comando em lista do Codex.
    const index = words.findIndex(word => DELETE_VERBS.has(word.toLowerCase()))
    if (index < 0) continue
    const verb = words[index].toLowerCase()
    const targets = words.slice(index + 1).filter(word => !word.startsWith('-') && !(WINDOWS_VERBS.has(verb) && /^\/\w$/.test(word)))
    const bad = targets.find(target => unsafeDeleteTarget(target, cwd, root))
    if (bad) return bad
  }
  return null
}

function forcePushesMain(command: string, branch?: string | null): boolean {
  return segments(command).some(segment => {
    const words = tokens(segment)
    const push = words.findIndex((word, index) => word === 'push' && words[index - 1] === 'git')
    if (push < 0) return false
    const args = words.slice(push + 1)
    const flags = args.filter(word => word.startsWith('-'))
    const positional = args.filter(word => !word.startsWith('-'))
    const refspecs = positional.slice(1)
    const onMain = !!branch && /^(main|master)$/i.test(branch)
    const toMain = (ref: string) => /(^|[:+/])(main|master)$/i.test(ref) || (onMain && /^\+?HEAD$/i.test(ref))
    const forced = flags.some(flag => /^--force(-with-lease|-if-includes)?(=|$)/.test(flag) || /^-[a-z]*f[a-z]*$/i.test(flag)) || refspecs.some(ref => ref.startsWith('+'))
    if (!forced) return false
    return refspecs.length ? refspecs.some(toMain) : onMain
  })
}

function writesProductionEnv(command: string): string | null {
  for (const segment of segments(command)) {
    const words = tokens(segment)
    const target = words.find(word => isProdEnvFile(word.replace(/^>+/, '')))
    if (!target) continue
    if (/>{1,2}\s*["']?[^\s"'>]*\.env[^\s"']*/i.test(segment) || ENV_WRITE_VERB.test(segment)) return target.replace(/^>+/, '')
  }
  return null
}

/** O comando e cada trecho entre aspas com espaço: o Codex manda `pwsh.exe -Command 'rm -rf x'` e `bash -lc "..."` como texto único. */
const withNested = (command: string) => [command, ...[...command.matchAll(/"((?:[^"\\]|\\.)*\s(?:[^"\\]|\\.)*)"|'([^']*\s[^']*)'/g)].map(match => (match[1] ?? match[2]).replace(/\\"/g, '"'))]

const refusal = (rule: string) => `Ação bloqueada pela lista do que nunca fazer (${rule}). Esta regra vale mesmo em Acesso total e não será aprovada. Não tente contornar; siga por outro caminho ou explique ao usuário o que precisa.`

/** Motivo da recusa, ou null quando a ação pode seguir. Nunca pergunta ao usuário. */
export function blockedActionReason(action: GuardedAction, root: string, rules: BlockedActionRules = DEFAULT_BLOCKED_ACTIONS, branch?: string | null): string | null {
  const command = action.command?.trim()
  if (command) for (const candidate of withNested(command)) {
    if (rules.forcePushMain && forcePushesMain(candidate, branch)) return refusal('push forçado para main/master')
    const outside = rules.deleteOutsideWorkspace ? deletesOutside(candidate, root, action.cwd ? resolve(root, action.cwd) : root) : null
    if (outside) return refusal(`apagar fora da pasta do workspace: ${outside}`)
    const env = rules.productionEnvWrite ? writesProductionEnv(candidate) : null
    if (env) return refusal(`escrever em ${env}`)
  }
  if (command) {
    const pattern = rules.patterns.find(value => { try { return new RegExp(value, 'i').test(command) } catch { return false } })
    if (pattern) return refusal(`padrão ${pattern}`)
  }
  const envPath = rules.productionEnvWrite ? action.paths?.find(isProdEnvFile) : undefined
  if (envPath) return refusal(`escrever em ${envPath}`)
  return null
}

/** Ferramentas nativas do Claude (PreToolUse). */
export function claudeToolAction(name: string, input: unknown): GuardedAction {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (typeof value.command === 'string' && /^(Bash|PowerShell)$/.test(name)) return { command: value.command }
  const path = value.file_path ?? value.notebook_path
  return typeof path === 'string' ? { paths: [path] } : {}
}

/** Pedidos de aprovação do Codex (v1 e v2). */
export function codexApprovalAction(params: Record<string, unknown>): GuardedAction {
  const command = Array.isArray(params.command) ? params.command.join(' ') : typeof params.command === 'string' ? params.command : undefined
  const changes = params.fileChanges && typeof params.fileChanges === 'object' ? Object.keys(params.fileChanges) : []
  return { ...(command ? { command } : {}), ...(changes.length ? { paths: changes } : {}), ...(typeof params.cwd === 'string' ? { cwd: params.cwd } : {}) }
}

export function normalizeBlockedActions(input: unknown): BlockedActionRules {
  const value = input && typeof input === 'object' ? input as Partial<BlockedActionRules> : {}
  const flag = (key: 'forcePushMain' | 'deleteOutsideWorkspace' | 'productionEnvWrite') => typeof value[key] === 'boolean' ? value[key] : DEFAULT_BLOCKED_ACTIONS[key]
  const patterns = Array.isArray(value.patterns) ? value.patterns.map(item => String(item).trim()).filter(Boolean) : []
  if (patterns.length > 20) throw new Error('Use até 20 padrões bloqueados.')
  for (const pattern of patterns) {
    if (pattern.length > 300) throw new Error('Cada padrão bloqueado aceita até 300 caracteres.')
    try { new RegExp(pattern, 'i') } catch { throw new Error(`Padrão bloqueado inválido: ${pattern}`) }
  }
  return { forcePushMain: flag('forcePushMain'), deleteOutsideWorkspace: flag('deleteOutsideWorkspace'), productionEnvWrite: flag('productionEnvWrite'), patterns }
}
