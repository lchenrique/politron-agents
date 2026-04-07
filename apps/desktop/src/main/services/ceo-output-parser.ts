import { CeoCommand, CeoCommandType, ParsedCeoOutput } from "../types/ceo"

interface CommandMatch {
  type: CeoCommandType
  raw: string
  params: string
}

const COMMAND_TYPES: CeoCommandType[] = [
  "CREATE_TEAM",
  "DELEGATE",
  "HIRE_AGENT",
  "PAUSE_TEAM",
  "RESUME_TEAM",
  "ASK_HUMAN",
]

const COMMAND_PATTERN = COMMAND_TYPES.map((t) => t.replace("_", "_?")).join("|")
const COMMAND_REGEX = new RegExp(`\\[(${COMMAND_PATTERN})\\]\\s*([^\\[]*)`, "gi")

function normalizeParamKey(key: string): string {
  return key.trim().toLowerCase()
}

function normalizeParamValue(value: string): string {
  return value
    .replace(/^\*+\s*/g, "")
    .replace(/\s*\*+$/g, "")
    .replace(/^[:\-–—]\s*/g, "")
    .replace(/^[,]+|[,]+$/g, "")
    .replace(/\r/g, "")
    .trim()
}

function parseKeyValueParams(paramsStr: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}

  if (!paramsStr.trim()) {
    return result
  }

  const keyRegex = /(\w+)\s*[:=]\s*/g
  const matches: Array<{ key: string; start: number; valueStart: number }> = []
  let match: RegExpExecArray | null

  while ((match = keyRegex.exec(paramsStr)) !== null) {
    matches.push({
      key: normalizeParamKey(match[1]),
      start: match.index,
      valueStart: match.index + match[0].length,
    })
  }

  for (let index = 0; index < matches.length; index++) {
    const current = matches[index]
    const next = matches[index + 1]
    const rawValue = paramsStr.slice(current.valueStart, next?.start ?? paramsStr.length).trim()
    const value = normalizeParamValue(rawValue.replace(/^['"]|['"]$/g, ""))

    if (!value) {
      continue
    }

    const existing = result[current.key]
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        result[current.key] = [existing, value]
      }
    } else {
      result[current.key] = value
    }
  }

  return result
}

function parseXmlParameterParams(paramsStr: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  const parameterRegex = /<parameter\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/parameter>/gi
  let match: RegExpExecArray | null

  while ((match = parameterRegex.exec(paramsStr)) !== null) {
    const key = normalizeParamKey(match[1] ?? "")
    const value = normalizeParamValue(match[2]?.trim().replace(/^['"]|['"]$/g, "") ?? "")
    if (!key || !value) {
      continue
    }

    const existing = result[key]
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        result[key] = [existing, value]
      }
    } else {
      result[key] = value
    }
  }

  return result
}

function parseXmlTagParams(paramsStr: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  const tagRegex = /<([A-Za-z][\w:-]*)>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(paramsStr)) !== null) {
    const key = normalizeParamKey(match[1] ?? "")
    const value = normalizeParamValue(match[2]?.trim().replace(/^['"]|['"]$/g, "") ?? "")
    if (!key || !value) {
      continue
    }

    const existing = result[key]
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        result[key] = [existing, value]
      }
    } else {
      result[key] = value
    }
  }

  return result
}

function mergeParams(
  primary: Record<string, string | string[]>,
  secondary: Record<string, string | string[]>
): Record<string, string | string[]> {
  const merged: Record<string, string | string[]> = { ...primary }

  for (const [key, value] of Object.entries(secondary)) {
    const existing = merged[key]
    if (!existing) {
      merged[key] = value
      continue
    }

    if (Array.isArray(existing)) {
      merged[key] = Array.isArray(value) ? [...existing, ...value] : [...existing, value]
      continue
    }

    merged[key] = Array.isArray(value) ? [existing, ...value] : [existing, value]
  }

  return merged
}

function extractCommands(text: string): { commands: CeoCommand[]; remainingText: string } {
  const commands: CeoCommand[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const regex = new RegExp(`\\[(${COMMAND_PATTERN})\\]\\s*([^\\[]*)`, "gi")

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      lastIndex = match.index
    }

    const commandType = match[1].replace("_?", "_") as CeoCommandType
    const paramsStr = match[2] ?? ""
    const raw = match[0]

    const payload = mergeParams(
      mergeParams(parseKeyValueParams(paramsStr), parseXmlParameterParams(paramsStr)),
      parseXmlTagParams(paramsStr)
    )

    commands.push({
      type: commandType,
      payload,
      raw: raw.trim(),
    })

    lastIndex = match.index + match[0].length
  }

  let remainingText = ""
  if (lastIndex > 0) {
    remainingText = text.slice(lastIndex).trim()
  } else {
    remainingText = text.trim()
  }

  return { commands, remainingText }
}

export function parseCeoOutput(output: string): ParsedCeoOutput {
  const { commands, remainingText } = extractCommands(output)
  return { commands, remainingText }
}

export function detectCommands(output: string): CeoCommandType[] {
  const regex = new RegExp(`\\[(${COMMAND_PATTERN})\\]`, "gi")
  const types: CeoCommandType[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(output)) !== null) {
    const type = match[1].replace("_?", "_") as CeoCommandType
    if (!types.includes(type)) {
      types.push(type)
    }
  }

  return types
}

export function hasCommands(output: string): boolean {
  return COMMAND_REGEX.test(output)
}
