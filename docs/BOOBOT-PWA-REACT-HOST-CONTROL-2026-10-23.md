# Boobot — PWA com identidade Electron e comandos de host

Data: 23/10/2026

## Direção de arquitetura — comparação com Orca

O repositório MIT https://github.com/stablyai/orca foi revisado, especificamente seu `vite.web.config.ts`, que usa um build web independente do renderer Electron com componentes React, alias e Tailwind compartilhados. Seu conceito Remote Orca Servers mantém os agentes, repositórios, terminais e sessões no host e transmite a interface/comandos a clientes privados, preferencialmente em uma rede Tailscale.

**No Boobot**, a PWA anterior (`src/main/pwa/assets/main.js` + `index.html` + `styles.css`) era um segundo aplicativo visual desconectado. A implementação foi **removida** e substituída por `src/renderer/pwa.html` e `src/renderer/src/pwa/main.tsx`, empacotados pelo `vite.pwa.config.mts`. As mesmas definições de Tailwind, tokens de cor e os componentes originais `PoliAvatar` / `BooAccessories` agora aparecem no desktop web e no celular. O logo vem do próprio `src/renderer/public/boobot-mascot.svg`, o mesmo usado na barra de título do Electron; os ícones da PWA são gerados a partir dele.

`npm run dev` faz o build PWA na etapa predev. `npm run build` gera o Electron e a PWA. `npm test` prepara o build web em pretest. O diretório `src/main/pwa/assets/web` é **gerado e ignorado pelo Git**. `electron-builder.yml` já inclui toda a pasta `assets` como `extraResources/pwa`.

## Componentes que reaproveitam a identidade

- Logo original e barra superior similar à do Electron
- Sidebar com projetos, conversas e avatares `PoliAvatar` **reais**, respeitando a forma, cor e acessórios (incluindo personalização de paletas)
- Conversa com avatar do agente, mensagens, histórico e composer
- Chat com `Message`, `MessageContent`, `MessageHeader`, `MessageBubble` e `PromptInput` já instalados; carregamento da conversa com `AITextLoading` da Kokonut UI, sem etapas fictícias.
- `MessageMarkdown` compartilhado entre o chat desktop e a PWA: Markdown GFM, títulos, listas, tabelas com rolagem própria, links externos protegidos e `CodeBlock` da Pasta UI com cópia de código. A tipografia usa o plugin instalado e as cores do tema ativo.
- A PWA omite controles de modelo e anexos que o gateway não oferece. O composer mantém bloqueio por permissão do dispositivo, envio por Enter, composição IME, texto restaurado após falha e parada da execução.
- Desktop web com sidebar, chat central e inspector lateral
- Mobile com sidebar e inspector recolhíveis, chat como conteúdo principal
- Estado sincronizado por polling (3 s para mensagens; 7 s para snapshot), evitando manter processos dos agentes no navegador

## Controle de host pela PWA (F2 limitado)

O gateway do Electron permanece em `127.0.0.1:6780` e tem pareamento com código de 8 dígitos, validade 3 minutos, uso único, cookie HttpOnly SameSite Strict e sessões temporárias (12 h).

A sessão recebe **somente `read`** depois do pareamento. Em Configurações → Conexões → Acesso PWA, o desktop lista cada dispositivo e permite conceder individualmente:

- `chat`: enviar mensagens para conversas do host e interromper uma execução
- `approvals`: aceitar/negar aprovações que apareçam no inspector

Ambas as permissões são **desligadas por padrão**, podem ser revogadas imediatamente e não são equivalentes a liberar terminal, execução arbitrária ou edição direta. O gateway valida Origin, Host, cabeçalho anti-CSRF, tamanho do corpo e allowlist de métodos; o `HostManager` executa nova checagem das capacidades antes do encaminhamento ao host remoto selecionado no Electron.

O envio de mensagem devolve **202 Accepted** assim que encaminha ao host, porque uma execução de agente pode durar vários minutos. A resposta real aparece via polling do histórico. A recusa por falta de permissão retorna HTTP 403. O botão Parar usa `v9:stop`.

A seleção de outro host é feita no Electron e invalida o pareamento anterior na PWA. Múltiplos hosts configuráveis no próprio celular **ainda não estão incluídos**. O acesso a arquivos no navegador continua somente em lista/diff, sem edição.

## React Color

O componente compartilhado `ReactColorField.tsx` usa o `ChromePicker` da biblioteca `react-color`, com popover, HEX e fechamento por Escape. Todos os controles de cor **ativos** do Boo Studio (cor do corpo, olhos, bochechas, partes dos acessórios) foram migrados para esse componente. O componente auxiliar `components/ai/color-picker.tsx` também passou a utilizar `ReactColorField` para a escolha personalizada de cor. Nenhuma interface usa o seletor nativo `input type=color` em produção. Os testes de unidade podem simulá-lo para validar a propagação de valores.

## Testes

- `npm run typecheck`
- `npx vitest run src/main/pwa/gateway.test.ts src/main/hosts/pwa-policy.test.ts`
- `npx vitest run src/renderer/src/components/ui/ReactColorField.test.tsx src/renderer/src/features/app/BooAccessoryColors.test.tsx`
- `npx vitest run src/renderer/src/features/chat/MessageMarkdown.test.tsx src/renderer/src/components/ai/prompt-input.test.tsx src/renderer/src/features/chat/MessageList.test.tsx src/renderer/src/features/composer/Composer.test.tsx`
- `node scripts/verify-pwa-web.cjs`: dados fictícios, Boos reais com acessórios, mobile + desktop, chat bloqueado por padrão e envio permitido após grant, arquivos/diff, hierarquia visual do Markdown, tabela e código longos sem rolagem horizontal da página, cópia real para a área de transferência e console sem erros
- `npm run build`
- `node scripts/verify-pwa-electron.cjs`: Electron com banco isolado, Markdown visível no chat desktop, autenticação, snapshot do host, método proibido, revogação

O HTML/CSS/JS estáticos antigos foram removidos para evitar dois estilos de UI. O service worker armazena **somente** arquivos estáticos da aplicação, nunca conversas, diff, cookies ou dados de agentes.

### Resultado da revisão dos componentes em 23/10/2026

- 37 testes passaram: 28 dos componentes de chat/composer e 9 do gateway/política de host. Typecheck, ESLint dos arquivos TS/TSX alterados e `npm run build` terminaram com código 0. O build mantém avisos de tamanho dos chunks e de bibliotecas de UI; esta rodada não mede desempenho.
- O smoke web passou com dois Boos, viewport mobile de 390 px, nenhum transbordamento horizontal da página, nenhum erro de página/rede, envio e parada pelo gateway e cópia real do código para a área de transferência. A tipografia computada confirmou título de 20 px, texto de 14 px e lista com marcador `disc`.
- O smoke do Electron compilado passou com perfil e banco temporários: título e `CodeBlock` renderizados no chat desktop, pareamento real com o gateway, snapshot com um workspace, método proibido recusado com 403 e sessão revogada recusada com 401. Nenhum erro no renderer. A mensagem de Markdown foi inserida apenas no banco temporário; nenhum modelo foi executado.
- Capturas locais: `%TEMP%/boobot-pwa-desktop.png`, `%TEMP%/boobot-pwa-mobile-chat.png` e `%TEMP%/boobot-pwa-electron-PaIBMn/desktop-markdown.png`. Log final do Electron: `%TEMP%/boobot-pwa-electron-final-20261023.log`; build: `%TEMP%/boobot-pwa-component-build-final-20261023.log`.
- A suíte global e os testes de React Color listados acima não foram repetidos nesta revisão. Não houve publicação, instalação ou teste em celular físico/tailnet.

## Acesso no celular fora do PC

Continua necessária uma configuração **Tailscale Serve privada em HTTPS**. O host existente tem um Funnel para outra aplicação; não alterar nem reutilizar o Funnel. Nenhuma porta da PWA foi publicada na internet. Não anunciar acesso remoto de outra rede como pronto antes de testar no celular conectado à tailnet.

## Pendências

O backend e os componentes básicos do editor desktop não são inteiramente isomórficos (Electron IPC, terminal, file explorer, etc.). A PWA usa a mesma identidade, ícones, avatares e estilos, mas simplifica navegação e inspector, em vez de executar `AppShell.tsx` com APIs falsas. Trabalhos futuros: seleção de host pela PWA com nova autenticação, streaming em tempo real/WS ou SSE, notificações push e editor de arquivos com permissões por projeto e hashes de concorrência.
