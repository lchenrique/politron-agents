# Aceite do instalador — 0.1.0-beta.9 (12/11/2026)

Execução automatizada do [checklist de aceite](CHECKLIST-ACEITE-BOOBOT-WINDOWS.md) no **app instalado**
(`D:\boobot-beta9-test`, instalador NSIS `Boobot-Setup-0.1.0-beta.9-x64.exe`, sem assinatura), com perfil
e pastas descartáveis em `%TEMP%`. Nenhum projeto real ou dado pessoal foi usado.

Modelo dos testes: Codex `gpt-6-luna`. Evidências: prints e `evidencia.jsonl` em
`%TEMP%\boobot-aceite-*` e `%TEMP%\boobot-aceite-p2-*`.

## Resultado

| Item | O que verifica | Resultado |
|---|---|---|
| T01 | Instala, abre sem tela branca, ponte `appAPI` viva, zero erro de renderer | **PASS** |
| — | Versão instalada é `0.1.0-beta.9` (`updatesAPI.status`) | **PASS** |
| — | Detecção de provedores no app instalado | **PASS** — codex 8, claude 14, pi 565 modelos |
| T02 | Persistência ao fechar e reabrir: conversa e mensagens continuam | **PASS** — 1 conversa, 2 mensagens |
| T04 | Escrita em **Perguntar**: arquivo só existe depois de clicar **Aprovar** | **PASS** — conteúdo `aprovado pelo usuário.` |
| T05 | Escrita negada: arquivo não é criado | **PASS** |
| T06 | **Automático** grava sem pedir aprovação | **PASS** — 0 aprovações pendentes |
| T11 | **Plano** mostra etapas e não cria arquivo | **PASS** — 3 etapas, 0 arquivos |
| T12 | **Plano** bloqueia alteração mesmo em Bypass | **PASS** — README intacto, nenhuma aprovação de escrita |
| T15 | **Parar** interrompe e nada é gravado depois | **PASS** — 20 arquivos no Parar, 20 depois, 0 runs ativos |
| T16 | Escrita fora da pasta do workspace é recusada | **PASS** — nada criado fora, recusa na conversa |
| T17 | Painel de atualizações abre e informa o feed | **PASS** — canal beta com feed não configurado |
| T09 | Cartão de pergunta devolve a escolha ao agente | **FALHOU** |
| T10 | Resposta livre ("Outra resposta") volta ao agente | **FALHOU** |
| T03 | Boo lê pasta e arquivo do workspace | coberto parcialmente pelo turno real (respondeu), leitura não conferida linha a linha |
| T07 | Terminal em Bypass sem pedir confirmação | **não executado** — exige supervisão humana |
| T08, T13, T14, T18 | Reinício do modo, execução após plano, histórico, reinstalação | **não executados** |

## Defeito encontrado (T09/T10)

A resposta do cartão é gravada na aprovação (`[question/approved] answer=Svelte 5 com runas`), mas o
agente **não continua o turno**: o histórico termina em `(Sem resposta em texto.)`. O `answerQuestion`
resolve a promessa que o `ask_user` aguarda e marca o run como `running`, então o runtime recebe a
resposta — o turno do Codex não produz nova mensagem depois disso.

Reprodução enxuta: Boo `codex/gpt-6-luna` em Automático pede `ask_user`; responder pelo cartão grava a
resposta e não gera réplica. O mesmo caminho em teste unitário (`service.answerQuestion`) resolve a
ferramenta; a diferença aparece no runtime real.

Atenção: a primeira rodada marcou T09 como **falso positivo** — a asserção procurava `React` no histórico
e o texto do pedido do usuário já continha "React". A correção da asserção (termo que não existe no
pedido) revelou a falha.

## Limites desta execução

- Instalador **sem assinatura** (`NotSigned`): o Windows mostra o aviso do SmartScreen.
- Feed de atualização não configurado (`update-feed.json` com `stable`/`beta` nulos), então nada de
  auto-update foi exercitado.
- Terminal e Computer Use ficaram fora por exigirem supervisão humana.
