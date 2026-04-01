# PaperclipAI Analysis - Ideas for Politron

## What is PaperclipAI?
Open-source orchestration for AI-agent companies. 42K stars on GitHub.
- **If OpenClaw is an employee, Paperclip is the company**
- Similar concept to what we're building with Politron

## PaperclipAI Core Concepts

### 1. Heartbeat System
Agents "wake up" on a schedule, check work, and act.

```typescript
// Wakeup types:
- "timer" → scheduled heartbeat
- "assignment" → task assigned
- "on_demand" → manual trigger
- "automation" → event-triggered

// Session compaction:
- maxSessionRuns: rotate after N executions
- maxRawInputTokens: rotate after consuming X tokens
- maxSessionAgeHours: rotate after X hours
```

**Relevance**: We could implement periodic agent wakeups to check for new tasks.

### 2. Budget/Cost Control
Layered budgets: company → agent → project

```typescript
Budget Policy:
- amount (cents)
- warnPercent (default 80%) → soft alert
- hardStopEnabled → auto-pause when exceeded

When limit hit:
1. Pause agent/company/project
2. Cancel work in progress
3. Create BudgetIncident
4. Can create ApprovalRequest for board approval
```

**Relevance**: MASSIVE for preventing runaway costs.

### 3. Data Model
```
companies (root)
├── goals (hierarchy: company → team → agent → task)
├── agents (org tree via reports_to)
│   ├── adapter_type: process | http
│   ├── budget_monthly_cents
│   └── last_heartbeat_at
├── projects
├── issues (tasks with atomic checkout)
│   ├── status: backlog → todo → in_progress → in_review → done
│   └── single assignee (atomic checkout)
├── heartbeat_runs
├── cost_events (token tracking)
├── approvals (hire/strategy/budget)
├── activity_log (audit trail)
└── company_secrets
```

### 4. Atomic Task Checkout
```typescript
// Server-side SQL atomic:
UPDATE issues 
SET assignee_agent_id = ?, status = 'in_progress', started_at = NOW()
WHERE id = ? 
  AND status IN ('todo', 'backlog', 'blocked')
  AND (assignee_agent_id IS NULL OR assignee_agent_id = ?)

// If row count = 0 → 409 Conflict
```
**Relevance**: Prevents two agents from grabbing the same task.

### 5. Auth Pattern
```
Board (human):
- Session-based auth
- Full read/write in entire company
- Approves hires, strategies, budget overrides

Agent:
- Bearer API key (hashed at rest)
- Scope: only own company
- Read: org/tasks/company context
- Write: own tasks, comments
- Report: heartbeat status, cost events
```

## Features We Have vs What's Missing

### We Have ✅
- Teams with agents
- Pipeline tasks
- Chat/Thread per agent
- Workspace context

### Missing ❌
| Feature | Complexity | Priority |
|---------|-----------|----------|
| **Heartbeat Scheduler** | High | ⭐⭐⭐ |
| **Budget/Cost Control** | High | ⭐⭐⭐ |
| **Atomic Task Checkout** | Medium | ⭐⭐⭐ |
| **Activity Audit Log** | Medium | ⭐⭐ |
| **Secret Management** | High | ⭐⭐ |
| **Session Compaction** | High | ⭐ |
| **Approval Workflows** | Medium | ⭐⭐ |

## TODOs for Politron

### High Priority
1. [ ] Budget enforcement (cost per agent per month)
2. [ ] Atomic task checkout to prevent double-assignment
3. [ ] Kanban board for agent tasks
4. [ ] Fix duplicate agent balloon UI bug

### Medium Priority
5. [ ] Activity audit log
6. [ ] HR agent template for hiring
7. [ ] CEO can hire agents when requested

### Low Priority
8. [ ] Heartbeat scheduler (periodic agent wakeups)
9. [ ] Session compaction
10. [ ] Approval workflows

## Relevant Code Files in PaperclipAI

- `server/src/services/heartbeat.ts` - Heartbeat orchestration
- `server/src/services/budgets.ts` - Budget enforcement
- `server/src/services/issues.ts` - Atomic checkout
- `server/src/services/activity-log.ts` - Audit trail
- `doc/SPEC-implementation.md` - Full spec (874 lines)

## References
- PaperclipAI: https://github.com/paperclipai/paperclip
- Docs: https://paperclip.ing/docs
