# Politron - Electron + Frontend Integration Plan

## TL;DR

> **Objetivo**: Criar aplicação desktop Electron conectando ao frontend React existente em `apps/desktop/src/renderer`
> 
> **Entregas**: App Electron rodando com o frontend carregado, titlebar customizada, IPC básico
> 
> **Esforço**: Médio
> **Execução Paralela**: NÃO - sequencial (dependências)

---

## Contexto

### O que existe
- Frontend React em `apps/desktop/src/renderer` (clonado do desktop-delight)
- Specs e documentação em `specs/`, `AGENT.md`, `vibecoding-ide-prompt.md`
- Mockup visual em `vibecoding_ide_mockup.html`

### O que precisa ser feito
1. Criar estrutura Electron com electron-vite
2. Conectar o frontend React existente ao Electron
3. Criar titlebar customizada (frameless window)
4. Configurar IPC básico (main ↔ renderer)
5. Testar se o app inicia

### SDK do OpenCode
- `createOpencode()` inicia servidor + cliente automaticamente
- Não precisa rodar servidor separado
- Será integrado no main process depois

---

## Work Objectives

### Objetivo Principal
Desktop app Politron com Electron + React, mostrando a UI do "escritório de agentes"

### Entregas Concretas
- [ ] `apps/desktop/` com electron-vite configurado
- [ ] Main process com janela frameless e titlebar
- [ ] Preload script com API exposta
- [ ] Frontend React carregando no renderer
- [ ] App iniciando sem erros

---

## Excluded from Scope (Guardrails)
- NÃO criar monorepo Turborepo agora (depois)
- NÃO integrar SDK do opencode ainda (só o scaffold)
- NÃO criar lógica de agentes/times/pipeline (só UI mockada existe)
- NÃO mudar React Router → TanStack Router agora
- NÃO mudar Context → Jotai ainda
- NÃO atualizar React 18 → 19, Vite 5 → 6

---

## Execution Strategy

### Estrutura alvo
```
apps/
  desktop/
    electron.vite.config.ts
    package.json
    src/
      main/
        index.ts          # Electron main process
        ipc/
          handlers.ts      # IPC handlers
        services/
          opencode-sdk.ts  # Placeholder (vazio por enquanto)
        windows/
          manager.ts       # Window management
      preload/
        index.ts           # Preload script
      renderer/           # <-- JA EXISTE (desktop-delight)
        src/
        package.json
        vite.config.ts
```

### Dependências
```
apps/desktop/src/main → apps/desktop/src/preload → apps/desktop/src/renderer
```

---

## TODOs

- [x] 1. Criar `apps/desktop/package.json` com electron-vite e dependências

  **What to do**:
  - Criar package.json com electron 40, electron-vite, @electron-toolkit/utils
  - Dependências: electron, electron-vite, typescript, @types/node
  - Scripts: dev (electron-vite dev), build (electron-vite build)

  **References**:
  - `apps/desktop/src/renderer/package.json` - dependências existentes

  **Acceptance Criteria**:
  - [ ] `ls apps/desktop/package.json` existe
  - [ ] `npm install` em apps/desktop/ funciona

- [x] 2. Criar `apps/desktop/electron.vite.config.ts`

  **What to do**:
  - Configurar electron-vite para usar renderer de `src/renderer`
  - Pointer para o renderer já existente
  - Configurar preload

  **References**:
  - electron-vite docs para estrutura de config

  **Acceptance Criteria**:
  - [ ] arquivo existe
  - [ ] config aponta para src/renderer

- [x] 3. Criar `apps/desktop/tsconfig.json` e `tsconfig.node.json`

  **What to do**:
  - tsconfig.json para main e preload (Node)
  - Herdar do renderer quando possível

  **Acceptance Criteria**:
  - [ ] arquivos existem e são válidos

- [x] 4. Criar `apps/desktop/src/main/index.ts` (main process)

  **What to do**:
  - Criar janela BrowserWindow frameless
  - Window com 1200x800 default
  - Carregar URL do renderer (desenvolvimento)
  - Titlebar customizada via HTML (não native)
  - Gerenciar ciclo de vida da janela

  **References**:
  - SPEC-01-architecture.md - responsabilidades do main process
  - `vibecoding_ide_mockup.html:62-147` - пример titlebar

  **Acceptance Criteria**:
  - [ ] Main process cria janela frameless
  - [ ] TitleBar visual no renderer (não native)

- [x] 5. Criar `apps/desktop/src/main/windows/manager.ts`

  **What to do**:
  - Helper para criar janelas
  - Store de janelas abertas
  - Métodos: createMainWindow, closeWindow, minimize, maximize

  **Acceptance Criteria**:
  - [ ] Função createMainWindow retorna BrowserWindow
  - [ ] Suporta minimize/maximize/close via IPC

- [x] 6. Criar `apps/desktop/src/main/ipc/handlers.ts`

  **What to do**:
  - Handlers IPC básicos para window controls
  - `vibe:window:minimize`
  - `vibe:window:maximize`
  - `vibe:window:close`

  **References**:
  - SPEC-01-architecture.md - padrão de nomenclatura IPC

  **Acceptance Criteria**:
  - [ ] handlers registrados
  - [ ] IPC channels seguem padrão vibe:domain:action

- [x] 7. Criar `apps/desktop/src/main/services/opencode-sdk.ts` (placeholder)

  **What to do**:
  - Criar arquivo vazio com exportsplaceholder
  - Estrutura para depois integrar SDK

  **Acceptance Criteria**:
  - [ ] Arquivo existe com estrutura básica

- [x] 8. Criar `apps/desktop/src/preload/index.ts`

  **What to do**:
  - Expor `window.vibeAPI` com:
    - windowControls: { minimize, maximize, close }
    - Platform info
  - Usar contextBridge

  **References**:
  - SPEC-01-architecture.md - "Expor window.vibeAPI"

  **Acceptance Criteria**:
  - [ ] window.vibeAPI disponível no renderer
  - [ ] contextIsolation: true

- [x] 9. Ajustar `apps/desktop/src/renderer/` para Electron

  **What to do**:
  - Verificar se vite.config.ts precisa de ajuste para base URL
  - Garantir que index.html carrega
  - Remover .git do renderer (já está no politron)

  **References**:
  - `apps/desktop/src/renderer/vite.config.ts` - config atual

  **Acceptance Criteria**:
  - [x] Renderer compila sem erros
  - [ ] HTML carrega no Electron

- [x] 10. Criar script de build e start

  **What to do**:
  - package.json com scripts npm run dev, npm run build
  - Verificar se electron-vite dev funciona

  **Acceptance Criteria**:
  - [x] `npm run dev` na raiz abre o app
  - [x] App mostra a UI do IDE

  **Fixes Applied**:
  - CSS fix: `@apply border-border` → `border-color: hsl(var(--border))`
  - CSS fix: `@apply bg-background text-foreground` → `background-color: hsl(var(--background)); color: hsl(var(--foreground))`
  - Alias fix: Added `@` alias in electron.vite.config.ts renderer.resolve.alias
  - Main field: Added `"main": "out/main/index.js"` to package.json

---

## Verification Strategy

### Test Commands
```bash
cd apps/desktop && npm install && npm run dev
```

### Success Criteria
- [ ] App Electron abre
- [ ] Window frameless com titlebar customizada aparece
- [ ] UI do "escritório de agentes" carrega
- [ ] Traffic lights (red/yellow/green) funcionam
- [ ] Não há erros no console do devtools

---

## Final Verification Wave

- [x] F1. **Build Test** — Executar `npm run build` e verificar que compila sem erros
- [x] F2. **Dev Test** — Executar `npm run dev` e confirmar que app abre
- [x] F3. **UI Test** — Verificar que a UI mockada aparece corretamente

---

## Commit Strategy

**Commit 1**: `feat(desktop): scaffold electron with electron-vite`
  - Arquivos: package.json, electron.vite.config.ts, tsconfigs
  - Pre-commit: none

**Commit 2**: `feat(desktop): main process with frameless window`
  - Arquivos: main/index.ts, windows/manager.ts
  - Pre-commit: none

**Commit 3**: `feat(desktop): preload script with vibeAPI`
  - Arquivos: preload/index.ts, main/ipc/handlers.ts
  - Pre-commit: none

**Commit 4**: `feat(desktop): connect renderer and verify app opens`
  - Arquivos: ajustes em renderer
  - Pre-commit: none

---

## Success Criteria

1. `npm run dev` na pasta `apps/desktop` inicia o app
2. Janela abre com aspect ratio de desktop app
3. TitleBar customizada visível com traffic lights
4. UI do IDE (sidebar, chat, terminal) renderiza
5. Nenhum erro crítico no terminal ou devtools
6. App fecha corretamente com botão X

---

## Next Phases (NOT in this plan)

- Integrar @opencode-ai/sdk no main process
- Configurar Turborepo monorepo
- Migrar React Router → TanStack Router
- Migrar Context → Jotai
- Implementar sessões de agentes via SDK
- Implementar pipeline e teams reais
