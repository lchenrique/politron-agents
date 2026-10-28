import { describe, expect, it } from 'vitest'
import { activityCategory, activityNow, activitySummary, toolActivityText } from './activity'

const real = (n: number) => Array.from({ length: n }, () => 'Navegador real · js · alvo https://example.com/\nawait tab.goto(...)')

describe('atividade dos agentes', () => {
  it('rotula ferramentas do Politron por categoria e ignora as que têm cartão próprio', () => {
    expect(toolActivityText('browser_open', { url: 'https://example.com/a' })).toBe('Navegador interno · Abrir https://example.com/a')
    expect(toolActivityText('workspace_run_command', { command: 'npm   test' })).toBe('Terminal · npm test')
    expect(toolActivityText('workspace_write', { path: 'src/a.ts' })).toBe('Edição · src/a.ts')
    expect(toolActivityText('group_members', {})).toBe('Ferramenta · group_members')
    expect(toolActivityText('ask_user', {})).toBeNull()
    expect(toolActivityText('propose_plan', {})).toBeNull()
    expect(toolActivityText('workspace_run_command', { command: 'x'.repeat(300) })!.length).toBeLessThan(140)
  })

  it('classifica pelo prefixo, inclusive o formato antigo do navegador real', () => {
    expect(activityCategory(real(1)[0]!)).toBe('realBrowser')
    expect(activityCategory('Terminal · ls')).toBe('terminal')
    expect(activityCategory('Pedido para Ana: algo')).toBe('other')
  })

  it('mostra o passo atual no presente, agrupando ações seguidas da mesma categoria', () => {
    expect(activityNow(['Navegador interno · Abrir https://example.com/x'])).toBe('Abrindo example.com no navegador')
    expect(activityNow(['Terminal · ls', ...real(6)])).toBe('Usando seu navegador real em example.com (6 ações)')
    expect(activityNow(['Navegador real · js\nnodeRepl.write(1)', 'Navegador real · js\nx'])).toBe('Usando seu navegador real (2 ações)')
    expect(activityNow([...real(2), 'Terminal · node --version'])).toBe('Executando node --version')
    expect(activityNow(['Terminal · a', 'Terminal · b'])).toBe('Executando comando (2 comandos)')
    expect(activityNow(['Leitura · src/app.ts'])).toBe('Lendo src/app.ts')
    expect(toolActivityText('external_browser_status', {})).toBe('Navegador real · Verificar conexão')
    expect(activityNow(['Leitura · a', 'Leitura · b'])).toBe('Lendo arquivos (2 arquivos)')
    expect(activityNow([])).toBe('')
  })

  it('resume no passado com contadores e duração', () => {
    expect(activitySummary([...real(6), 'Terminal · a', 'Terminal · b'], 38_000)).toBe('Usou o navegador real (6 ações) · executou 2 comandos · 38s')
    expect(activitySummary(['Leitura · a'], 125_000)).toBe('Leu 1 arquivo · 2min 5s')
    expect(activitySummary(['Busca · x'], 200)).toBe('Fez 1 busca')
  })
})
