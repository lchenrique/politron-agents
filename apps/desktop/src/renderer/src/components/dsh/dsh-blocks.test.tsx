import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DiffBlock, MarkdownText, TerminalBlock, ToolCallTree, ToolRow, diffBlockLabels, markdownLabels, terminalBlockLabels,
  type DshToolCall,
} from './index.ts'

describe('ToolRow (DSH)', () => {
  it('em execução anima o cabeçalho e anuncia o estado', () => {
    const { container } = render(<ToolRow variant="read" icon={null} title="Ler" summary="src/a.ts" state="running" output="..." />)
    expect(container.querySelector('[data-state="running"]')).not.toBeNull()
    expect(container.querySelector('[data-shimmer]')).not.toBeNull()
    expect(screen.getByText('Em execução')).toBeInTheDocument()
  })

  it('erro troca o resumo pela primeira linha do erro com a cor de erro', () => {
    render(<ToolRow variant="others" icon={null} title="Ferramenta" summary="consulta" state="error" errorSummary="Falhou: 500" output="Falhou: 500" />)
    const summary = screen.getAllByText('Falhou: 500')[0]?.closest('span[class*="summary"]')
    expect(summary?.className).toMatch(/errorSummary/)
    expect(screen.getByText('Falhou')).toBeInTheDocument()
  })

  it('interrompida usa o tom de aviso e omite o sufixo', () => {
    render(<ToolRow variant="write" icon={null} title="Escrever" summary="nota.md" summarySuffix="2 KB" state="stopped" />)
    const summary = screen.getAllByText('nota.md')[0]?.closest('span[class*="summary"]')
    expect(summary?.className).toMatch(/stoppedSummary/)
    expect(screen.queryByText('2 KB')).not.toBeInTheDocument()
    expect(screen.getByText('Interrompida')).toBeInTheDocument()
  })

  it('expande os detalhes IN/OUT no clique e recolhe de novo', () => {
    const { container } = render(<ToolRow variant="others" icon={null} title="Chamada" summary="x" state="ok" bodyRaw='{"a":1}' output="feito" />)
    const header = container.querySelector('[data-disclosure-row]') as HTMLElement
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('OUT')).not.toBeInTheDocument()
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('IN')).toBeInTheDocument()
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument()
    expect(screen.getByText('feito')).toBeInTheDocument()
    fireEvent.click(header)
    expect(screen.queryByText('feito')).not.toBeInTheDocument()
  })

  it('preparando não expande', () => {
    const { container } = render(<ToolRow variant="read" icon={null} title="Ler" summary="" state="preparing" output="x" />)
    fireEvent.click(container.querySelector('[data-disclosure-row]') as HTMLElement)
    expect(screen.queryByText('x')).not.toBeInTheDocument()
  })
})

describe('ToolCallTree (forma neutra)', () => {
  it('mapeia estados neutros, mostra código de saída e subchamadas', () => {
    const call: DshToolCall = {
      id: 'root', kind: 'generic', title: 'Delegar', summary: 'analista', state: 'success', input: '{}',
      children: [
        { id: 'c1', kind: 'bash', summary: 'Compilar', state: 'success', terminal: { command: 'npm run build', output: 'erro', exitCode: 2 } },
        { id: 'c2', kind: 'todo', summary: '', state: 'interrupted', todos: [
          { content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }, { content: 'C', status: 'in_progress' },
        ] },
      ],
    }
    const { container } = render(<ToolCallTree call={call} />)
    expect(container.querySelector('[data-state="ok"]')).not.toBeNull()
    const sub = container.querySelector('[data-subcalls]') as HTMLElement
    expect(within(sub).getByText('código de saída 2')).toBeInTheDocument()
    expect(sub.querySelector('[data-sample="bash"]')).toHaveAttribute('data-state', 'error')
    expect(sub.querySelector('[data-state="stopped"]')).not.toBeNull()
  })
})

describe('DiffBlock e TerminalBlock (DSH)', () => {
  it('DiffBlock mostra o caminho e linhas adicionadas/removidas', () => {
    const { container } = render(<DiffBlock labels={diffBlockLabels} diffs={[{ path: 'src/a.ts', oldText: 'const a = 1\n', newText: 'const a = 2\n' }]} />)
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(container.textContent).toContain('const a = 1')
    expect(container.textContent).toContain('const a = 2')
    expect(container.querySelector('[class*="del"]')).not.toBeNull()
    expect(container.querySelector('[class*="add"]')).not.toBeNull()
  })

  it('TerminalBlock mostra comando, saída sem ANSI cru e o código de saída', () => {
    const { container } = render(
      <TerminalBlock command="npm test" output={'\u001b[31mfalhou\u001b[0m\n'} exitCode={1} labels={terminalBlockLabels} />,
    )
    expect(screen.getByText('npm test')).toBeInTheDocument()
    expect(screen.getByText('falhou')).toBeInTheDocument()
    expect(container.textContent).not.toContain('\u001b')
    expect(container.textContent).toContain('código de saída 1')
  })
})

describe('MarkdownText (DSH)', () => {
  const text = [
    '# Título', '## Sub', '', '- um', '- dois', '', '1. primeiro', '',
    '`inline`', '', '```ts', 'const x = 1', '```', '',
    '| A | B |', '| - | - |', '| 1 | 2 |', '',
    '[seguro](https://example.com) [perigoso](javascript:alert(1)) <script>alert(1)</script>',
  ].join('\n')

  it('renderiza títulos, listas, código e tabelas', () => {
    const { container } = render(<MarkdownText text={text} labels={markdownLabels} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Título' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Sub' })).toBeInTheDocument()
    expect(container.querySelector('ul')?.querySelectorAll('li')).toHaveLength(2)
    expect(container.querySelector('ol li')?.textContent).toBe('primeiro')
    expect(container.querySelector('code')?.textContent).toBe('inline')
    expect(container.textContent).toContain('const x = 1')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['1', '2'])
  })

  it('links seguros abrem fora; javascript: e HTML cru não viram DOM ativo', () => {
    const { container } = render(<MarkdownText text={text} labels={markdownLabels} />)
    const safe = screen.getByRole('link', { name: /seguro/ })
    expect(safe).toHaveAttribute('href', 'https://example.com')
    expect(safe).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })

  it('link com protocolo proibido vira texto, sem âncora', () => {
    render(<MarkdownText text="[x](javascript:alert(1)) [y](data:text/html,oi)" labels={markdownLabels} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/x/)).toBeInTheDocument()
  })
})
