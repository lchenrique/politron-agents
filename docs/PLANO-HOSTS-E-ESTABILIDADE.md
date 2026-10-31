# Hosts Boobot e estabilização

19/10/2026. Direção confirmada: Boobot nos dois computadores; o PC de casa é o host. Esta é uma especificação de execução, não uma declaração de implementação concluída.

## Referências inspecionadas

- Paseo: `packages/server/src/server/agent/agent-manager.ts`, `utils/git-process-scheduler.ts`, `packages/relay/src/encrypted-channel.ts`, `packages/app/src/components/add-host-method-modal.tsx`; arquitetura cliente/daemon e documentação de conectividade/segurança.
- OpenMausBot: `server/harness/registry.ts`, `server/channel-queue.ts`, `server/room-queue.ts`, fora de `enterprise/`. Filas por conversa e instâncias independentes de agentes. Não copiar o produto inteiro nem assumir que ausência de erro numa referência certifica nossa integração.
- Fontes: https://github.com/getpaseo/paseo e https://github.com/milind-soni/OpenMausBot. SHA das consultas e arquivos baixados ficam na pasta temporária `boobot-hosts-*` desta execução.

## 1. Corrigir execução e Git

**Estado atual:** implementado; a delegação aguardada compartilha a vaga de execução e `apps/desktop/src/main/v9/queue-delegation.test.ts` tem sete testes passando. A seguir, o desenho original.

A causa do impasse é ocupar uma vaga global enquanto aguarda um filho que precisa da mesma fila. Introduzir concessões de execução explícitas: uma delegação aguardada herda a concessão da família/pasta, com irmãos serializados e descendentes reentrantes. Trabalho em background entra como outra raiz da mesma pasta, depois da liberação da origem. Não aumentar slots para esconder o problema. Manter permissões, ciclos, profundidade e cancelamento próprios.

Para Git, limitar processos concorrentes, compartilhar consultas de status simultâneas e impedir varreduras periódicas sobrepostas. Cancelar consultas de status ao encerrar o serviço. Reduzir processos por consulta quando o contrato puder ser preservado. Reproduzir timeouts sem alterar seus limites e distinguir contenção comprovada de hipótese.

## 2. Host e cliente

Reaproveitar `AppService`, banco, aprovações e runtimes no host. O Electron do host já permanece na bandeja; fechar sua janela não encerra o trabalho. Não anunciar um serviço que sobreviva a **Sair** ou desligar o PC.

Adicionar protocolo RPC versionado e eventos, sem execução de nomes arbitrários de métodos. O cliente conecta ao host selecionado; nunca faz fallback silencioso para execução local. Projetos, caminhos, modelos e ferramentas pertencem ao host. Seleção de outro host recarrega o estado para evitar mistura de dados. Desconexão do cliente não interrompe tarefas do host; reconexão consulta o estado persistido.

Transporte criptografado com a implementação publicada do Paseo (`@getpaseo/relay`), sem inventar criptografia. Além do canal criptografado, exigir autorização secreta própria do Boobot antes de qualquer RPC/evento. Chaves/credenciais permanecem no main e em armazenamento protegido. Pareamento revogável; nada de listener aberto por padrão.

Conexões: direta por rede/VPN; túnel OpenSSH não interativo usando configuração/chaves do usuário; link de pareamento. Relay é opcional e depende de endereço de relay configurado, com servidor de transporte autohospedável e sem envio para serviço público por padrão. Manter licença e atribuição das referências.

Interface shadcn: seletor compacto de host no rodapé da sidebar, estado conectado/desconectado, adicionar conexão e configuração separada do host local. Conexão inválida deve exibir erro; nunca mostrar controles que executam ações na máquina errada. Recursos que não puderem ser transportados nesta entrega devem ser bloqueados explicitamente em host remoto.

## 3. Evidência e conclusão

- Regressões da fila: dois pais, três níveis, irmãos, background, erro, cancelamento e isolamento por pasta.
- Git: testes existentes e repetição com concorrência controlada, mesmos timeouts.
- Transporte real por loopback entre instâncias isoladas: autenticação, chave errada, revogação, eventos, reconexão e workspace remoto; testes de relay/túnel separados dos testes com mocks.
- Electron: selecionar hosts sem misturar conversas/modelos, tarefa real em fixture descartável e aprovações no host correto.
- Executar TypeScript, testes pertinentes e build; atualizar auditoria e fontes do produto com resultados e limites. Não certificar conexão física ao PC de casa sem testar nessa máquina.
