# SPEC-07 - Interface de Configuração do OpenCode

## Objetivo

Transformar a configuração real da CLI do OpenCode em uma UI de configurações dentro do Politron.

A UI não deve criar uma "config inspirada" nem simplificar a semântica original.
Ela deve editar o mesmo contrato conceitual da CLI, preservando:

- escopo global, workspace e projeto
- precedência entre defaults, providers, permissões e overrides
- suporte a segredos, variáveis de ambiente e arquivos
- compatibilidade com `opencode.json` e com o schema oficial

## Fonte da verdade

A referência principal desta spec é o schema público do OpenCode:

- `https://opencode.ai/config.json`

Documentação relacionada:

- `https://opencode.ai/docs/config/`
- `https://opencode.ai/docs/providers/`

## Princípio de arquitetura

O Politron não deve manter uma config paralela "parecida com a CLI".

O sistema deve:

1. ler a config oficial do OpenCode
2. resolver defaults, overrides e variáveis
3. expor essa configuração em UI
4. salvar de volta no formato compatível com a CLI

## Inventário real da config

### Top-level

- `username`
- `logLevel`
- `server`
- `command`
- `skills`
- `watcher`
- `snapshot`
- `plugin`
- `share`
- `autoshare` deprecated
- `autoupdate`
- `disabled_providers`
- `enabled_providers`
- `model`
- `small_model`
- `default_agent`
- `provider`
- `permission`
- `tools`
- `mcp`
- `instructions`
- `formatter`
- `lsp`
- `mode` deprecated
- `layout` deprecated
- `enterprise`
- `experimental`

### Provider config

Cada provider pode conter:

- `api`
- `name`
- `env`
- `id`
- `npm`
- `models`
- `whitelist`
- `blacklist`
- `options`
- `headers`
- `provider`
- `variants`

### Provider options

Dentro de `provider.*.options`:

- `apiKey`
- `baseURL`
- `enterpriseUrl`
- `setCacheKey`
- `timeout`
- `chunkTimeout`

### Model override

Cada model dentro de `provider.*.models` pode conter:

- `id`
- `name`
- `family`
- `release_date`
- `attachment`
- `reasoning`
- `temperature`
- `tool_call`
- `interleaved`
- `cost`
- `limit`
- `modalities`
- `experimental`
- `status`
- `options`
- `headers`
- `provider`
- `variants`

### Permissions

A permissão oficial suporta ações como:

- `read`
- `edit`
- `glob`
- `grep`
- `list`
- `bash`
- `task`
- `external_directory`
- `todowrite`
- `question`
- `webfetch`
- `websearch`
- `codesearch`
- `lsp`
- `doom_loop`
- `skill`

Valores possíveis:

- `ask`
- `allow`
- `deny`

### MCP

MCP suporta:

- `local`
- `remote`

Campos relevantes:

- `type`
- `command`
- `environment`
- `url`
- `enabled`
- `headers`
- `oauth`
- `timeout`

### Outros blocos importantes

- `command` para comandos customizados
- `skills.paths` e `skills.urls`
- `instructions` para instruções adicionais
- `tools` para toggles de ferramentas
- `compaction` para comportamento de contexto
- `watcher.ignore` para patterns de exclusão
- `server` para configuração do servidor/web mode

## Classificação da UI

### Pronto para UI direta

Esses blocos devem virar formulário normal:

- `username`
- `logLevel`
- `model`
- `small_model`
- `default_agent`
- `share`
- `autoupdate`
- `snapshot`
- `disabled_providers`
- `enabled_providers`
- `skills.paths`
- `skills.urls`
- `instructions`
- `watcher.ignore`
- `compaction`

### UI com editor avançado

Esses blocos precisam de interface mais rica, com tabela, tree view ou drawer:

- `provider`
- `provider.options`
- `provider.models`
- `permission`
- `mcp`
- `command`
- `tools`
- `server`

### Manter como avançado ou raw

Esses blocos devem existir, mas podem começar como editor técnico:

- `formatter`
- `lsp`
- `enterprise`
- `experimental`
- `plugin`
- campos deprecated

## Mapeamento CLI -> UI

| CLI | UI sugerida | Observação |
|---|---|---|
| `username` | Default global | Nome exibido nas conversas |
| `logLevel` | Runtime / Debug | Select simples |
| `model`, `small_model` | Modelos globais | Select com busca e fallback |
| `default_agent` | Agent default | Select entre agentes primários |
| `share` | Compartilhamento | Toggle / segmented control |
| `autoupdate` | Atualização | Toggle com modo `notify` |
| `snapshot` | Snapshot | Toggle |
| `provider` | Providers | Card por provedor + drawer de edição |
| `disabled_providers`, `enabled_providers` | Ativar/desativar providers | Lista com filtros |
| `permission` | Matriz de permissões | `ask/allow/deny` por capability |
| `tools` | Tools | Toggles granulares |
| `mcp` | MCP Servers | Tabela + editor local/remote |
| `command` | Commands | Lista de comandos customizados |
| `skills` | Skills sources | Paths e URLs |
| `instructions` | Instructions | Lista de arquivos/padrões |
| `server` | Server settings | Formulário técnico |
| `compaction` | Context behavior | Ajustes de contexto |
| `watcher.ignore` | Watcher ignore | Editor de glob patterns |
| `formatter`, `lsp`, `experimental`, `plugin` | Advanced | JSON assistido ou drawer técnico |

## Arquitetura proposta

### Camadas

1. `OpenCodeConfigService` no main process
2. `ConfigResolver` para merge e precedência
3. `ConfigAdapter` para traduzir schema oficial para shape de UI
4. `SettingsStore` para drafts locais da interface
5. `SettingsScreen` no renderer

### Responsabilidades

#### Main process

- ler e salvar arquivos reais de config
- resolver `opencode.json`, workspace e project scope
- normalizar env/file substitutions
- validar contra schema oficial

#### Renderer

- editar config por seções
- mostrar efetive config e origem
- indicar diferenças entre `global`, `workspace`, `project` e `env`
- evitar editar segredo em texto puro quando possível

### Precedência

Ordem sugerida:

1. defaults embutidos do OpenCode
2. config global do usuário
3. config do workspace
4. config do projeto
5. env vars
6. file refs
7. overrides explícitos da UI

## Schema interno sugerido

```ts
type ConfigScope = "global" | "workspace" | "project";
type SecretSource = "env" | "file" | "inline";

interface OpenCodeConfigDraft {
  meta: {
    scope: ConfigScope;
    sourceFile: string;
    effective: boolean;
  };
  defaults: {
    username?: string;
    logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
    model?: string;
    smallModel?: string;
    defaultAgent?: string;
    share?: "manual" | "auto" | "disabled";
    autoupdate?: boolean | "notify";
    snapshot?: boolean;
  };
  providers: Record<string, ProviderDraft>;
  permissions: PermissionDraft;
  tools: Record<string, boolean>;
  mcp: Record<string, McpServerDraft>;
  commands: Record<string, CommandDraft>;
  skills: {
    paths: string[];
    urls: string[];
  };
  instructions: string[];
  advanced: {
    compaction?: {
      auto?: boolean;
      prune?: boolean;
      reserved?: number;
    };
    watcher?: {
      ignore: string[];
    };
    formatter?: unknown;
    lsp?: unknown;
    plugin?: unknown[];
    experimental?: unknown;
  };
}

interface ProviderDraft {
  id: string;
  api?: string;
  name?: string;
  env?: string[];
  npm?: string;
  enabled?: boolean;
  options?: {
    apiKey?: {
      source: SecretSource;
      value?: string;
      ref?: string;
    };
    baseURL?: string;
    enterpriseUrl?: string;
    setCacheKey?: boolean;
    timeout?: number | false;
    chunkTimeout?: number;
  };
}
```

## Proposta concreta da tela

### Entrada

Adicionar `Configurações` como item funcional na sidebar do sistema, com navegação para uma tela dedicada.

### Estrutura da tela

#### Coluna lateral

- Geral
- Providers
- Models
- Permissões
- MCP
- Tools
- Commands
- Skills
- Instructions
- Runtime
- Advanced

#### Painel principal

- editor da seção selecionada
- estado efetivo
- origem do valor
- preview do JSON final

#### Painel auxiliar

- status do SDK
- providers detectados
- models disponíveis
- warnings de config inválida
- impacto no projeto atual

### Padrão visual

- cards com collapse para providers e MCP
- tabelas para permission e model overrides
- chips para origens e scopes
- drawer para edição avançada
- preview em JSON somente leitura

## Integração com o projeto atual

Pontos de encaixe já existentes:

- `apps/desktop/src/renderer/src/components/ide/AppSidebar.tsx`
- `apps/desktop/src/renderer/src/components/setup/SetupScreen.tsx`
- `apps/desktop/src/renderer/src/pages/Index.tsx`
- `apps/desktop/src/main/services/opencode-sdk.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/preload/index.ts`

### Fluxo sugerido

1. clique em `Configurações`
2. abrir tela `/settings`
3. carregar config efetiva via IPC
4. mostrar origem e diffs
5. editar e salvar por escopo
6. recarregar SDK quando necessário

## Itens que exigem tratamento avançado

### Segredos

- nunca armazenar API key como texto simples por padrão
- permitir `env` e `file` como fontes preferidas
- exibir valor mascarado com capacidade de trocar a fonte

### Providers complexos

- alguns providers precisam de auth via env vars
- alguns aceitam base URL customizada
- alguns têm modelos herdados e overrides locais

### MCP

- distinguir server local de remoto
- separar command, headers, auth e timeout
- validar comando e ambiente antes de salvar

### Permissões

- aceitar forma simples e forma granular
- respeitar comportamento por ferramenta e por glob

### Deprecados

- mostrar com warning, mas não bloquear leitura
- migrar para campos atuais quando possível

## Plano incremental de implementação

### Fase 1

- leitura do schema oficial
- exibição read-only da config efetiva
- diagnóstico básico de providers e models

### Fase 2

- seção Defaults
- seleção de `model`, `small_model` e `default_agent`
- `username`, `logLevel`, `share`, `autoupdate`, `snapshot`

### Fase 3

- seção Providers
- CRUD visual de providers
- edição de options e models

### Fase 4

- permissões e tools
- configuração de MCP

### Fase 5

- commands, skills, instructions, watcher, compaction
- editor avançado para formatter, lsp, plugin e experimental

### Fase 6

- persistência por scope
- diff visual
- validação ao salvar
- recarga do SDK sem reiniciar o app

## Critérios de pronto

- a UI representa a config oficial do OpenCode sem mudar semântica
- providers, models, permissões, MCP, tools e defaults podem ser configurados visualmente
- segredos podem ser definidos com segurança por env/file
- a tela mostra claramente o que é global, workspace e projeto
- a config salva continua compatível com o ecossistema OpenCode

## Riscos

- tentar reduzir demais o schema e perder compatibilidade
- esconder `env` e `file` e acabar forçando segredo em texto puro
- misturar defaults do Politron com defaults do OpenCode
- tratar `experimental` e `plugin` como config comum
- não mostrar origem dos valores e confundir o usuário

## Decisão fixa

O Politron deve editar a config real do OpenCode, não uma abstração paralela.
O objetivo da UI é tornar visível e controlável aquilo que a CLI já faz hoje.
