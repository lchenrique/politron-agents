# Boobot — checklist manual de aceite (instalador Windows)

Beta 0.1.0 — 22/10/2026. Execute estes testes no aplicativo **instalado**, em uma pasta descartável e usando **OpenCode Zen gratuito**. Não misture com projetos reais até aprovar os critérios.

## Preparação

Instale `Boobot-Setup-0.1.0-beta.1-x64.exe` e crie um workspace apontando para uma pasta de teste com README.md e src/index.ts. Configure um Boo usando OpenCode Zen `opencode/big-pickle` (ou outro modelo gratuito disponível). No workspace, deixe arquivos como **Herdar**.

## Testes

- [ ] **T01 Instalador:** conclui a instalação e cria os atalhos. Ao abrir, não há tela branca.
- [ ] **T02 Persistência:** feche e abra; Boos, workspaces, conversas e configurações permanecem.
- [ ] **T03 Leitura:** solicite ao Boo para listar a pasta e ler README.md; verifique que a resposta corresponde ao arquivo real.
- [ ] **T04 Escrita perguntando:** configure o Boo em **Perguntar antes de agir** e solicite criar teste-ask.txt; o arquivo só deve aparecer após você clicar em Aprovar.
- [ ] **T05 Recusa:** solicite criar teste-negado.txt e clique Negar; confirme que o arquivo não existe.
- [ ] **T06 Automático:** configure o Boo em **Automático — arquivos e navegador** e peça para criar teste-auto.txt; escrita deve funcionar sem pedir confirmação por arquivo.
- [ ] **T07 Bypass:** em Configurações → Ferramentas, habilite o terminal; no perfil do Boo selecione **Bypass — incluindo terminal**. Peça para executar `node --version` e verifique que não solicita aprovação. **O terminal não tem sandbox!**
- [ ] **T08 Reinício:** reinicie e verifique se o modo escolhido permanece. Após testar, volte para Perguntar no projeto de teste.
- [ ] **T09 Questionário:** peça “use ask_user para perguntar se prefiro React ou Vue”; escolha React no cartão. A resposta deve chegar ao agente sem precisar escrever outra mensagem.
- [ ] **T10 Resposta livre:** peça uma nova pergunta e use **Outra resposta**; confira o valor devolvido.
- [ ] **T11 Plano:** ative o botão **Plano** no campo de mensagem e peça uma landing page. Deve aparecer um plano visual por etapas, sem criar arquivos.
- [ ] **T12 Segurança do plano:** com **Plano** ligado, peça para alterar um arquivo, mesmo em Bypass. Nada deve ser alterado.
- [ ] **T13 Execução posterior:** desligue Plano, peça para implementar uma etapa; confira as alterações reais.
- [ ] **T14 Histórico:** alterne conversas e reabra: planos, perguntas, aprovações e histórico continuam visíveis.
- [ ] **T15 Interromper:** durante tarefa longa, clique em Parar; não deve continuar gravando arquivos nem responder a uma pergunta cancelada.
- [ ] **T16 Isolamento:** abra outro workspace descartável e confirme que escrita/leitura comum não atinge pasta errada.
- [ ] **T17 Painel de updates:** a tela deve abrir; atualizações automáticas não estarão operacionais até configurar feed público HTTPS.
- [ ] **T18 Reinstalar (opcional):** com backup, desinstale e reinstale a beta; verifique lançamento.

## Critério de aceite

T01–T16 sem falhas críticas; T17 pode mostrar feed não configurado. Teste de terminal em Bypass é voluntário e deve ser feito só em área de teste. **Bypass pode executar comandos em outros diretórios do PC, mesmo com workspace restrito.** Mudanças administrativas, como agentes/equipe, continuam exigindo confirmação explícita.

Para reportar falhas, informe: ID, comando enviado, modelo, comportamento visto e esperado e captura de tela. Os testes automatizados não substituem o aceite do instalador no seu computador.
