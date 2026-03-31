# AGENT.md — Instruções do projeto

## Objetivo

Este repositório documenta e guia a construção do **VibeIDE**.
Ao trabalhar aqui, preserve a consistência entre `AGENT.md`, `vibecoding-ide-prompt.md` e a pasta `specs/`.

## Regras invariáveis

- O app usa **`@opencode-ai/sdk`** como integração principal com OpenCode.
- Sempre preferir tipos de **`@opencode-ai/sdk/v2/client`**.
- Existe **um único CEO global**.
- Cada time tem um **tech lead**.
- **Não existe COO**.
- O estado no frontend é **Jotai**, não Zustand.
- O frontend usa **React 19 + Vite 6 + TypeScript**.
- O styling usa **Tailwind CSS v4**.
- A navegação usa **TanStack Router**.
- O monorepo usa **Turborepo + Bun workspaces**.

## Stack oficial

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40, electron-vite |
| Frontend | React 19, Vite 6, TypeScript |
| Styling | Tailwind CSS v4 |
| State | Jotai |
| Routing | TanStack Router |
| UI components | shadcn/ui, Base UI, cmdk |
| Code highlighting | Shiki |
| Diff rendering | @pierre/diffs |
| Virtualization | TanStack Virtual |
| AI integration | @opencode-ai/sdk |
| Monorepo | Turborepo + Bun workspaces |
| Linting | Biome |
| Packaging | electron-builder |
| Versioning | Changesets |

## Organização do produto

### CEO global

- Coordena a execução entre times
- Consolida contexto e prioridades
- Não atua como líder de um time específico

### Tech lead do time

- Coordena os agentes do próprio time
- Gerencia o pipeline local
- Aprova merges do time

## Diretrizes para specs e documentação

- Se uma spec mencionar `ceoAgentId` em `Team`, substitua por `techLeadAgentId`
- Se um texto sugerir um CEO por time, corrija para CEO global + tech lead local
- Não reintroduza `spawn("opencode")` como caminho principal de integração
- Evite adicionar tecnologias fora da stack oficial sem necessidade clara

## Estrutura alvo

```txt
apps/
  desktop/
packages/
  ui/
  shared/
  config/
```

## Notas de implementação

- O serviço do SDK deve ficar no main process do Electron
- O renderer conversa com o main via preload + IPC tipado
- Diff inline é parte central da experiência
- O CEO global deve ser uma superfície permanente da UI

## Regra editorial

- Salvar arquivos texto sempre em UTF-8
- Preservar acentos corretamente
- Corrigir imediatamente qualquer mojibake encontrado
