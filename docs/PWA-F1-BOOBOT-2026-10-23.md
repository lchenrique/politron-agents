# Boobot — PWA F1 instalada no projeto

Data: 23/10/2026. Situação: **F1 (consulta remota)**, não F2 (envio/edição/aprovação).

## O que existe

O Electron cria um gateway HTTP **somente em `127.0.0.1:6780`** ao iniciar. Ele serve os arquivos estáticos de `apps/desktop/src/main/pwa/assets`, incluindo manifesto, dois ícones PNG, favicon SVG e service worker. O app web é mobile-first e lista projetos, conversas, histórico recente, Boos, atividades, aprovações pendentes, diretórios e diff.

Em **Configurações → Conexões → Acesso PWA no navegador** é possível emitir código de 8 dígitos, válido por 3 minutos e uso único, e revogar todos os dispositivos. O código fica **somente na janela do Electron**; o navegador o informa uma vez na tela de pareamento. Sessões são armazenadas apenas em memória, duração máxima de 12 horas, cookie aleatório HttpOnly/SameSite=Strict (Secure quando usando proxy HTTPS). Fechar o app invalida todas as sessões.

O gateway exige Host conhecido, Origin exata, cabeçalho anti-CSRF, valida formato/tamanho de payload e limita tentativas de pareamento. A lista de métodos permitidos vem de `src/shared/pwa-host-policy.ts`; tanto o gateway como o HostManager verificam capacidades. O perfil F1 concede **somente leitura**, sem terminal, escrita, aprovações ou mensagens. A sessão é vinculada ao ID do host selecionado no desktop. Se trocar de host, é necessário parear novamente. A seleção de host permanece no Electron nesta versão.

`v9:snapshot` é reduzido ao mínimo necessário para a UI: nomes/IDs de projetos, conversas, avatares, estado breve de execuções e pendências; sem instruções de agentes, sem grandes diffs em lote e sem segredos. Os demais detalhes são buscados sob demanda. O service worker cacheia **somente arquivos públicos da interface**. Nunca grava tokens, transcrições, mensagens, arquivos nem diffs offline.

## Uso local

1. Inicie o Boobot desktop. O gateway liga automaticamente na porta 6780 apenas no loopback.
2. No próprio Windows, abra `http://localhost:6780/` em Edge/Chrome.
3. No Boobot, abra **Configurações → Conexões → Acesso PWA no navegador → Gerar código PWA**.
4. Digite os oito dígitos no navegador. O código expira em 3 minutos e não pode ser reutilizado.
5. Escolha projeto e conversa. A sincronização automática consulta o host enquanto a aba está visível.

## Acesso por celular — precisa configuração privada separada

O computador está conectado ao Tailscale como `desktop-tjnl4on`. Na inspeção de 23/10/2026, o endereço HTTPS **raiz** `desktop-tjnl4on.tail1a2a8f.ts.net` já tinha **Funnel habilitado para outro serviço (porta 4318)**. **NÃO redirecionar a raiz HTTPS para a PWA e NÃO criar Funnel para a PWA.** Isso exporia a interface à internet e modificaria o serviço atual.

Se o proprietário aprovar configurar uma porta HTTPS separada **somente para a tailnet**, o caminho sugerido para verificar em um próximo passo é:

```powershell
tailscale serve --bg --https=8443 http://127.0.0.1:6780
tailscale serve status
tailscale funnel status
```

O objetivo é que **apenas o Tailscale Serve privado** exponha `https://desktop-tjnl4on.tail1a2a8f.ts.net:8443/` aos dispositivos autorizados na tailnet, sem alterar a raiz/Funnel existente. Conferir explicitamente que `8443` **não aparece** como porta de Funnel público antes de distribuir o endereço. **Esses comandos não foram executados nesta etapa**; o acesso móvel externo ao PC ainda não foi validado.

Em celular com Tailscale conectado, abrir o endereço privado HTTPS; gerar código no Boobot do host e parear. O app funciona como PWA instalável em navegadores compatíveis; a disponibilidade do botão de instalação depende do browser e do HTTPS.

## Comandos de validação

No diretório `apps/desktop`:
```powershell
npm run typecheck
npx vitest run src/main/pwa/gateway.test.ts src/main/hosts/pwa-policy.test.ts
node scripts/verify-pwa-web.cjs
npm run build
node scripts/verify-pwa-electron.cjs
```

`verify-pwa-web.cjs` usa host e dados fictícios, testa layout móvel/desktop, código, conversas/diffs, sem acessar o banco pessoal. `verify-pwa-electron.cjs` usa diretório de dados isolado em TEMP e porta efêmera, testa o IPC real do desktop, pareamento real, leitura do banco vazio, método negado e revogação.

## F2 / F3 ainda pendentes

**F2:** envio de mensagens e seleção de modelos, aprovação/negação de solicitações com proteção de versão e auditoria, leitura e edição restrita de arquivos com `expectedHash` e confirmação, controle explícito das capacidades por dispositivo no desktop, sem terminal interativo. UI compartilhada Electron/web em componentes reutilizáveis.

**F3:** gerenciador de múltiplos hosts na própria PWA e reconexão com isolamento de caches por host, teste em dois computadores e aparelho físico, política de atualização e eventual distribuição privada. **Não prometer que o celular controla todo o Boobot antes dessas fases.**
