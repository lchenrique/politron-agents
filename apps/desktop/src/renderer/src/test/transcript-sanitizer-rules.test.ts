// @vitest-environment node

import { readFileSync } from "fs"
import { describe, expect, it } from "vitest"

const root = "D:/projetos pessoais/politron"

function readText(relativePath: string): string {
  return readFileSync(`${root}/${relativePath}`, "utf8")
}

describe("transcript sanitizer rules", () => {
  it("removes dangling markdown left before stripped command blocks", () => {
    const bridge = readText("apps/desktop/src/renderer/src/features/chat/hooks/useOpencodeTranscriptBridge.ts")

    expect(bridge).toContain("const trimDanglingMarkdownSuffix = (value: string)")
    expect(bridge).toContain(".replace(/\\s*(\\*\\*|__|`)+\\s*$/g, '')")
    expect(bridge).toContain("return trimDanglingMarkdownSuffix(stripLeakedReasoning(text.slice(0, firstMarker)));")
  })

  it("strips leaked internal planning text before user-facing Portuguese headings", () => {
    const bridge = readText("apps/desktop/src/renderer/src/features/chat/hooks/useOpencodeTranscriptBridge.ts")

    expect(bridge).toContain("const stripLeakedReasoning = (value: string)")
    expect(bridge).toContain("value.search(/\\bPasso conclu[ií]do\\b/i)")
    expect(bridge).toContain("value.search(/\\bThe user wants us\\b/i)")
    expect(bridge).toContain("value.search(/\\bContexto\\b/i)")
    expect(bridge).toContain("return trimDanglingMarkdownSuffix(stripLeakedReasoning(text.slice(0, firstMarker)));")
  })

  it("sanitizes the buffered streaming text before appending deltas to the transcript", () => {
    const bridge = readText("apps/desktop/src/renderer/src/features/chat/hooks/useOpencodeTranscriptBridge.ts")

    expect(bridge).toContain("const sanitizedBufferedText = stripCommandMarkupFromTranscript(bufferedText)")
    expect(bridge).toContain("if (sanitizedBufferedText === previousTotalFlushed) return;")
    expect(bridge).toContain("const blockBufferedText = sanitizedBufferedText.slice(offsetInTurn);")
    expect(bridge).toContain("runtime.lastFlushedTextByAgent.set(agentId, sanitizedBufferedText);")
  })
})
