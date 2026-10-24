import type { Agent, Approval } from '../../shared/v9'

// shortcut: heurística por texto, não sandbox; um comando ofuscado escapa. Trocar por isolamento real do processo quando houver.
const SENSITIVE_COMMANDS = [
  /\brm\s+(-\w*\s+)*-\w*[rf]/i, /\brmdir\b[^\n]*\/s/i, /\b(del|erase)\b[^\n]*\/[sq]/i, /\bRemove-Item\b[^\n]*-Recurse/i,
  /\bformat(\.com)?\s+[a-z]:/i, /\bmkfs\b/i, /\bdd\s+if=/i, /\bdiskpart\b/i,
  /\bgit\s+push\b/i, /\bgit\s+reset\s+--hard\b/i, /\bgit\s+clean\s+-\w*f/i, /\bgit\s+branch\s+-D\b/i, /\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/i, /\bgit\s+stash\s+(drop|clear)\b/i,
  /\b(npm|pnpm|yarn)\s+publish\b/i, /\bcargo\s+publish\b/i, /\btwine\s+upload\b/i,
  /\bgh\s+(pr\s+merge|release\s+create|repo\s+(delete|create))\b/i, /\b(vercel|netlify|wrangler|fly|firebase)\b[^\n]*(\bdeploy\b|\bpublish\b|--prod\b)/i,
  /\b(shutdown|reboot|halt)\b/i, /\breg\s+(add|delete|import)\b/i, /\bSet-ExecutionPolicy\b/i,
  /\b(curl|wget|iwr|Invoke-WebRequest)\b[^\n|]*\|\s*(ba|z)?sh\b/i, /\|\s*(iex|Invoke-Expression)\b/i,
  /\bsudo\b/i, /\bchmod\s+-R\s+777\b/i, /\b(taskkill|Stop-Process|killall|pkill)\b/i,
  /\bdrop\s+(table|database|schema)\b/i, /\btruncate\s+table\b/i, /\bdocker\s+(system\s+prune|volume\s+rm|rmi?\b)/i,
  /\b(ssh|scp|sftp)\s/i, /--force\b/i,
]

/** Comandos destrutivos, irreversíveis ou com efeito externo continuam exigindo aprovação no modo automático. */
export function isSensitiveCommand(command: string): boolean {
  return SENSITIVE_COMMANDS.some(pattern => pattern.test(command))
}

/**
 * ask: confirma toda ação. automatic: autonomia dentro das permissões, confirmando só ações sensíveis.
 * bypass: dispensa confirmações de ferramentas. Perguntas humanas e planos nunca são automáticos.
 */
export function shouldAutoApprove(mode: Agent['approvalMode'], kind: Approval['kind'], sensitive: boolean): boolean {
  if (kind === 'question' || kind === 'plan') return false
  if (mode === 'bypass') return true
  return mode === 'automatic' && !sensitive
}
