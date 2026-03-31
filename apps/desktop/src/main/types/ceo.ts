export type CeoCommandType =
  | "CREATE_TEAM"
  | "DELEGATE"
  | "HIRE_AGENT"
  | "PAUSE_TEAM"
  | "RESUME_TEAM"
  | "ASK_HUMAN"

export interface CeoCommand {
  type: CeoCommandType
  payload: Record<string, string | string[]>
  raw: string
}

export interface ParsedCeoOutput {
  commands: CeoCommand[]
  remainingText: string
}