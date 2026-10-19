# Boobot — Checklist de estabilização (19/10/2026)

**Objetivo:** Boobot local e open source, Chief semi-autônomo, equipes por workspace, aplicações gerais; sem cloud própria. Este arquivo é plano incremental, não relato de funcionalidades prontas.

## Feito nesta revisão
- [x] Registrar melhorias visuais/loja/voz/animações do Boo Pet em `D:\projetos pessoais\boo-pet\BACKLOG-AGENTE.md` para outro agente.
- [x] Ajustar a simetria do preset **Fofinho** no SVG do Boobot (validar visualmente após atualizar aplicativo).
- [x] Implementar proposta **propose_agent_model** para Chief trocar motor/modelo/esforço de um Boo da equipe, com aprovação explícita, preservando permissões.
- [x] Manter delegações no workspace de origem (correção anterior).
- [x] Preservar alterações existentes no projeto: há arquivos modificados por outra sessão, não sobrescrever mudanças independentes.

## Próximos testes/correções essenciais
- [ ] Teste manual real: Chief recebe tarefa num workspace local, planeja, escolhe Boo, propõe delegação e conclui com resultado documentado.
- [ ] Confirmar modelo Claude/Codex disponível no ambiente e executar `propose_agent_model` via modelo real; testar mudança de runtime durante uma nova execução sem perder permissões.
- [ ] Revisar fluxo de aprovação e estado dos Boos temporários/interrompidos, especialmente em segundo plano.
- [ ] Verificar que todos os Boos autorizados usam `browser_open/observe/click/fill/key/scroll`; já existe sessão Playwright separada, mas login em perfis existentes não é automático.
- [ ] Testar navegador com tarefa real e verificar autorização de ações sensíveis e compartilhamento de sessão.
- [ ] Projetar Computer Use local com consentimento, seleção de janela, capturas, mouse/teclado, interrupção e log. **Ainda não implementado**; não confundir browser Playwright com computador inteiro.
- [ ] Revisar disponibilidade/limitações de cada runtime para ferramentas; evitar anunciar a agentes chat-only recursos que o runtime não suporta.
- [ ] Registrar checklist de testes manuais antes de distribuir versão pública.

## Última etapa (adiada a pedido)
- [ ] Gmail via OAuth: leitura, busca, rascunho e envio confirmado.
- [ ] Catálogo pequeno de plugins/MCP verificáveis.

## Segurança
Não herdar permissões do Chief em delegações; cada Boo usa suas próprias autorizações. Mudança de modelo requer aprovação e permissão `chiefEditAgents`. Computer Use pleno exige autorização específica. Não adicionar cloud.
