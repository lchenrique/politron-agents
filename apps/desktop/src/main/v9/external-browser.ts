import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { NodeReplServer } from './external-browser-proxy'

const read = (file: string) => { try { return readFileSync(file, 'utf8') } catch { return '' } }
const defaultCodexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex')

// shortcut: leitor TOML mínimo (strings, arrays de strings em uma linha, tabelas simples); trocar por parser completo se o Codex mudar o formato.
const tomlValue = (raw: string): unknown => {
  const value = raw.trim()
  const basic = (text: string) => { try { return JSON.parse(`"${text}"`) as string } catch { return undefined } }
  if (value.startsWith("'")) return value.match(/^'([^']*)'/)?.[1]
  if (value.startsWith('"')) { const match = value.match(/^"((?:[^"\\]|\\.)*)"/); return match ? basic(match[1]) : undefined }
  if (value.startsWith('[')) return [...value.matchAll(/'([^']*)'|"((?:[^"\\]|\\.)*)"/g)].map(match => match[1] ?? basic(match[2]))
  return undefined
}
function tomlSection(source: string, name: string): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  let inside = false
  for (const line of source.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header) { inside = header[1].trim() === name; continue }
    const entry = inside && line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+)$/)
    if (entry) values[entry[1]] = tomlValue(entry[2])
  }
  return values
}

/** Comando, argumentos e ambiente do node_repl exatamente como o Codex declara; só leitura. */
export function readNodeReplServer(codexHome = defaultCodexHome(), parentEnv: NodeJS.ProcessEnv = process.env): NodeReplServer | null {
  const source = read(join(codexHome, 'config.toml'))
  const server = tomlSection(source, 'mcp_servers.node_repl')
  if (typeof server.command !== 'string' || !server.command) return null
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(tomlSection(source, 'mcp_servers.node_repl.env'))) if (typeof value === 'string') env[key] = value
  for (const name of Array.isArray(server.env_vars) ? server.env_vars : []) if (typeof name === 'string' && typeof parentEnv[name] === 'string') env[name] = parentEnv[name]
  return { command: server.command, args: Array.isArray(server.args) ? server.args.filter((arg): arg is string => typeof arg === 'string') : [], env }
}

/**
 * Verifica, somente lendo arquivos do Codex, as peças da ponte oficial do plugin chrome@openai-bundled:
 * browser-client, servidor MCP node_repl e host nativo registrado para a extensão. Não toca no navegador,
 * em perfis, abas ou cookies. Mensagens não incluem caminhos locais.
 */
export function probeExternalBrowserBridge(codexHome = defaultCodexHome(), localAppData = process.env.LOCALAPPDATA || '', platform: NodeJS.Platform = process.platform): string[] {
  const problems: string[] = []
  const plugin = join(codexHome, 'plugins', 'cache', 'openai-bundled', 'chrome')
  let versions: string[] = []
  try { versions = readdirSync(plugin).filter(version => existsSync(join(plugin, version, 'scripts', 'browser-client.mjs'))) } catch { /* Plugin ausente. */ }
  if (!versions.length) problems.push('plugin oficial chrome@openai-bundled não encontrado no Codex')
  const command = readNodeReplServer(codexHome)?.command
  if (!command) problems.push('servidor MCP node_repl não está configurado no Codex')
  else if (!existsSync(command)) problems.push('servidor MCP node_repl configurado aponta para um executável inexistente')
  if (platform !== 'win32') problems.push('verificação do host nativo da extensão disponível somente no Windows')
  else {
    let host: unknown
    try { host = JSON.parse(read(join(localAppData, 'OpenAI', 'extension', 'com.openai.codexextension.json'))).path } catch { /* Manifesto ausente ou inválido. */ }
    if (typeof host !== 'string' || !existsSync(host)) problems.push('host nativo da extensão oficial ausente ou apontando para arquivo inexistente')
  }
  return problems
}
