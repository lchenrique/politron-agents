import type { ActivityTool } from '../../shared/v9'

/** Limites do registro estruturado de ferramentas no chat: o modelo recebe tudo, a transcrição guarda só uma prévia. */
export const TOOL_ARGS_MAX = 4000
export const TOOL_OUTPUT_MAX = 8000

const SECRET = '[segredo removido]'
// Mesmos formatos de containsSecret (skills/learning) mais atribuições do tipo API_KEY=valor, comuns em .env e comandos.
const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, SECRET],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, SECRET], [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, `Bearer ${SECRET}`],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, SECRET], [/\bAKIA[0-9A-Z]{16}\b/g, SECRET], [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, SECRET], [/\bAIza[0-9A-Za-z_-]{35}\b/g, SECRET],
  [/\b([A-Za-z0-9_]*(?:api[_-]?key|secret|token|password|passwd|pwd)[A-Za-z0-9_]*)(["']?\s*[:=]\s*["']?)[^\s"',;]{4,}/gi, `$1$2${SECRET}`],
]

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value)
}

export function clipText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n… [truncado]` : value
}

/** Texto seguro para a transcrição: URLs pelo redator do chamador, segredos removidos e tamanho limitado. */
export function toolPreview(value: unknown, redactUrls: (value: string) => string, max: number): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''
  return clipText(redactSecrets(redactUrls(raw)), max)
}

/** Registro inicial de uma chamada; `path` só para ferramentas de arquivo, já relativo à pasta do projeto. */
export function startedTool(name: string, args: Record<string, unknown>, redactUrls: (value: string) => string): ActivityTool {
  const path = typeof args.path === 'string' && /^workspace_(read|write|list)$/.test(name) ? args.path.slice(0, 1000) : undefined
  return { name, args: toolPreview(args, redactUrls, TOOL_ARGS_MAX), status: 'running', startedAt: new Date().toISOString(), ...(path ? { path } : {}) }
}

/** Fecha o registro com a saída (ou o erro) e, para comandos, o código de saída lido do texto devolvido ao modelo. */
export function finishedTool(tool: ActivityTool, status: 'completed' | 'failed', result: unknown, redactUrls: (value: string) => string): ActivityTool {
  const output = toolPreview(result, redactUrls, TOOL_OUTPUT_MAX)
  const exit = /workspace_(run_command|process_status|stop_process)/.test(tool.name) ? /(?:Código de saída: |código )(-?\d+)/.exec(output) : null
  return { ...tool, status, output, finishedAt: new Date().toISOString(), ...(exit ? { exitCode: Number(exit[1]) } : {}) }
}

/** Resumo de raciocínio de um item `reasoning` (Codex: summary/content; Claude: thinking), ou '' sem texto. */
export function reasoningText(item: Record<string, unknown>): string {
  const parts = (value: unknown) => Array.isArray(value) ? value.map(part => typeof part === 'string' ? part : typeof (part as { text?: unknown })?.text === 'string' ? (part as { text: string }).text : '') : []
  const summary = parts(item.summary).filter(Boolean)
  return (summary.length ? summary : parts(item.content)).join('\n\n').trim()
}
