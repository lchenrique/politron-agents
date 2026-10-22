# Boobot: identidade vocal local e reutilizável (PocketTTS opcional)

## Objetivo
Cada Boo pode falar com uma identidade própria sem chamadas a uma API de TTS e sem um servidor de voz sempre ligado. O aplicativo invoca um executável **PocketTTS** local para cada texto. Os motores antigos (Supertonic, Kokoro, Chatterbox, OpenRouter) não são substituídos.

## Estado de verificação (22/10/2026)
- Binário oficial PocketTTS Windows 3.3.0 (release de GitHub v4.0.1) baixado e executado na máquina Windows i5-1135G7 / 24 GB RAM: comandos generate e export-voice disponíveis para **portuguese** e **portuguese_24l**.
- **Geração real de português validada com vozes predefinidas (sem clonagem).** O CLI gravou quatro WAVs com modelo `portuguese`, no Intel i5-1135G7, sem GPU. A geração de 4,08 s de fala levou 1,157 s de inferência para Rafael (3,53× tempo real), mas **6,09 s de execução total** porque o CLI carregou o modelo a cada execução. Vera: 5,52 s de fala / 1,401 s de inferência / 7,10 s de execução total. Cosette: 5,52 / 1,587 / 7,09 s. Marius: 4,32 / 1,236 / 7,53 s. Saídas disponíveis em `Music\Boobot - Previews PocketTTS`. A naturalidade e o sotaque PT-BR precisam de aprovação auditiva. Um teste adicional usando Vera registrou 2,64 s de áudio sintetizados em 704 ms de inferência, ~6,41 s totais de subprocesso e **pico de RAM Working Set de 397 MB** (amostragem do processo a cada 100 ms). Esses números são medidos no i5, mas não são um benchmark abrangente.
- **Clonagem de voz BLOQUEADA por controle de acesso do modelo, não por falha do Boobot.** Os dois comandos `export-voice --language portuguese` recusaram explicitamente pesos de clonagem (com mensagem orientando aceitar termos no https://huggingface.co/kyutai/pocket-tts e autenticar no Hugging Face). A variante `kyutai/pocket-tts-without-voice-cloning` é disponibilizada para presets, sob CC BY 4.0, sem a função de clonagem. Não houve concordância/autenticação em nome do usuário.
- Uma cópia do executável oficial foi colocada somente no perfil local do Boobot, em `%APPDATA%\politron-desktop\voice-models\pocket-tts\bin\pocket-tts.exe`. **Não está no Git e não será incluída automaticamente no instalador.**
- Dois WAVs de referência **já existentes no computador** foram copiados para `...\pocket-tts\voices\boo_f1.wav` e `boo_dora.wav`, provenientes de `Music\Politron - Vozes PT-BR`. Não foram clonadas com PocketTTS, apenas referências iniciais para uso futuro autorizado. Não os distribuir sem verificar as licenças dos modelos que originaram as gravações.

## Operação
1. Selecione **PocketTTS · vozes próprias locais** na janela de Chamada. Essa escolha é explícita e não altera o provedor padrão dos usuários existentes.
2. Selecione uma das quatro vozes predefinidas verificadas (Rafael, Vera, Cosette e Marius) ou uma identidade importada. **Voz geral** e identidade individual por Boo são independentes. O Boobot mantém a escolha mesmo após reiniciar.
3. Use **Importar voz local** para copiar um WAV/MP3 gravado com autorização ou uma identidade `.safetensors` ao armazenamento privado do Boobot. A aplicação recusa arquivos grandes e formatos incompatíveis.
4. Use **Preparar identidade** para converter uma referência de áudio em `.safetensors` reutilizável. Essa operação exige os pesos portugueses do PocketTTS autorizados na conta do usuário. Ao falhar, preserva a gravação original.
5. Use **Testar voz** para confirmar áudio no seu equipamento; depois pode ligar a conversa com o Boo.

O CLI usa os argumentos `generate --language portuguese --quantize --voice caminho --text texto --output-path caminho` e `export-voice --language portuguese original.wav identidade.safetensors`. Não abre porta HTTP nem envia textos a um serviço de síntese. **Dentro do Boobot** o subprocesso recebe `HF_HUB_OFFLINE=1`, proibindo downloads de pesos durante uma chamada. Portanto, os modelos precisam ser previamente obtidos e guardados em cache por procedimento explícito. O teste de preset Vera com `HF_HUB_OFFLINE=1` gerou WAV com sucesso a partir do cache já existente. Isso não equivale a um teste com isolamento de rede em nível de firewall.

## Instalação opcional em Windows
Obtém-se o executável em: https://github.com/kyutai-labs/pocket-tts/releases (v4.0.1, Windows x86_64, binário Rust). O arquivo esperado é `pocket-tts.exe` no diretório `%APPDATA%\politron-desktop\voice-models\pocket-tts\bin`. **Os pesos são separados**: presets usam a variante sem clonagem (testada localmente sem login específico de clonagem); pesos para clonar referências são gated em https://huggingface.co/kyutai/pocket-tts. Para clonagem, o usuário deve ler e aceitar os termos e autenticar sua conta, se concordar. Não colocar token HF no app, em scripts, logs ou repositório.

A criação das identidades em outro software (como VoiceStudio) pode ser feita uma única vez, exportando WAV e depois `.safetensors` pelo PocketTTS. O `.safetensors` depende da versão/modelo Pocket com o qual foi gerado e **não é uma voz Piper/ONNX**.

## Licenças e desempenho
Os quatro WAVs de prévia foram gerados por executável local, com os presets originais. Cada nova frase iniciou um subprocesso e carregou o modelo novamente, causando latência total de 6–7,5 s, apesar da inferência em si superar 3× a duração da fala. Isso pode ser lento para chamada interativa. Sem servidor permanente, o custo de inicialização persiste; não anunciar 200 ms de latência. Mantenha os outros motores disponíveis e compare audivelmente antes de mudar o padrão.

- PocketTTS, código sob MIT; os pesos oficiais exibem CC BY 4.0 e regras adicionais de acesso/uso no Hugging Face.
- VoiceStudio é AGPL-3.0; não incluir seu código no produto fechado sem cumprir as obrigações. Pesos usados no VoiceStudio têm licenças independentes; especialmente OmniVoice padrão é indicado com restrições não comerciais.
- Já medimos tempo de fala individual e pico de RAM (397 MB de Working Set); ainda falta ouvir a naturalidade PT-BR e testar muitas frases/solicitações em uso contínuo antes da inclusão na beta distribuída.
- Modelos diferentes, clonagem de pessoas e redistribuição de áudio exigem consentimento adequado e conferência das licenças.

## Critérios de aceite pendentes
- Para vozes clonadas a partir de WAV/MP3: pesos de clonagem portugueses autorizados pelo titular da conta e disponíveis offline. Os presets funcionaram sem esse acesso.
- Gerar frase PT-BR com as referências boo_f1.wav e boo_dora.wav; conferir se preservam identidade, naturalidade e sotaque.
- Executar export-voice e provar que o arquivo .safetensors consegue gerar novas frases.
- Comparar PocketTTS local com Supertonic/Piper quanto a CPU, RAM e tempo de fala; manter mais leve como padrão.
- Revalidar em instalador Windows assinado e sem rede.
