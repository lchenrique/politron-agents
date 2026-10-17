# Kokonut UI no Politron — análise de integração (17/10/2026)

## Regra arquitetural
- Reutilizar **visual e animações** de Kokonut, a semântica e as permissões pertencem ao Politron.
- Primitivos de formulário e acessibilidade devem continuar com **shadcn/ui**. Componentes Kokonut entram na camada `src/renderer/src/components/kokonutui/`; adaptadores ficam em `features/`.
- Todos os componentes integrados devem receber **dados reais/controlados**. Muitos usam dados DEMO se `props` são omitidas; **nunca** exibir exemplos de decisões, agentes, etapas ou citações na aplicação real.
- Respeitar `prefers-reduced-motion`, teclado, Electron, estados async e tela estreita.
- Preservar aparência **Poli/Pits**: não substituir os SVGs personalizados por avatar aleatório de rostos.
- Não duplicar controles de busca, escolha de modelos e de permissões.

## Auditoria do código atual
- `features/composer/Composer.tsx`: já importa Kokonut `ai-prompt.tsx`. Mantê-lo; conectar comandos `/` quando existirem ações reais.
- `features/chat/ChatHeader.tsx` e `features/composer/Composer.tsx`: ambos permitem escolher modelo; remover duplicação antes de adicionar `ai-model-selector`. Além disso, modelo pode funcionar como override dos agentes da sessão; esforço precisa ser sustentado pelo runtime, não só pela UI.
- `features/chat/MessageList.tsx`: apresenta `Approval` (write/browser/delegation/agent-change) e `FileChange` manualmente. Bom destino para adaptadores visuais.
- `features/diff/DiffCard.tsx` já reutiliza o diff real de `@pierre/diffs`. Não trocar renderizador funcional sem necessidade.
- `features/app/PoliCustomizer.tsx` mantém identidade e opções reais dos Pits. `Editor.tsx` salva `defaultAgentIds`, `agentIds`, fotos e personalizações.
- `src/shared/v9.ts`: `Approval` possui id/status/kind/details e `appAPI.respondApproval(id, approved)`. Não existe opção `always`/"não perguntar novamente"; não expô-la. `Message` não contém fontes estruturadas nem passos/tokens do modelo. `FileChange` já indica estado `applied`; API não fornece `reject/undo` por arquivo.

## Mapeamento dos 11 links

| Componente Kokonut | Decisão | Adaptação real para Politron |
|---|---|---|
| AI Tool Approval | **P1 integrar** | Criar `features/chat/PolitronToolApproval.tsx`. Transformar `Approval` em `ToolCall`; `onRespond(id, ok, always)` chama APENAS `window.appAPI.respondApproval(id, ok)`; não oferecer `always`. Respeitar `pending/approved/denied/interrupted`; confirmação extra para ações realmente destrutivas. Sem resposta otimista falsa. |
| AI Text Loading | **P1 integrar** | Estado de execução ao lado do Poli, com `messages.status`; usar texto curto e mínimo, sem afirmar fase de ferramenta que não foi emitida. |
| AI State Loading | **P1/P2 adaptar** | Criar `features/chat/RunProgress.tsx`; mapear `queued/running/waiting/completed/failed` e eventos reais. Para etapas detalhadas, adicionar tipos/eventos do runtime antes. Mostrar duração e atividade somente se medíveis. |
| AI Model Selector | **P1 avaliar substituição** | Substituir a escolha de modelo já existente, não adicionar terceira escolha. Adaptar `Model[]` para `ModelOption[]` reais e mapear esforço permitido por runtime/modelo. `src/shared/v9.ts` e `appAPI.send()` precisam suportar override de esforço se seleção por conversa for real. |
| AI Diff Review | **P2 visual / P3 ações** | Evoluir cards de `MessageList`; manter `@pierre/diffs`. Não exibir aceitar/rejeitar/desfazer com aparência funcional sem endpoints, transações, checkpoints e testes de rollback por arquivo. |
| AI Prompt | **já integrado** | `Composer.tsx` já usa. Integrar comandos `/` e anexos conforme opções reais; hoje `commands={[]}`. Centralizar escolha de modelo no Composer OU seletor contextual. |
| Avatar Picker | **P2 inspiração visual** | Reaproveitar interação flip/shuffle e transições como `PoliPresetPicker` com a lista real de variações de `PoliAvatar`; não usar o gerador de rostos do exemplo. Manter opção de upload existente. |
| Team Selector | **não integrar literalmente** | Este componente seleciona **quantidade de vagas** e pode mostrar preço, NÃO agentes individuais. Fazer `PoliTeamPicker` próprio com shadcn Command/Popover/Checkbox/Avatar, ids reais, grupos e sem preço. Se desejar etapa de quantidade, aproveitar só o contador. |
| AI Inline Citations | **P3 após dados** | Fonte de evidência precisa estar em mensagens/eventos do runtime. Adicionar `CitationSource` ou referências a arquivos/linhas reais; nunca criar chip/link fictício. |
| Scroll Index | **P3 opcional** | Rail para documentos/relatórios grandes com cabeçalhos, talvez painel de rastreio longo; não ocupar sidebar pequena ou chats normais. |
| Profile Dropdown | **P3 opcional / não prioritário** | Exemplo é menu de conta com troca, status, tema e logout. Electron atual não tem multi-conta. Considerar adaptação para preferências/identidade, sem inventar planos, perfis e logout. |

## Ordem sugerida
1. **PR 1 — Segurança/ação:** aprovação de ferramenta em um único componente controlado. Mapear `Approval` e manter `respondApproval` como única fonte da decisão. Testar aprovar/negar, aguardar resultado, erro, interrupção, repetição e ausência de autorização.
2. **PR 2 — Retorno visual:** indicadores de execução (`AI Text Loading` e `AI State Loading`) e estados do Poli. Exibir apenas etapas comprovadas; testar execução simultânea, erro, stop, chief delegando.
3. **PR 3 — Modelos:** remover redundância cabeçalho/Composer, adaptar `AI Model Selector` e seleção de esforço somente com capacidade real por modelo; não expor opções inviáveis.
4. **PR 4 — Editor/equipes:** `PoliPresetPicker` animado reutilizando o SVG real; `PoliTeamPicker` para IDs reais em workspaces e conversas, sem preço/vagas fictícias.
5. **PR 5 — Revisão e fontes:** redesenho dos diffs mantendo `@pierre/diffs`; ações de aceite/rollback apenas após backend suportar. Citações só após extração persistente de fontes.

## Regras de aceite
- `npm run typecheck`, `npx vitest run`, `npm run build`, `git diff --check` e testes específicos de permissão.
- Testes integrados com dados reais de aprovação/modelo/arquivo, não mocks estáticos da demo.
- QA visual no Electron em temas claro/escuro, largura 1000/1200px, com 1 e muitos agentes e `prefers-reduced-motion`.
- Nunca modificar a semântica dos `chiefManageTeam/chiefCreateSessions/approvalMode` sem testes de segurança.
- Preservar changes não comitadas; mudanças divididas por unidade funcional.

## Entrega inicial executada — 17/10/2026

**Implementado** nos arquivos do desktop:
- `components/kokonutui/ai-tool-approval.tsx`: adaptação MIT com pt-BR, status `approval-approved` / `approval-interrupted`, ações via shadcn/ui Button, sem opção "não perguntar novamente" e sem negar ao pressionar Esc. Requer segurar o botão para aprovar sobrescrita de arquivos e alteração de agentes.
- `features/chat/PolitronToolApproval.tsx`: converte `Approval` real em um `ToolCall` controlado e chama apenas `window.appAPI.respondApproval(id, approved)`; bloqueia duplo envio, mantém confirmação aguardando resposta do backend, permite tentar novamente após erro, mantém diff e propostas completas nos detalhes.
- `features/chat/MessageList.tsx`: renderiza o adaptador novo no lugar do bloco HTML anterior; mudanças de arquivo continuam usando `DiffCard`.
- `components/kokonutui/ai-loading.tsx`, `ai-text-loading.tsx` e `features/chat/RunProgress.tsx`: indicadores controlados pelo status real da mensagem; exibidos quando executando ou falhando, sem etapas fictícias. `MessageItem.tsx` integra o progresso ao Pit.
- `src/renderer/src/test/setup.ts`: mocks de compatibilidade do jsdom para animações; os componentes originais também foram adaptados à API de estilo do React 18.

**Testes:** suíte completa em 19 arquivos: 81 aprovados, 2 ignorados. Build de produção, typecheck, lint dos arquivos modificados e `git diff --check` passaram. Os testes novos cobrem aprovar, negar, erro da API, bloqueio de decisão repetida, status final, aprovação por retenção e estados reais da execução.

**Limitações conscientes:** o Politron ainda não fornece eventos detalhados de ferramentas/etapas, então o progresso é apenas por estado do turno, sem inventar etapas; a permissão permanente `always` não existe na API e foi removida da UI. Validar visualmente uma aprovação real em Electron quando aparecer uma solicitação pendente. Nada foi comitado.
