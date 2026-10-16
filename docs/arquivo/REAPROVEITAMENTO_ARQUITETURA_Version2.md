# Reaproveitamento arquitetural do Palot para sistemas multi-agentes "office"

---

## 1. Monorepo Moderno  
**Fonte:** [`AGENTS.md`](https://github.com/ItsWendell/palot/blob/main/AGENTS.md)

- Estrutura baseada em **Turborepo + Bun workspaces**:
    ```
    - Monorepo: Turborepo + Bun workspaces (Bun 1.3.8)
    - packages/ui: Shared shadcn/ui component library (@palot/ui)
    - packages/configconv: Universal agent config converter library (@palot/configconv)
    - apps/desktop: Electron 40 + Vite + React 19 desktop app
    - apps/server: Bun + Hono backend
    ```
- **Caminho chave:**  
  `/apps/desktop/`, `/packages/ui/`, `/packages/configconv/`, `/apps/server/`

---

## 2. Sistema de agentes flexível  
**Fontes:**  
- [`apps/desktop/src/renderer/lib/types.ts`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/lib/types.ts)
- [`apps/desktop/src/renderer/lib/mock-data.ts`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/lib/mock-data.ts)

- Modelos típicos:
    ```typescript
    export interface Agent {
      id: string
      name: string
      status: AgentStatus
      environment: EnvironmentType
      project: string
      // ...
    }
    ```
- Mock fácil de adaptar (`MOCK_AGENTS`).

---

## 3. Componentes UI Genéricos  
**Fonte:** [`packages/ui/src/components/ai-elements/`](https://github.com/ItsWendell/palot/tree/main/packages/ui/src/components/ai-elements)

- Exemplo:
    ```tsx
    // packages/ui/src/components/ai-elements/agent.tsx
    export const Agent = memo(({ className, ...props }: AgentProps) => (
      <div className={cn("not-prose w-full rounded-md border", className)} {...props} />
    ))
    ```

---

## 4. Pipeline/Orquestração e Tipos  
**Fonte:** [`apps/desktop/src/renderer/lib/types.ts`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/lib/types.ts)

- Tipagem para projetos, atividades, workflow:
    ```typescript
    export interface Activity { id: string; timestamp: string; type: "read"|"edit"|...; description: string; }
    export interface ProjectInfo { id: string; name: string; directory: string; agentCount: number; }
    ```

---

## 5. Boas práticas frontend  
**Fonte:** [`AGENTS.md`](https://github.com/ItsWendell/palot/blob/main/AGENTS.md)

- Uso de **Jotai** para estado global; hooks para abstração:
    ```
    - State: Jotai atoms (NOT Zustand)
    - Thin hook wrappers around atoms (ex: useAgents())
    - Functional components only, no class components.
    ```

---

## 6. Camada de configuração universal  
**Fonte:**  
[`packages/configconv/src/converter/from-canonical/to-opencode.ts`](https://github.com/ItsWendell/palot/blob/main/packages/configconv/src/converter/from-canonical/to-opencode.ts)

- Ferramenta para converter perfis de agentes entre formatos.

---

## 7. Execução e aprovação  
**Fonte:** [`apps/desktop/src/preload/api.d.ts`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/preload/api.d.ts)

    ```typescript
    export interface ExecutionConfig {
      model?: string; agent?: string; variant?: string;
      effort: "low"|"medium"|"high";
      timeout: number; retries: number;
      parallelWorkspaces: boolean;
      approvalPolicy: "never"|"auto-edit";
      //...
    }
    ```

---

## 8. Sistema de chat e painel multi-agente  
**Fonte:**  
- [`apps/desktop/src/renderer/components/chat/`](https://github.com/ItsWendell/palot/tree/main/apps/desktop/src/renderer/components/chat/)
- [`apps/desktop/src/renderer/lib/types.ts`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/lib/types.ts)

- Modelo flexível para exibir/conectar agentes e sessões (pode reaproveitar a estrutura adaptando contexto/ícones/etc).

---

## O que adaptar

- Trocar nomes de agentes/tarefas para funções de escritório.
- Ajustar detalhes de workflow, integrações e status.
- Substituir lógica de código por manipulação de arquivos office, aprovações humanas, etc.
