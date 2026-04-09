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
const COMMAND_BLOCK_REGEX = new RegExp(
  String.raw`(^|\n)\s*\[(${COMMAND_PATTERN})([^\]\n]*)\][ \t]*([\s\S]*?)(?=(?:\n\s*\[(?:${COMMAND_PATTERN})(?:[^\]\n]*)\])|$)`,
  "gi"
)

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

  const lines = paramsStr
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))

  if (lines.length > 1) {
    const lineKeyRegex = /^\s*([\w-]+)\s*[:=]\s*(.*)$/
    let currentKey: string | null = null
    let currentValueParts: string[] = []

    const flushCurrent = () => {
      if (!currentKey) {
        return
      }

      const value = normalizeParamValue(currentValueParts.join("\n").replace(/^['"]|['"]$/g, ""))
      if (!value) {
        currentKey = null
        currentValueParts = []
        return
      }

      const existing = result[currentKey]
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value)
        } else {
          result[currentKey] = [existing, value]
        }
      } else {
        result[currentKey] = value
      }

      currentKey = null
      currentValueParts = []
    }

    for (const line of lines) {
      const lineMatch = line.match(lineKeyRegex)
      if (lineMatch) {
        flushCurrent()
        currentKey = normalizeParamKey(lineMatch[1])
        currentValueParts = [lineMatch[2] ?? ""]
        continue
      }

      if (currentKey) {
        currentValueParts.push(line)
      }
    }

    flushCurrent()
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

function isParameterLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) {
    return true
  }

  return (
    /^(<parameter\s+name=["'][^"']+["']\s*>[\s\S]*<\/parameter>|<[A-Za-z][\w:-]*>[\s\S]*<\/[A-Za-z][\w:-]*>)$/i.test(trimmed) ||
    /^\w+\s*[:=]\s*/.test(trimmed)
  )
}

function splitParamsAndTrailingText(paramsStr: string): { params: string; trailingText: string } {
  if (!paramsStr.trim()) {
    return { params: "", trailingText: "" }
  }

  const lines = paramsStr.split("\n")
  const paramLines: string[] = []
  const trailingLines: string[] = []
  let foundTrailingText = false

  for (const line of lines) {
    if (!foundTrailingText && isParameterLine(line)) {
      paramLines.push(line)
      continue
    }

    foundTrailingText = true
    trailingLines.push(line)
  }

  return {
    params: paramLines.join("\n").trim(),
    trailingText: trailingLines.join("\n").trim(),
  }
}

function extractCommands(text: string): { commands: CeoCommand[]; remainingText: string } {
  const commands: CeoCommand[] = []
  const trailingSegments: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = COMMAND_BLOCK_REGEX.exec(text)) !== null) {
    const blockStart = match.index + (match[1]?.length ?? 0)
    const blockEnd = COMMAND_BLOCK_REGEX.lastIndex
    if (blockStart > lastIndex) {
      trailingSegments.push(text.slice(lastIndex, blockStart).trim())
    }

    const commandType = match[2].replace("_?", "_") as CeoCommandType
    const inlineParamsStr = (match[3] ?? "").trim()
    const bodyParamsStr = match[4] ?? ""
    const rawParamsStr = [inlineParamsStr, bodyParamsStr].filter(Boolean).join("\n")
    const raw = text.slice(blockStart, blockEnd)
    const { params: paramsStr, trailingText } = splitParamsAndTrailingText(rawParamsStr)

    const payload = mergeParams(
      mergeParams(parseKeyValueParams(paramsStr), parseXmlParameterParams(paramsStr)),
      parseXmlTagParams(paramsStr)
    )

    commands.push({
      type: commandType,
      payload,
      raw: raw.trim(),
    })

    if (trailingText) {
      trailingSegments.push(trailingText)
    }

    lastIndex = blockEnd
  }

  let remainingText = ""
  if (lastIndex > 0) {
    remainingText = [trailingSegments.join("\n").trim(), text.slice(lastIndex).trim()]
      .filter(Boolean)
      .join("\n")
      .trim()
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
  const types: CeoCommandType[] = []
  let match: RegExpExecArray | null

  COMMAND_BLOCK_REGEX.lastIndex = 0
  while ((match = COMMAND_BLOCK_REGEX.exec(output)) !== null) {
    const type = match[2].replace("_?", "_") as CeoCommandType
    if (!types.includes(type)) {
      types.push(type)
    }
  }

  return types
}

export function hasCommands(output: string): boolean {
  COMMAND_BLOCK_REGEX.lastIndex = 0
  return COMMAND_BLOCK_REGEX.test(output)
}
