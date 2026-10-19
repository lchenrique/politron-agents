# Boobot

Boobot é um aplicativo desktop em preparação para lançamento open source, voltado a conversas com Boos (agentes de IA), workspaces, execução de tarefas e acompanhamento de alterações. A aplicação fica em `apps/desktop` e usa Electron, React e TypeScript.

## Estado do projeto

O Boobot está em desenvolvimento e ainda não possui instalador público nem licença open source definida. O código pode ser executado localmente para testes. Antes da publicação como software open source, é necessário escolher uma licença (por exemplo MIT ou Apache-2.0), revisar as licenças e os direitos dos recursos incorporados, configurar o instalador Windows e verificar o repositório para dados privados.

O nome público passou a ser **Boobot** e o personalizador de personagens chama-se **Boo Studio**. Identificadores históricos e o arquivo de banco `politron-v9.sqlite` continuam inalterados para preservar dados existentes.

## Começar

```powershell
cd apps/desktop
npm ci
npm run dev
```

Os comandos de qualidade disponíveis estão em [`docs/quality.md`](docs/quality.md). Para preparar o ambiente e entender integrações opcionais, consulte [`docs/onboarding.md`](docs/onboarding.md).

## Mapa do projeto

- [`AGENT.md`](AGENT.md): acordos detalhados de produto e implementação.
- [`AGENTS.md`](AGENTS.md): instruções compartilhadas para agentes e mapa das fontes.
- [`CLAUDE.md`](CLAUDE.md): entrada do Claude Code.
- [`PRODUCT.md`](PRODUCT.md) e [`ESTRATEGIA_POLITRON.md`](ESTRATEGIA_POLITRON.md): requisitos e estratégia vigentes.
- [`ESTRATEGIA_UX_WORKSPACES.md`](ESTRATEGIA_UX_WORKSPACES.md), [`PAINEIS_E_ABAS.md`](PAINEIS_E_ABAS.md) e [`KOKONUTUI_INTEGRACAO.md`](KOKONUTUI_INTEGRACAO.md): decisões e contratos de experiência visual.
- [`docs/architecture.md`](docs/architecture.md): mapa da arquitetura observada.
- [`docs/design.md`](docs/design.md): fontes visuais e restrições de interface.
- [`docs/quality.md`](docs/quality.md): comandos e evidências de qualidade.
- [`docs/setup.md`](docs/setup.md): adoção do toolkit, verificações realizadas, ferramentas e pendências.
- `docs/arquivo/`: registros e propostas históricas; consultar as fontes vigentes para decisões atuais.

Os documentos descrevem requisitos, decisões ou evidências conforme indicado em cada fonte. A presença de um requisito não prova que a funcionalidade está concluída.
