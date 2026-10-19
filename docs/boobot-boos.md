# Boobot — Boos permanentes e temporários

O nome genérico de cada agente é **Boo** (plural **Boos**). Os usuários podem atribuir qualquer nome próprio a um Boo. O Chief não deve substituir um nome explicitamente indicado pelo usuário.

## Identidade e equipe

- Antes de propor novos Boos, o Chief consulta `group_members`, que informa nomes, especialidades, motor, tipo e disponibilidade (`available`/`busy`); tarefas simples ou especialistas já existentes não justificam criar agentes extras. Se preciso, o Chief usa `propose_team` para associar os Boos permanentes à equipe do workspace mediante outra aprovação.
- Para criação inteligente e em lote, usa `propose_boos` (de 1 a 5 membros por proposta). Uma única aprovação explícita cobre os perfis, cores, instruções e tipos da equipe.
- Quando a pessoa não informa nome, `boo-identity.ts` sugere nomes de mitologias misturadas conforme a especialidade e evita nomes e menções duplicadas. Cores são atribuídas por uma paleta, evitando repetição enquanto possível.
- **Pedido explícito de equipe:** propose_boos usa purpose=team (ou omite purpose) e cria Boos **permanentes por padrão**, mesmo quando se trata de um projeto específico. Somente serão temporários se o usuário pedir explicitamente.
- **Reforço espontâneo para tarefa pontual:** Chief consulta group_members e, faltando um Boo apropriado disponível, propõe 1 a 5 com purpose=task. São **temporários por padrão**, sujeitos a aprovação de criação e de delegação.
- O campo temporary é opcional por Boo e substitui o padrão quando o usuário pede uma exceção. Nenhum novo Boo recebe automaticamente acesso de escrita ou de computador.

## Ciclo de vida temporário

- Um Boo temporário pertence a um workspace, inicia em `available`, passa a `working` ao receber uma delegação aprovada via `ask_agent` e depois se torna `retired`, inclusive em caso de falha/interrupção.
- Boos temporários ativos aparecem com indicação **Temp**; Boos aposentados saem da lista ativa e da lista de delegação, mas permanecem registrados no armazenamento para preservar identidade, mensagens e resultados anteriores.
- Após reinicialização, Boos temporários que ficaram marcados como `working` passam para `retired`, porque execuções interrompidas não são retomadas automaticamente.
- A pessoa pode converter um Boo temporário ativo em permanente no editor. O limite por workspace é de dez Boos temporários ativos.
- Não há exclusão automática de arquivos, conversas ou dados de usuário. A aposentadoria é lógica, não uma remoção destrutiva.

## Limitações atuais

- O Chief precisa de autorização do workspace para propor criações e de uma aprovação explícita do usuário para criar e delegar.
- Boos recém-criados usam Codex como motor padrão; o Chief ainda não escolhe o motor por especialidade.
- Cada Boo temporário é de uma delegação. O sistema não cria equipes em paralelo automaticamente sem aprovações; o Chief usa suas ferramentas em sequência.
- Os Boos aposentados ainda existem no banco, mas não há tela dedicada de arquivo/reativação. Uma alteração de nome de aplicativo e de todos os textos legados de Politron/Pits é um trabalho separado.

## Autoedição do Chief e demais Boos — outubro de 2026

A ferramenta `propose_self_profile` permite que qualquer Boo cadastrado, inclusive o Chief, proponha a alteração de **seu próprio perfil** (não outro). O modelo recebe a ferramenta quando a CLI suporta invocações de ferramenta. Quando alguém pergunta "você consegue se editar?", o sistema esclarece que isso significa mudar **configurações do Boobot**, não o treinamento/pesos do modelo.

Os campos permitidos são nome de exibição, descrição/especialidade, instruções completas de comportamento e personalidade, cores, formato de corpo, acessórios, olhos, bochechas, aura, animação e proporções. Campos omitidos não são alterados. O backend usa lista estrita de campos e valida tamanhos, cores e limites. A aprovação `agent-change` **sempre** é requerida, mesmo se o agente usa modo de aprovação automático. Após aprovar, a mudança é aplicada sobre a versão mais recente do perfil, evitando sobrescrever edições paralelas. A nova personalidade entra em vigor em respostas posteriores.

Autoedição não concede permissão para alterar motor/modelo, papel, menção, acesso ao computador, escrita, políticas nem credenciais. Essas configurações são editadas manualmente pelo usuário. O assistente padrão não é cadastrado como Boo e não usa esta ferramenta.

### Boo Studio: editor paramétrico

O editor SVG mantém a bolinha clássica e oferece quatro variações suaves inspiradas em fantasminhas (Ondinha, Fofinho, Pontudinho e Gota), escolhidas em miniaturas. As silhuetas antigas continuam suportadas em perfis salvos. Permite ajustar largura/altura entre 75% e 125%, tamanho/distância/cor dos olhos, tamanho da boca, cor e intensidade do blush, brilho/aura, animações e acessórios. Um botão **Restaurar aparência** repõe padrões cosméticos e remove imagem personalizada na edição, sem alterar nome/instruções/modelo/permissões; a mudança só é persistida ao salvar. Corpo, rosto, acessórios, aura e brilho compartilham transformação SVG centrada em (120,100), eliminando escalas conflitantes no CSS. Autoedição do Chief usa a mesma validação e exige aprovação. Não foi implementado editor livre de arrastar peças.

Não está implementado editor livre de peças por arrastar/rotacionar, criação de formas arbitrárias ou mascote Tamagotchi separado. Essas funções pertencem a uma etapa posterior.
