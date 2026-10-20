# Tamanho do instalador Windows

Medição em 20/10/2026 do artefato existente `apps/desktop/dist/Boobot-Setup-0.1.0-beta.1-x64.exe`, gerado em 19/10/2026. Tamanhos em MB decimais. Não foi gerado um instalador novo nesta conferência.

## Conteúdo medido

O arquivo tem **224,28 MB** (213,89 MiB). O inventário do payload foi lido com o 7-Zip do cache do electron-builder, sem executar o instalador. O payload soma 872,86 MB antes da compressão.

| Grupo | Antes da compressão | Comprimido no instalador |
| --- | ---: | ---: |
| Electron e recursos | 346,36 MB | 93,72 MB |
| Executável Claude distribuído pelo SDK | 271,84 MB | 90,62 MB |
| Código e dependências em `app.asar` | 222,44 MB | 30,84 MB |
| Voz ONNX | 23,51 MB | 5,55 MB |
| Outros módulos nativos | 8,71 MB | 2,95 MB |

A diferença até o tamanho final vem de cabeçalhos e do próprio instalador. Os valores comprimidos foram medidos por entrada: não são estimativas por proporção.

Dentro do índice do ASAR, `monaco-editor` soma 100,89 MB, enquanto o renderer compilado soma 41,12 MB e já inclui os assets do editor. Esse pacote completo é candidato à exclusão após conferir os imports e validar o aplicativo empacotado. Não se deve somar os tamanhos internos do ASAR aos 222,44 MB do arquivo: já estão contidos nele. O índice também referencia os arquivos externos de `app.asar.unpacked`.

## Comparação com Hermes e Paseo

- O [instalador inicial do Hermes](https://github.com/NousResearch/hermes-agent/blob/main/apps/bootstrap-installer/package.json) usa Tauri. Sua [orquestração](https://github.com/NousResearch/hermes-agent/blob/main/apps/bootstrap-installer/src-tauri/src/bootstrap.rs) obtém scripts de instalação, executa as etapas e inclui uma etapa para construir o desktop Electron. Portanto, um instalador inicial de 7 MB não representa o tamanho completo do desktop e das dependências. O arquivo específico de 7 MB informado pelo usuário não foi inspecionado.
- O [Paseo remove as cópias de Claude distribuídas pelo SDK](https://github.com/getpaseo/paseo/blob/main/packages/desktop/scripts/after-pack.js), porque exige uma CLI instalada pelo usuário. Nosso adaptador Claude prefere a instalação externa, mas ainda mantém o fallback do SDK; o empacotamento atual inclui ambos. Remover o fallback exige definir e validar o contrato de instalação externa.
- O valor informado de aproximadamente 100 MB para Paseo não foi comparado com um instalador da mesma versão, sistema e arquitetura. A diferença do Claude embutido já explica aproximadamente 90,6 MB comprimidos no nosso artefato.

## Próximas reduções com justificativa

1. Usar exclusivamente a CLI Claude detectada, com erro de configuração explícito quando ausente, e excluir os executáveis opcionais do SDK. O ganho medido neste artefato é 90,62 MB comprimidos; o resultado de uma nova compilação pode variar.
2. Excluir pacotes de interface já compilados, começando pelo Monaco completo. A redução comprimida precisa de uma nova medição; os 100,89 MB são descomprimidos.
3. Preservar os módulos de voz e terminal usados em execução. A voz representa 5,55 MB comprimidos neste instalador, portanto não explica a maior parte do tamanho.

Estas são recomendações de empacotamento. Nenhuma dependência ou capacidade foi removida nesta investigação.
