# Preparação local

O desktop e seus scripts npm ficam em `apps/desktop`. No Windows, use PowerShell:

```powershell
cd apps/desktop
npm ci
npm run dev
```

`npm ci` instala a árvore declarada no `package-lock.json`; não edite o lockfile manualmente. Consulte [`quality.md`](quality.md) para tipos, lint, testes e build.

## Integrações opcionais

O aplicativo pode usar CLIs instaladas no sistema. A detecção procura os binários Codex (`codex`), Claude Code (`claude`) e Pi (`pi`). O OpenCode não usa CLI: entra pela API do Console com uma chave salva em Configurações → Provedores. Uma CLI encontrada não implica que esteja autenticada ou que seu runtime esteja pronto. O detector lê catálogos locais de Pi e OpenCode; para outros provedores, veja as fontes de modelo próprias da aplicação e o editor de agente.

As integrações de voz em tempo real aceitam `GEMINI_API_KEY` e `GROQ_API_KEY` no ambiente do processo principal ou chaves salvas nas configurações do app. O modo gratuito pode usar Parakeet local para transcrição ou Groq/Whisper, e exige os modelos locais de VAD/Piper instalados. A disponibilidade e o modo escolhido são exibidos pelas configurações de voz. A voz dos Pits tem instalação local independente.

Credenciais persistidas pelo app passam por `safeStorage` do Electron. Não inclua chaves, arquivos `.env`, tokens, configurações pessoais de CLI ou conteúdo de banco em commits, exemplos ou relatórios. Esta documentação não define valores de configuração nem recomenda copiar credenciais para arquivos versionados.

## Diagnóstico inicial

1. Confira se `npm ci` terminou sem erro em `apps/desktop`.
2. Inicie com `npm run dev`; erros de compilação aparecem no terminal.
3. Para verificar código sem abrir a aplicação, use `npm run typecheck` e `npm run lint`.
4. Se um runtime não aparecer, verifique se a CLI correspondente é encontrada pelo mesmo ambiente que iniciou o app e se está configurada. A detecção não confirma autenticação.
5. Para voz, diferencie chave/provider configurado, arquivos de modelo instalados, teste simulado e sessão real com microfone.

Não use dados de produção para diagnóstico local. Consulte [`architecture.md`](architecture.md) para os limites entre renderer, preload, IPC e processo principal.
