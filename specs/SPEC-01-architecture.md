# SPEC-01 — Arquitetura geral

## Visão geral

O VibeIDE é uma aplicação desktop em monorepo com três contextos principais:

- **Main process**: Electron + Node.js. Responsável por IPC, integração com SDK, git, filesystem e persistência.
- **Preload**: ponte segura entre main e renderer.
- **Renderer**: React 19 + Vite 6 + TypeScript para UI.

## Stack mandatória

| Camada | Tecnologia |
|---|---|
| Desktop shell | Electron 40, electron-vite |
| Frontend | React 19, Vite 6, TypeScript |
| Styling | Tailwind CSS v4 |
| State | Jotai |
| Routing | TanStack Router |
| UI | shadcn/ui, Base UI, cmdk |
| Code highlighting | Shiki |
| Diff | @pierre/diffs |
| Virtualização | TanStack Virtual |
| AI | @opencode-ai/sdk |
| Monorepo | Turborepo + Bun workspaces |
| Lint | Biome |
| Packaging | electron-builder |
| Versionamento | Changesets |

## Modelo organizacional

- Existe **um CEO global** para toda a aplicação.
- O CEO global não pertence a um time específico.
- Cada time possui um **tech lead**.
- O tech lead gerencia o pipeline local do time.
- Não existe COO.

## Estrutura do monorepo

```txt
apps/
  desktop/
    src/
      main/
      preload/
      renderer/
packages/
  ui/
  shared/
  config/
```

## Responsabilidades por camada

### Main process

- Gerenciar a janela Electron
- Criar e manter clientes/sessões do `@opencode-ai/sdk`
- Operações de git e worktrees
- Locks de arquivos
- Persistência local em arquivos JSON tipados
- Expor tudo via IPC

### Preload

- Expor `window.vibeAPI`
- Não expor módulos Node diretamente

### Renderer

- Renderizar UI
- Gerenciar estado com Jotai
- Navegação com TanStack Router
- Não fazer I/O direto

## Organização do renderer

```txt
renderer/
  routes/
  atoms/
  features/
    workspace/
    teams/
    chat/
    pipeline/
    catalog/
  components/
  lib/
  styles/
```

## Estado global

O renderer deve concentrar estado em Jotai:

- `workspaceAtom`
- `activeTeamIdAtom`
- `activeChatAgentIdAtom`
- `pipelineStateFamily`
- `messagesFamily`
- `agentStatusFamily`

## Navegação

Rotas mínimas:

- `/` → workspace principal
- `/team/$teamId` → foco no time
- `/catalog` → catálogo de agentes
- `/settings` → configurações

## Persistência

Persistência local deve ficar no main process, em arquivos JSON versionados internamente pela aplicação.

Schema mínimo:

```ts
interface PersistedWorkspace {
  globalCeoAgentId: string | null
  activeTeamId: string | null
  teams: Team[]
  teamTemplates: TeamTemplate[]
  settings: WorkspaceSettings
}
```

## IPC

Padrão de nomes:

```txt
vibe:{domínio}:{ação}
```

Exemplos:

- `vibe:workspace:get`
- `vibe:teams:create`
- `vibe:teams:setTechLead`
- `vibe:ceo:send`
- `vibe:agent:send`
- `vibe:pipeline:get`
- `vibe:git:merge`

## Decisões fixas

1. `contextIsolation: true` sempre.
2. Toda integração com SDK fica no main process.
3. O renderer usa Jotai, não Zustand.
4. O app deve assumir CEO global + tech lead por time.
5. O layout é desktop-first, não página web genérica.
