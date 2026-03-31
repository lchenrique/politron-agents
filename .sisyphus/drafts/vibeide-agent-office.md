# Draft: Politron - Desktop Agent Office

## Entendimento do Projeto

### O que é
- GUI desktop para "escritório de agentes de IA"
- Arquitetura: CEO global + times com tech leads + agentes
- Baseado nas specs em `specs/` e `vibecoding-ide-prompt.md`

### Repositórios
- **Este repo (`politron`)**: specs, AGENT.md, documentação
- **desktop-delight**: frontend React com Vite 6 + React 19 (a clonar)

### Stack pretendida
- Desktop shell: Electron 40 + electron-vite
- Frontend: React 19 + Vite 6 + TypeScript (vem do desktop-delight)
- State: Jotai
- Routing: TanStack Router
- AI: @opencode-ai/sdk

### SDK do OpenCode - RESOLVIDO
- `createOpencode()` inicia servidor + cliente juntos automaticamente
- `server.close()` encerra
- Não precisa rodar servidor separado

## Plano de Ação
1. Clonar `desktop-delight` para `apps/desktop/src/renderer`
2. Criar estrutura Electron com electron-vite
3. Integrar SDK no main process
4. Configurar IPC entre main e renderer
5. Testar se o frontend React carrega no Electron

## Especificações de UI (do mockup)
- Layout: titlebar + sidebar (CEO/times) + workspace (chat) + terminal
- Status: running=verde, waiting=amarelo, idle=cinza, blocked=roxo, error=vermelho
- Comandos: context pills para anexar arquivo/URL