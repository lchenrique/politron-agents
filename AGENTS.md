# Instruções para agentes

Leia [`AGENT.md`](AGENT.md) antes de alterar o projeto. Siga também as instruções locais em diretórios mais específicos. Preserve o estado existente, os contratos Electron/IPC, dados, temas e funcionalidades; verifique callers e registre evidência sem chamar plano ou requisito de implementação concluída.

## Fontes do projeto

- Produto e execução: [`PRODUCT.md`](PRODUCT.md) e [`ESTRATEGIA_POLITRON.md`](ESTRATEGIA_POLITRON.md).
- Workspaces e experiência: [`ESTRATEGIA_UX_WORKSPACES.md`](ESTRATEGIA_UX_WORKSPACES.md), [`PAINEIS_E_ABAS.md`](PAINEIS_E_ABAS.md) e [`KOKONUTUI_INTEGRACAO.md`](KOKONUTUI_INTEGRACAO.md).
- Mapas: [`docs/architecture.md`](docs/architecture.md), [`docs/design.md`](docs/design.md), [`docs/onboarding.md`](docs/onboarding.md) e [`docs/quality.md`](docs/quality.md).
- `docs/arquivo/` contém histórico, não substitui as fontes atuais.

## Memória e validação

Use a CLI Bright Memory na raiz do workspace: `bright-memory ensure` antes de trabalho relevante e `bright-memory save` ao concluir. Memória persistente é salva somente pela CLI; documentação versionada registra contratos e manutenção do projeto.

Os comandos reais ficam em `apps/desktop/package.json`: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`. Execute verificações pertinentes à alteração e descreva resultados e limites observados. Não invente scripts ou capacidades.
