# Plano: feedback do chat sem Kokonut + achados do DeepSeek-Bot

Data: 17/10/2026. Documento de planejamento, sem alteração de código. Outra sessão está mexendo ao vivo em `RunProgress.tsx`, `PolitronToolApproval.tsx` e `Composer.tsx`; este plano é para aplicar quando essa sessão liberar esses arquivos, por mim ou por quem pegar a tarefa.

## 1. Por que trocar

O usuário não gosta do visual nem da sensação de performance dos componentes Kokonut usados hoje para dar feedback do que o bot está fazendo: `AILoadingState` (progresso de execução), `AIToolApproval` (aprovação de ferramenta) e o próprio `AI_Prompt` (composer). Eles não combinam com a linguagem visual do resto do Politron (shadcn simples, bordas finas, `border-border/60`, `bg-card/40`, sem efeitos de mola/spring chamativos).

Decisão confirmada pelo usuário: **tirar o botão de "manter pressionado para aprovar"** usado hoje em ações sensíveis (escrita de arquivo, mudança de configuração do Chief). Trocar por um clique normal com uma confirmação extra simples.

Escopo desta troca: **feedback do chat** (`RunProgress.tsx`, `PolitronToolApproval.tsx`). O `Composer.tsx` (`AI_Prompt`) fica de fora por enquanto — outra sessão está adicionando voz e chamada ao vivo nele; trocar de biblioteca no meio dessa obra é risco alto. Ao final deste documento há recomendações pontuais de estilo para aproximar o visual do `AI_Prompt` do resto do app sem trocar a lib.

## 2. Estado atual (para quem for implementar, ler o código antes de mexer — ele muda rápido)

- `RunProgress.tsx`: usa `AILoadingState` (`@/components/kokonutui/ai-loading`) para mostrar "{agente} está respondendo" (`running`) ou "Execução falhou" (`failed`); sem renderização em `completed`/`queued`/`waiting`/`interrupted`.
- `PolitronToolApproval.tsx`: usa `AIToolApproval` (`@/components/kokonutui/ai-tool-approval`). Mapeia `Approval.status` (`pending`/`approved`/`denied`/`interrupted`) para o enum interno do Kokonut (`approval-requested`/`approval-approved`/`output-denied`/`approval-interrupted`), com um estado extra local `submitting` → `approval-responded` enquanto aguarda o backend confirmar. `sensitive` (escrita com conteúdo anterior, mudança do Chief, comando) ativa o modo destrutivo do Kokonut, que hoje pede manter pressionado.
- Testes existentes (`PolitronToolApproval.test.tsx`) fixam o contrato observável, que deve ser preservado na troca:
  - `role="region"` com nome "Aprovação de ferramenta"; `role="status"` com o texto da fase ("Aguardando sua decisão", "Enviando sua decisão…", "Aprovada", "Negada", "Interrompida").
  - Botões "Aprovar" e "Negar" para casos não sensíveis.
  - Um envio não pode duplicar a chamada a `window.appAPI.respondApproval`, mesmo clicando de novo durante a animação de saída.
  - Erro do backend libera nova tentativa (volta pro estado "Aguardando sua decisão").
  - Caso sensível mostra "Confirmação adicional obrigatória" antes de decidir — **isso muda nesta troca**: sai o botão "Mantenha pressionado para aprovar", entra um fluxo de dois cliques (ver seção 3). Os testes precisam ser reescritos para o novo gesto, não só adaptados.

## 3. Desenho novo, feito à mão (shadcn, sem Kokonut)

### RunProgress → vira uma linha de status compacta
Sem card nem animação de "loading state" genérica. Uma linha pequena, com um indicador vivo só quando `running`:

```tsx
{status === 'running' && <p role="status" className="my-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
  <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
  {agentName} está respondendo…
</p>}
{status === 'failed' && <p role="status" className="my-1.5 text-xs text-destructive">Execução falhou</p>}
```

Sem biblioteca externa: um `<span>` com `animate-pulse` (Tailwind puro) substitui a animação do Kokonut. Mantém o mesmo papel semântico (`role="status"`) para não quebrar leitores de tela nem os testes que já verificam esse texto.

### PolitronToolApproval → cartão simples com dois cliques para ações sensíveis

Estrutura:
```
[ícone da categoria]  Título da proposta                    [estado]
  detalhe principal (arquivo, comando, destinatário)
  <diff ou JSON da proposta, já existentes, sem mudar>
  ———
  [Negar]                                   [Aprovar]   ← não sensível
  [Negar]                        [Confirmar e aprovar]  ← sensível, 1º clique
                                   "Tem certeza? [Aprovar mesmo assim]"  ← sensível, 2º clique
```

Regras:
- Card com `rounded-lg border border-border/60 bg-card/40 p-3`, igual ao resto do chat — sem o preenchimento colorido/ícone animado do Kokonut.
- Não sensível: `Button variant="outline"` (Negar) + `Button` (Aprovar), lado a lado, clique único.
- Sensível: primeiro clique em "Confirmar e aprovar" troca o próprio botão para "Aprovar mesmo assim" com `variant="destructive"` por ~4s (ou até focar fora), exibindo a frase "Confirmação adicional obrigatória" ao lado — reaproveita o texto que o teste atual já espera. Segundo clique dentro da janela aprova de fato. Sem long-press, sem depender de tempo de pressão do mouse.
- Mantém `role="region"` + nome "Aprovação de ferramenta", `role="status"` com as mesmas cinco frases de fase, e a trava síncrona (`lock.current`) que já existe para não duplicar o envio.
- Reaproveitar sem mudar: `DiffCard`, o `<details>` de tarefa/instruções, o `<details>` de configuração completa, o aviso de truncamento.

### Testes a reescrever
Substituir só o último teste do arquivo (`exige pressionamento prolongado...`) por um fluxo de dois cliques: clicar em "Confirmar e aprovar" não chama `respondApproval`; mostra "Confirmação adicional obrigatória" e o botão vira "Aprovar mesmo assim"; clicar nele chama `respondApproval(id, true)` uma vez. Os outros três testes (fluxo normal, negar, retry após erro) continuam válidos como estão, porque usam o caminho não sensível.

## 4. Recomendações para o Composer (`AI_Prompt`), sem trocar de lib agora

Não mexer na lib enquanto a voz/chamada estiver em obra, mas dá pra aproximar o visual com ajustes de estilo, quando a outra sessão liberar o arquivo:
- Reduzir a amplitude das transições de entrada/saída do Kokonut (`motion`/`framer-motion`) via `transition={{ duration: .12 }}` nos pontos de uso, em vez do padrão da lib, para combinar com a ausência de "mola" no resto do app.
- Alinhar cores do seletor de modelo/esforço e dos badges a `text-muted-foreground`/`border-border/60` em vez das cores default do Kokonut.
- Se depois de alinhar estilo o desconforto continuar (ex.: performance real, não só estética), avaliar nessa hora migrar só o miolo de texto para um `Textarea` próprio com auto-resize manual (poucas linhas de código, sem framer-motion), mantendo separados os botões de modelo/esforço/voz que a outra sessão já construiu.

## 5. DeepSeek-Bot (github.com/Fei2411/DeepSeek-Bot) — o que vale aproveitar

Pesquisa só de leitura, licença Apache 2.0 (reuso permitido com atribuição). Não é um bot standalone: é um **plugin para o DeepSeek Harness (DSH)**, um app agêntico parecido com Codex/Claude Code, agnóstico de provedor de modelo. Não dá pra copiar código literalmente (depende de `@deepseek-ai/dsh-llm`/`dsh-tools`), mas três ideias valem a pena:

1. **Grupo como log com cursor por bot** (`groups.js`): cada participante tem um cursor de "até onde já viu"; ao responder, só recebe o delta de mensagens novas (janela configurável), não o histórico inteiro de novo a cada turno. Isso já está alinhado com `PLANO_CHAT_GRUPOS_CONTEXTO.md` do Politron — vale conferir se aquele plano já cobre isso ou se dá pra copiar a ideia do cursor por participante.
2. **Parser de @menção único e compartilhado** entre o lado que decide quem responde e o lado que destaca visualmente a menção na UI, evitando que os dois divirjam com o tempo. Vale auditar se `routing.ts`/`mentionedRecipients` do Politron e a UI do composer/mensagens já usam a mesma função para isso ou se há duas implementações.
3. **"Switch vs compact" do `steward.js`**: perto do limite de contexto, uma chamada de LLM separada decide se é melhor abrir uma sessão nova com uma nota de handoff (`switch`) ou resumir a conversa no lugar (`compact`), julgando se o trabalho chegou a um ponto de parada natural — não só olhando tamanho em tokens. O prompt de checkpoint deles exige preservar identificadores exatos e tratar texto vindo de resultado de ferramenta como dado, nunca como instrução — boa referência de engenharia de prompt para quando o Politron precisar resumir conversas longas.

Risco: projeto jovem (v0.1 preview), não inflar a maturidade do que existe lá. As constantes de janela/cursor são calibradas pro caso deles; não copiar os números sem recalibrar para os runtimes do Politron (Codex/Claude).
