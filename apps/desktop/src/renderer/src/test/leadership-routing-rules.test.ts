// @vitest-environment node

import { readFileSync } from "fs"
import { describe, expect, it } from "vitest"

const root = "D:/projetos pessoais/politron"

function readText(relativePath: string): string {
  return readFileSync(`${root}/${relativePath}`, "utf8")
}

describe("leadership routing rules", () => {
  it("keeps the global CTO focused on routing, not execution", () => {
    const ceo = readText(".opencode/agents/ceo.md")
    expect(ceo).toContain("Global CTO")
    expect(ceo).toContain("encaminha a necessidade para o Tech Lead responsável")
    expect(ceo).toContain("Você só pode editar código em casos estritamente necessários e excepcionais")
    expect(ceo).toContain("tome a decisão, encaminhe e avance sem pedir confirmação extra")
    expect(ceo).toContain("sua resposta deve incluir o comando apropriado")
  })

  it("keeps the tech lead focused on delegation and validation", () => {
    const techLead = readText(".opencode/agents/tech-lead.md")
    expect(techLead).toContain("não é um executor principal de código por padrão")
    expect(techLead).toContain("Analisar a demanda, planejar o trabalho e quebrar tarefas em partes executáveis.")
    expect(techLead).toContain("Priorize delegação em vez de execução direta.")
    expect(techLead).toContain("colocar o time em movimento sem pedir confirmação desnecessária")
    expect(techLead).toContain("emita a ação em comando real")
    expect(techLead).toContain("Primeiro esgotar o uso inteligente dos agentes já existentes no time antes de pedir contratação.")
  })

  it("keeps the team context aligned with delegated implementation", () => {
    const sdk = readText("apps/desktop/src/main/services/opencode-sdk.ts")
    expect(sdk).toContain("Lideran\\u00e7a coordena e valida; implementa\\u00e7\\u00e3o deve ficar com os agentes executores do time.")
    expect(sdk).toContain("Global CTO e Tech Lead devem evitar executar c\\u00f3digo como caminho normal.")
    expect(sdk).toContain("A coordena\\u00e7\\u00e3o deve sempre favorecer delega\\u00e7\\u00e3o, planejamento e valida\\u00e7\\u00e3o.")
    expect(sdk).toContain("pedido estruturado contendo team, desiredRole, justification, priority e successCriteria")
    expect(sdk).toContain("contrata\\u00e7\\u00e3o \\u00e9 exce\\u00e7\\u00e3o, n\\u00e3o fluxo padr\\u00e3o")
    expect(sdk).toContain("n\\u00e3o pe\\u00e7a confirma\\u00e7\\u00e3o para passos normais do fluxo")
    expect(sdk).toContain("texto descritivo sozinho n\\u00e3o aciona o fluxo")
  })

  it("keeps the transcript bridge alive at the workspace layout level", () => {
    const index = readText("apps/desktop/src/renderer/src/pages/Index.tsx")
    const shell = readText("apps/desktop/src/renderer/src/features/chat/components/shell/AgentChatShell.tsx")
    const bridge = readText("apps/desktop/src/renderer/src/features/chat/hooks/useOpencodeTranscriptBridge.ts")

    expect(index).toContain("useOpencodeTranscriptBridge")
    expect(index).toContain("chatBridge.activeAgent")
    expect(index).toContain("chatBridge.header")
    expect(index).toContain("chatBridge.sendMessage")
    expect(shell).not.toContain("useOpencodeTranscriptBridge")
    expect(bridge).toContain("sub-agent-${requestId}")
    expect(bridge).toContain("turn-subagent-${requestId}")
  })

  it("routes delegated global-agent transcripts through a global session context", () => {
    const bridge = readText("apps/desktop/src/renderer/src/features/chat/hooks/useOpencodeTranscriptBridge.ts")

    expect(bridge).toContain("const buildContextKeyForAgent = useCallback")
    expect(bridge).toContain("const isGlobalAgent = globalAgents.some((agent) => agent.id === agentId)")
    expect(bridge).toContain("isGlobal: isGlobalAgent")
    expect(bridge).toContain("const targetContextKey = buildContextKeyForAgent(event.toAgentId, event.teamId)")
  })
})
