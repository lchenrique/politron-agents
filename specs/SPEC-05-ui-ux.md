# SPEC-05 — UI/UX

## Layout geral

Aplicação desktop com três áreas principais:

```txt
┌──────────────────────────────────────────────────────────────┐
│ VibeIDE · [CEO Global] · [Time ativo]            [_][□][×] │
├──────────────┬───────────────────────────────────┬──────────┤
│ Sidebar      │ Workspace                         │ Sidepanel│
│              │                                   │          │
│ CEO Global   │ [CEO][Lead][FE][BE][QA]          │ Logs     │
│ Times        │                                   │ Pipeline │
│ Agentes      │ Chat / Diff / Contexto            │ Terminal │
│ Projeto      │                                   │          │
└──────────────┴───────────────────────────────────┴──────────┘
```

## Princípios

- Visual de app desktop, não dashboard genérico
- CEO global sempre visível
- Tech lead aparece como líder do time ativo
- Estado e prioridade precisam ser entendidos sem abrir código

## Stack de UI

- Tailwind CSS v4
- shadcn/ui
- Base UI
- cmdk
- Shiki
- `@pierre/diffs`
- TanStack Virtual

## Sidebar

A sidebar deve ter esta ordem:

1. card do CEO global
2. seletor de time
3. lista de agentes do time ativo
4. resumo do projeto
5. ações rápidas

## Tabs do workspace

As tabs devem seguir esta regra:

- primeira tab fixa: **CEO**
- segunda tab sugerida: **Tech Lead**
- depois: agentes do time ativo

O CEO é global.
O tech lead é contextual ao time ativo.

## Status visuais

```txt
running = verde
idle = cinza
waiting = amarelo
blocked = roxo
error = vermelho
done = azul
```

## Diff inline

Diff deve aparecer na própria conversa usando `@pierre/diffs`.
Quando houver snippets ou blocos de código explicativos, usar Shiki.

## Virtualização

Usar TanStack Virtual para:

- lista de mensagens
- lista de logs
- catálogo de agentes
- listas longas de tasks

## Componentes importantes

- `GlobalCeoCard`
- `TeamSelector`
- `AgentList`
- `ChatTabs`
- `MessageList`
- `DiffPanel`
- `PipelineView`
- `ActivityPanel`
- `CommandPalette`

## Command palette

Usar `cmdk` para:

- trocar time
- abrir chat de agente
- contratar agente
- iniciar task
- abrir configurações

## Experiências críticas

### Quando o CEO global precisa do usuário

- badge na tab do CEO
- toast
- destaque visual no card do CEO

### Quando o tech lead precisa do usuário

- badge na tab do lead
- destaque no time ativo

### Quando há lock de arquivo

- mostrar quem está editando
- indicar conflito antes do dispatch

## Decisões fixas

1. CEO global sempre visível.
2. O time mostra tech lead, não CEO local.
3. Diff inline é obrigatório.
4. O código não é a superfície principal do produto.
