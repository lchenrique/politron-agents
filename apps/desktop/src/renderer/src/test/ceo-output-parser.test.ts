// @vitest-environment node

import { describe, expect, it } from "vitest"

import { detectCommands, hasCommands, parseCeoOutput } from "../../../main/services/ceo-output-parser"

describe("parseCeoOutput", () => {
  it("extracts a staffing delegate command from a Tech Lead style response", () => {
    const output = `
Resumo da decisão:
O time precisa de um QA Engineer para elevar a cobertura de testes.

[DELEGATE]
team: SaaS
to: RH Global
task: Contratar um QA Engineer para o time SaaS com foco em testes automatizados e regressão
files: src/renderer/src/App.tsx
files: src/main/services/opencode-sdk.ts
    `.trim()

    const parsed = parseCeoOutput(output)

    expect(parsed.commands).toHaveLength(1)
    expect(parsed.commands[0]).toMatchObject({
      type: "DELEGATE",
      payload: {
        team: "SaaS",
        to: "RH Global",
        task: "Contratar um QA Engineer para o time SaaS com foco em testes automatizados e regressão",
        files: [
          "src/renderer/src/App.tsx",
          "src/main/services/opencode-sdk.ts",
        ],
      },
    })
    expect(parsed.remainingText).toBe(
      "Resumo da decisão:\nO time precisa de um QA Engineer para elevar a cobertura de testes."
    )
  })

  it("extracts a hire command from an HR response and preserves the visible text outside the command", () => {
    const output = `
Os pedidos de contratação foram aprovados.
[HIRE_AGENT] team: SaaS role: qa agentSlug: qa-tester
O RH seguirá monitorando a composição do time.
    `.trim()

    const parsed = parseCeoOutput(output)

    expect(parsed.commands).toHaveLength(1)
    expect(parsed.commands[0]).toMatchObject({
      type: "HIRE_AGENT",
      payload: {
        team: "SaaS",
        role: "qa",
        agentslug: "qa-tester",
      },
    })
    expect(parsed.remainingText).toBe(
      "Os pedidos de contratação foram aprovados.\nO RH seguirá monitorando a composição do time."
    )
  })

  it("extracts inline bracket commands with quoted params used by RH responses", () => {
    const output = `
Status: Aprovado. Seguindo com a alocação imediata.

[HIRE_AGENT team="Core Team" role="UI/UX Designer"]
    `.trim()

    const parsed = parseCeoOutput(output)

    expect(parsed.commands).toHaveLength(1)
    expect(parsed.commands[0]).toMatchObject({
      type: "HIRE_AGENT",
      payload: {
        team: "Core Team",
        role: "UI/UX Designer",
      },
    })
    expect(parsed.remainingText).toBe("Status: Aprovado. Seguindo com a alocação imediata.")
  })

  it("parses multiline delegate commands written in Portuguese without splitting on example markers", () => {
    const output = `
[DELEGATE]
Para: Tech Lead
Tarefa: Definir e me informar o desiredRole exato para esta vaga (ex: "Frontend Developer", "UI Engineer", "Frontend UI/UX Designer").
Justificativa: Clarificação obrigatória do escopo do papel para que eu possa acionar o comando de contratação com precisão.

Status: Em andamento (Bloqueado). Assim que você me retornar com o nome exato do cargo, executarei a contratação imediatamente.
    `.trim()

    const parsed = parseCeoOutput(output)

    expect(parsed.commands).toHaveLength(1)
    expect(parsed.commands[0]).toMatchObject({
      type: "DELEGATE",
      payload: {
        para: "Tech Lead",
        tarefa: 'Definir e me informar o desiredRole exato para esta vaga (ex: "Frontend Developer", "UI Engineer", "Frontend UI/UX Designer").',
        justificativa: "Clarificação obrigatória do escopo do papel para que eu possa acionar o comando de contratação com precisão.",
        status: "Em andamento (Bloqueado). Assim que você me retornar com o nome exato do cargo, executarei a contratação imediatamente.",
      },
    })
  })
})

describe("command detection helpers", () => {
  it("detects delegate and hire commands in the same output", () => {
    const output = `
[DELEGATE] team: SaaS to: RH Global task: Contratar QA
[HIRE_AGENT] team: SaaS role: qa agentSlug: qa-tester
    `.trim()

    expect(hasCommands(output)).toBe(true)
    expect(detectCommands(output)).toEqual(["DELEGATE", "HIRE_AGENT"])
  })

  it("ignores inline command examples mentioned in prose", () => {
    const output = `
O RH Global analisou a solicitação.
Para prosseguir, envie uma nova requisição estruturada contendo explicitamente o campo desiredRole preenchido para que eu possa executar o comando \`[HIRE_AGENT]\`. Aguardo o envio correto.
    `.trim()

    const parsed = parseCeoOutput(output)

    expect(parsed.commands).toHaveLength(0)
    expect(hasCommands(output)).toBe(false)
    expect(detectCommands(output)).toEqual([])
    expect(parsed.remainingText).toContain("[HIRE_AGENT]")
  })
})
