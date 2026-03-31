# SPEC-04 — Git Worktrees e File Locking

## Visão geral

Cada agente que recebe uma task com alteração de arquivos pode operar em sua própria branch e, quando necessário, em seu próprio worktree.

Regras:

- O **tech lead do time** aprova merges locais.
- O **CEO global não faz merge de rotina de um time**.
- O CEO global só é envolvido em exceções, bloqueios ou conflitos relevantes.

## Estrutura de worktrees

```txt
/projects/meu-app/
  .vibeide/
    worktrees/
      team-frontend-agent-1/
      team-frontend-agent-2/
```

## Branch naming

Formato sugerido:

```txt
team/{teamSlug}/{taskSlug}
```

Exemplo:

```txt
team/auth/desktop-login-flow
```

## Regras de merge

### Fluxo normal

1. Agente termina a task
2. Tech lead revisa o resultado
3. Merge é executado na branch principal do projeto
4. Locks são liberados
5. Worktree é removido

### Fluxo excepcional

Escalar ao CEO global quando:

- houver conflito recorrente entre times
- existir dependência cruzada entre pipelines
- o tech lead pedir decisão humana/produto

## File locking

File locking existe para:

- evitar edição simultânea do mesmo arquivo
- mostrar feedback visual na UI
- ajudar o tech lead a planejar o pipeline local

Modelo:

```ts
type FileLockMap = Map<string, string> // filePath -> agentId
```

## Verificação antes de disparar task

Antes de iniciar uma task, o executor local precisa validar:

- dependências concluídas
- ausência de lock conflitante
- agente disponível

## Exemplo

```txt
1. CEO global envia ao time de autenticação:
   "Entregar login desktop"

2. Tech lead do time quebra em:
   - UI de login
   - fluxo de autenticação
   - validação QA

3. Frontend e backend podem rodar em paralelo se não disputarem os mesmos arquivos.

4. Tech lead aprova merges.

5. CEO global recebe somente o resumo do time:
   "Fluxo de login entregue e validado."
```

## Decisões fixas

1. Merge operacional é responsabilidade do tech lead.
2. Locks são checados antes da execução.
3. CEO global não substitui o tech lead na coordenação local.
