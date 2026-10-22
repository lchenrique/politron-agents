# Boobot — análise Paseo/OpenCode e Fish Speech (22/10/2026)

## Decisões
- **Modelo padrão do Assistente**: `gpt-6-luna` (Codex). Os Boos personalizados mantêm seus modelos próprios. Não usar Astra nos próximos aceites de custo.
- **Paseo**: aproveitar o desenho de integração do OpenCode, sem copiar dependências da arquitetura inteira.
- **Fish Speech**: não substituir Piper no modo de baixa latência; avaliar opção de voz de alta qualidade por API, sob licença adequada e medição.
- **Segurança**: preservar broker de ferramentas e aprovação do Boobot; não contornar limite upstream expondo comandos nativos.

## Implementação atual
`apps/desktop/src/main/v9/headless-cli.ts` chama `opencode run --pure --agent politron-safe --model ... --format json`, serializa catálogo de ferramentas no texto do prompt e emula RPC com saídas JSON e chamadas repetidas. O modelo gratuito `opencode/beam-free` retornou `Invalid value for 'tools': maximum number of items is 128` mesmo com `tools: {'*': false}` na configuração do agente seguro. Esse limite não foi resolvido; transporte CLI com provedor local controlado passou.

## Como o Paseo integra OpenCode
Fontes revisadas em `getpaseo/paseo` (branch principal):
- `packages/server/src/server/agent/providers/opencode/runtime-client.ts`: detecta versão, escolhe adaptadores v1/v2 e implementa `AgentClient`.
- `packages/server/src/server/agent/providers/opencode/v2/runtime.ts`: inicia e gere `opencode serve --hostname 127.0.0.1 --port 0`, com senha de processo, conexões referenciadas e encerramento controlado.
- `packages/server/src/server/agent/providers/opencode/v2/agent.ts`: cria/retoma sessões via `@opencode/client`, cataloga modelos e aplicações do plugin, aplica políticas por sessão.
- `packages/server/src/server/agent/providers/opencode/bridge.ts`: serviço privado de loopback com token, binding de ferramentas por sessão.
- `packages/server/src/server/agent/providers/opencode/v2/bridge-plugin.mjs`: registra ferramentas, filtra nomes segundo as permissões da sessão, delega chamadas ao daemon por HTTP interno.
- `docs/providers.md`: especifica versionamento, readiness, histórico de sessão, streaming, timeouts, reconciliação e limitações de versões.

## Proposta de evolução para Boobot
1. Criar `OpenCodeServerRuntime` experimental sem eliminar `HeadlessCliRuntime`.
2. Executar `opencode serve` apenas na interface localhost com autenticação, descoberta do modelo via SDK, pool de sessões, reconexão e fechamento.
3. Usar plugin com ferramentas filtradas por Boobot/agente e tokens de sessão; **não** permitir ferramentas nativas irrestritas; garantir que o catálogo oferecido ao modelo respeite limites do provedor.
4. Normalizar eventos: streaming, aprovação, persistência, cancelamento, ferramentas, falha e retomada.
5. Validar com o próprio modelo grátis que retornou >128 tools, e depois com outro modelo gratuito; comparar tempo para primeira resposta, tempo de troca de ferramentas e estabilidade.

## Fish Speech x hardware real
- Máquina: Intel Iris Xe integrada (memória de vídeo reportada ~1 GB), RAM total ~23,7 GB.
- Documentação Fish: S2-Pro requer ao menos 24 GB de VRAM recomendada (CPU teoricamente suportada); Drama 3 demanda 48 GB de VRAM NVIDIA e não suporta CPU.
- Uso: TTS de alta qualidade, não STT. O pipeline atual já tem Piper, Whisper/Parakeet, Chatterbox PT-BR, Supertonic/Kokoro e outros provedores — não adicionar Fish Speech local como padrão.
- Se houver interesse: adaptador TTS assíncrono opcional da API Fish Audio para reprodução/narração, com fallback Piper para chamada em tempo real, medindo custo e latência até primeiro áudio em frases PT-BR.
- Licença publicada do repositório: Fish Audio Community License (13/10/2026), com limiar anual de US$ 500 mil sob condições e exceções para hosted service; pesos S2-Pro seguem licença Fish Audio Research separada. Reavaliar obrigações e autorização comercial antes de redistribuição ou oferecer síntese a terceiros.

## Links
- https://github.com/getpaseo/paseo
- https://github.com/getpaseo/paseo/blob/main/docs/providers.md
- https://github.com/fishaudio/fish-speech
- https://speech.fish.audio/install/
- https://github.com/fishaudio/fish-speech/blob/main/LICENSE

## Teste real Luna (22/10)
Teste em diretório descartável do Codex usando `gpt-6-luna` passou: leitura, escrita autorizada em `counter.js`, execução `node test.cjs`, diff aplicado e resposta com `TESTE-RUNTIME-OK`. Evidências em `C:\Users\lchen\AppData\Local\Temp\boobot-tools-codex-pO4lJP`. Isso valida o fluxo funcional, não estabelece uma comparação de custo/qualidade entre modelos.

## Diagnóstico adicional no Desktop Remote
- Servidor real OpenCode v1 iniciou em localhost autenticado, criou e retomou sessão nativa; 5 testes passaram entre fake server e smoke live.
- Modelos gratuitos Zen disponíveis localmente: `opencode/mimo-v2.6-flash-free` e `opencode/big-pickle` foram testados por `OpenCodeServerRuntime`; ambos retornaram recusa de uso gratuito fora do aplicativo oficial. Isso não é falha de autenticação do servidor nem justifica contornar a restrição do provedor. O adaptador CLI legado já havia passado com `opencode/big-pickle` anteriormente, conforme provider-inventory.
- Identificado e corrigido problema do SSE: eventos de texto de mensagem de usuário podiam ser retransmitidos como resposta. Agora apenas mensagens de papel assistant explicitamente anunciadas podem emitir delta. Novo teste cobre mensagem de usuário e ID desconhecido; resposta HTTP final continua autoritativa.
- Teste real de Zen foi adicionado como opt-in em `opencode-server.zen.test.ts` (via `BOOBOT_LIVE_ZEN=1`), com expectativa de resposta genuína. O teste é mantido como diagnóstico e falha se o provedor recusar, sem falso positivo.

## Descoberta e validação posterior: Zen gratuito no servidor v1
- A mensagem "free tier can only be used from within OpenCode" era enganosa neste caso. O servidor utilizava o binário oficial e credenciais válidas, mas openCodeServerConfig() herdava ferramentas nativas desabilitadas do adaptador CLI e impunha permissão deny. A chamada HTTP também desabilitava todas as ferramentas. A ausência de ferramentas nativas como bash/read dispara a recusa do Zen (ver anomalyco/opencode #50627 e #51315).
- Correção: manter as declarações nativas do OpenCode, configurar todas as permissões como ask e external_directory como deny, e recusar pelo HTTP toda solicitação nativa permission.asked; o broker próprio do Boobot continua isolado.
- Teste real do servidor autenticado: opencode/big-pickle respondeu ZEN_OK (25,7 s) e opencode/mimo-v2.6-flash-free também respondeu ZEN_OK (21,7 s), sem Go ou modelos pagos.
- Limitação real: solicitação ao broker textual com Big Pickle produziu tentativa da ferramenta nativa bash com status error, sem chamada group_members. Portanto a geração de texto está validada, mas ferramentas do Boobot ainda não estão integradas com a robustez do Paseo. O adaptador exibe diagnóstico explícito em vez de resposta vazia.
- Um teste real de tentativa de criar arquivo temporário não criou arquivo, mas não emitiu pedido de permissão (permissionRequests=0): inconclusivo para segurança. O teste unitário verifica resposta explícita reject a permission.asked; ainda falta aceitação ponta a ponta da política de aprovação.
- Próximo passo: implementar plugin/bridge de ferramentas por sessão conforme Paseo, registrar esquemas das ferramentas do Boobot e devolver resultados ou recusas de forma nativa. Não liberar shell e escrita sem aprovação nem contornar validações do provedor.
