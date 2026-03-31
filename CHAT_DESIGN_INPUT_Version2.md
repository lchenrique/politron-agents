# Sistema de Chat do Palot — Estrutura, Design e Input

---

## Códigos Fontes e Principais Arquivos

- [`apps/desktop/src/renderer/components/chat/chat-view.tsx`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/components/chat/chat-view.tsx)
- [`apps/desktop/src/renderer/components/chat/chat-input.tsx`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/components/chat/chat-input.tsx)
- [`packages/ui/src/components/ai-elements/prompt-input.tsx`](https://github.com/ItsWendell/palot/blob/main/packages/ui/src/components/ai-elements/prompt-input.tsx)
- [`apps/desktop/CHANGELOG.md`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/CHANGELOG.md) (evolução do design e features)

---

## Arquitetura geral do chat

- **chat-view.tsx** é o componente orquestrador do painel de chat [fonte](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/components/chat/chat-view.tsx).
- **chat-input.tsx** é o input de mensagem, comandos, menções e anexos [fonte](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/components/chat/chat-input.tsx).
- Usa `<PromptInput>` do design system próprio (`/packages/ui/src/components/ai-elements/prompt-input.tsx`).

---

## Principais features do input

- Multiline (`PromptInputTextarea`)
- Menções a agentes/arquivos (@)
- Comandos via "/" com popover autocompletar.
- Anexos nativos via file part (arquivos, imagens, pdf).
- Toolbar sensível (troca de agente, modelo, status)
- Persistência de draft automática entre sessões/chat.
- Utiliza hooks customizados para menções e slash commands.
- Tratamento de envio por função `handleSend`, validando draft, anexos, e comandos (ver [aqui](https://github.com/ItsWendell/palot/blob/main/apps/desktop/src/renderer/components/chat/chat-input.tsx#L209-L240)).

---

### Exemplo central do envio

```tsx
<PromptInput
  onSubmit={(message) => {
    if (message.text.trim() && isConnected && !sending)
      handleSend(message.text, message.files.length > 0 ? message.files : undefined)
  }}
>
  <ContextItems mentions={mentions} ... />
  {/* outros contextos */}
</PromptInput>
```

---

## Evolução do design

Veja no [`CHANGELOG.md`](https://github.com/ItsWendell/palot/blob/main/apps/desktop/CHANGELOG.md) vários refinamentos do UX, exemplo: [commit f7c84b5](https://github.com/ItsWendell/palot/commit/f7c84b5b4162824de5b4d31e860a6658f875e65e) separando e refatorando chat input, melhorias de toolbar, etc.

---

## Pastas/arquivos essenciais para estudar ou portar

- `/apps/desktop/src/renderer/components/chat/` — Quase tudo do chat principal, input, menções, toolbar, gerenciamento de drafts.
- `/packages/ui/src/components/ai-elements/` — Primitives de input, popovers, toolbars e etc.
- `/apps/desktop/CHANGELOG.md` — Mudanças e refactors importantes no UX do chat.

---
