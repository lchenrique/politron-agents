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
