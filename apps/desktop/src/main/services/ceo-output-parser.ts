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

function parseKeyValueParams(paramsStr: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  
  if (!paramsStr.trim()) {
    return result
  }

  const kvRegex = /(\w+):\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null

  while ((match = kvRegex.exec(paramsStr)) !== null) {
    const key = match[1]
    const value = match[2] ?? match[3] ?? ""

    if (result[key]) {
      const existing = result[key]
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

    const payload = parseKeyValueParams(paramsStr)

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
