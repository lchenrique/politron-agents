import { createHash } from 'node:crypto'
import type { DynamicTool } from './codex'

export const TOOL_BROKER_VERSION = 1

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]))
}

export function fingerprintTools(tools: DynamicTool[], brokerVersion: number): string {
  const normalized = tools.map(tool => ({
    type: tool.type,
    name: tool.name,
    description: tool.description,
    inputSchema: canonical(tool.inputSchema),
  })).sort((left, right) => left.name.localeCompare(right.name) || JSON.stringify(left).localeCompare(JSON.stringify(right)))
  return createHash('sha256').update(JSON.stringify({ brokerVersion, tools: normalized }), 'utf8').digest('hex')
}
