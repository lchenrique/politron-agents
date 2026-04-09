// @vitest-environment node

import { expect, it } from "vitest"
import { useSessionStore } from "../features/chat/store/sessionStore"

it("clears all persisted session state for every context", () => {
  useSessionStore.setState({
    sessions: [
      {
        agentId: "agent-1",
        role: "team-agent",
        status: "idle",
        session: { id: "session-1" },
      },
    ],
    activeSessionIdByContext: {
      "v2:project:team-1:agent-1": "session-1",
    },
    sessionIdsByContext: {
      "v2:project:team-1:agent-1": ["session-1"],
    },
  })

  useSessionStore.getState().clearAllSessionState()

  expect(useSessionStore.getState().sessions).toHaveLength(0)
  expect(useSessionStore.getState().activeSessionIdByContext).toEqual({})
  expect(useSessionStore.getState().sessionIdsByContext).toEqual({})
})
