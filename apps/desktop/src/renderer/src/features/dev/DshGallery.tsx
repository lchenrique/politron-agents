/**
 * Galeria de desenvolvimento dos componentes portados do DSH (components/dsh).
 * Só existe em `import.meta.env.DEV`, pela rota oculta `#/dsh-gallery`.
 * Cada componente aparece duas vezes: painel claro (`.dsh-light`) e escuro (`.dsh-dark`).
 */
import { useRef, useState, type ReactNode } from 'react'
import {
  AnimatedRows, Button, CodeFileIcon, FoldToggle, Checkbox, CodeBlock, CommandText, DetailDocument, DiffBlock, DisclosureRow, FileTypeIcon,
  HoverCard, HoverCardGroup, IconBrowseOutlineRegular, IconSearchOutlineRegular, IconSettingsOutlineRegular,
  ImageLightbox, ImagePreview, InlineEditor, Input, JsonBlock, JsonTree, MarkdownText, Menu, MenuGroup, MenuSurface,
  Modal, PathLabel, Pill, QuotePreview, ReadBlock, RiskConfirmation, SearchBlock, SegmentedControl, SegmentedTabs,
  ShortcutKeys, StateDot, Switch, Tag, TerminalBlock, TextShimmer, Toast, ToolCallTree, Tooltip, UserMessageBubble,
  WebBlock, codeToolbarLabels, diffBlockLabels, dshStrings, imageLightboxLabels, jsonTreeLabels, markdownLabels,
  readBlockLabels, searchBlockLabels, terminalBlockLabels, webBlockLabels,
  type DshToolCall, type MenuEntry, type TagTone,
} from '@/components/dsh'

const IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#4176e6"/><circle cx="160" cy="100" r="56" fill="#fff" opacity=".85"/></svg>',
)

const MARKDOWN = `# Título 1
## Título 2
Parágrafo com **negrito**, *itálico*, \`código inline\` e [um link](https://example.com).

- item um
- item dois
  1. sub item numerado
- [x] tarefa feita

> Citação curta.

| Coluna | Valor |
| --- | ---: |
| alfa | 1 |
| beta | 22 |

\`\`\`ts
export function soma(a: number, b: number): number {
  return a + b
}
\`\`\`
`

const DIFF = [{
  path: 'src/app/soma.ts',
  oldText: 'export function soma(a, b) {\n  return a + b\n}\n',
  newText: 'export function soma(a: number, b: number): number {\n  // tipado\n  return a + b\n}\n',
}]

const READ_LINES = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, text: i === 0 ? 'import { useState } from "react"' : `const linha${i + 1} = ${i * 3}` }))

const TOOL_CALLS: DshToolCall[] = [
  { id: 't1', kind: 'read', summary: 'src/app/soma.ts', path: 'src/app/soma.ts', state: 'success',
    read: { lines: READ_LINES, totalLines: 40, lang: 'typescript' } },
  { id: 't2', kind: 'search', title: 'Grep', summary: 'useState', state: 'success',
    search: { kind: 'matches', total: 3, truncated: false, files: [
      { path: 'src/a.tsx', matches: [{ lineNumber: 3, line: 'const [a, setA] = useState(0)' }, { lineNumber: 9, line: 'useState(false)' }] },
      { path: 'src/b.tsx', matches: [{ lineNumber: 12, line: 'const x = useState("")' }] },
    ] } },
  { id: 't3', kind: 'web', summary: 'react 19 release notes', state: 'success',
    web: { kind: 'search', answer: 'O React 19 trouxe **Actions** e `use`.', truncated: false,
      sources: [{ url: 'https://react.dev/blog', title: 'React Blog', snippet: 'Notas da versão 19' }, { url: 'https://github.com/facebook/react' }] } },
  { id: 't4', kind: 'edit', summary: 'src/app/soma.ts', path: 'src/app/soma.ts', state: 'success', diff: DIFF },
  { id: 't5', kind: 'bash', summary: 'Rodar testes', state: 'success',
    terminal: { command: 'npm test', cwd: 'D:/projeto', output: '\u001b[32m✓\u001b[0m 12 testes passaram\n', exitCode: 0 } },
  { id: 't6', kind: 'bash', summary: 'Compilar', state: 'success',
    terminal: { command: 'npm run build', output: 'error TS2322: tipo incompatível\n', exitCode: 2 } },
  { id: 't7', kind: 'bash', summary: 'Instalando dependências', state: 'running', terminal: { command: 'npm install', output: 'added 12 packages' } },
  { id: 't8', kind: 'todo', summary: '', state: 'success', todos: [
    { content: 'Ler o código', status: 'completed' }, { content: 'Portar componentes', status: 'in_progress' },
    { content: 'Escrever testes', status: 'in_progress' }, { content: 'Commit', status: 'pending' },
  ] },
  { id: 't9', kind: 'generic', title: 'Ferramenta MCP', summary: 'consulta_clima', state: 'error',
    input: '{"cidade":"São Paulo"}', output: 'Erro: serviço indisponível', errorSummary: 'Erro: serviço indisponível' },
  { id: 't10', kind: 'write', summary: 'docs/nota.md', state: 'interrupted', diff: [{ path: 'docs/nota.md', oldText: null, newText: '# Nota\n' }] },
  { id: 't11', kind: 'details', title: 'Criar rotina', summary: 'Resumo diário', state: 'success',
    details: { items: [{ title: 'Resumo diário', badge: { label: 'Ativa', tone: 'success' }, fields: [{ label: 'Horário', value: '08:00' }, { label: 'Dias', value: 'seg–sex' }] }] } },
  { id: 't12', kind: 'generic', title: 'Delegar', summary: 'Pesquisa para o Boo Analista', state: 'running', input: '{"agente":"analista"}',
    children: [
      { id: 't12a', kind: 'read', summary: 'README.md', state: 'success', read: { lines: READ_LINES.slice(0, 3), totalLines: 3 } },
      { id: 't12b', kind: 'search', title: 'Glob', summary: '**/*.ts', state: 'running', search: { kind: 'paths', paths: ['a.ts', 'b.ts'], total: 2, truncated: false } },
    ] },
  { id: 't13', kind: 'read', summary: 'preparando…', state: 'preparing' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0', borderTop: '0.5px solid var(--dsw-alias-border-l2)' }}>
      <h3 style={{ margin: 0, font: 'var(--dsw-font-xs-strong-13)', color: 'var(--dsw-alias-label-tertiary)' }}>{title}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div>
    </section>
  )
}

const Column = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>{children}</div>

const MENU_ITEMS: MenuEntry[] = [
  { type: 'label', id: 'l', text: 'Sessão' },
  { id: 'rename', label: 'Renomear', icon: <IconSettingsOutlineRegular size={16} />, shortcut: { keys: ['Ctrl', 'R'] } },
  { id: 'pin', label: 'Fixar' },
  { type: 'separator', id: 's' },
  { id: 'delete', label: 'Excluir', danger: true },
]

const TONES: TagTone[] = ['outline', 'solid', 'neutral', 'quiet', 'success', 'info', 'warning', 'danger']

function Pane({ mode }: { mode: 'light' | 'dark' }) {
  const [switchOn, setSwitchOn] = useState(true)
  const [checked, setChecked] = useState(false)
  const [segment, setSegment] = useState<'a' | 'b' | 'c'>('a')
  const [tab, setTab] = useState<'chat' | 'files'>('chat')
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [riskOpen, setRiskOpen] = useState(false)
  const [ack, setAck] = useState(false)
  const [toast, setToast] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [editing, setEditing] = useState('Título editável')
  const [disclosure, setDisclosure] = useState(false)
  const [fold, setFold] = useState(false)
  const [rows, setRows] = useState(['um', 'dois', 'três'])
  const rowsHost = useRef<HTMLDivElement>(null)
  const id = `dsh-${mode}`
  return (
    <div
      className={mode === 'dark' ? 'dsh-dark' : 'dsh-light'}
      data-gallery-pane={mode}
      style={{
        background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', font: 'var(--dsw-font-s-14)',
        padding: '20px 28px 40px', width: 760, flex: 'none',
      }}
    >
      <h2 style={{ margin: '0 0 8px', font: 'var(--dsw-font-l-20)' }}>{mode === 'light' ? 'Claro' : 'Escuro'}</h2>

      <Section title="Button">
        <Button variant="primary">Primário</Button>
        <Button variant="ghost">Fantasma</Button>
        <Button variant="outline">Contorno</Button>
        <Button variant="toolbar" size="sm" icon={<IconSearchOutlineRegular size={16} />}>Barra</Button>
        <Button variant="primary" disabled>Desativado</Button>
      </Section>

      <Section title="Pill · Tag · StateDot · ShortcutKeys · TextShimmer">
        <Pill>Pílula</Pill><Pill active>Ativa</Pill>
        {TONES.map(tone => <Tag key={tone} tone={tone}>{tone}</Tag>)}
        <StateDot state="done" /><StateDot state="warning" /><StateDot state="ongoing" /><StateDot state="error" /><StateDot state="idle" />
        <StateDot state="done" appearance="step" size={14} />
        <ShortcutKeys keys={['Ctrl', 'Shift', 'K']} />
        <TextShimmer active>Pensando…</TextShimmer>
      </Section>

      <Section title="PathLabel · FileTypeIcon · CodeFileIcon">
        <span style={{ width: 220, display: 'inline-flex' }}><PathLabel path="D:/projetos/politron/apps/desktop/src/renderer/App.tsx" /></span>
        {['a.ts', 'b.py', 'c.md', 'd.json', 'e.png', 'f.pdf', 'g.xlsx', 'h.zip'].map(p => <FileTypeIcon key={p} path={p} size={20} />)}
        <CodeFileIcon type="typescript" /><CodeFileIcon type="python" /><CodeFileIcon type="rust" />
      </Section>

      <Section title="Switch · Checkbox · Input · InlineEditor">
        <Switch checked={switchOn} onChange={setSwitchOn} label="Ativar" />
        <Checkbox checked={checked} onChange={setChecked} label="Concordo" />
        <Input placeholder="Buscar…" icon={<IconSearchOutlineRegular size={16} />} />
        <InlineEditor value={editing} label="Renomear" onChange={setEditing} onSave={() => undefined} onCancel={() => undefined} />
      </Section>

      <Section title="SegmentedControl · SegmentedTabs">
        <SegmentedControl id={`${id}-seg`} value={segment} onChange={setSegment} label="Modo"
          options={[{ value: 'a', label: 'Auto' }, { value: 'b', label: 'Claro' }, { value: 'c', label: 'Escuro', disabled: true, title: 'Indisponível' }]} />
        <div style={{ width: 260 }}>
          <SegmentedTabs value={tab} onChange={setTab} label="Painel"
            items={[{ value: 'chat', label: 'Chat', id: `${id}-tab-chat`, panelId: `${id}-panel-chat` }, { value: 'files', label: 'Arquivos', id: `${id}-tab-files`, panelId: `${id}-panel-files` }]} />
        </div>
      </Section>

      <Section title="Menu · MenuSurface · MenuGroup · Tooltip · HoverCard">
        <Menu open={menuOpen} onClose={() => { setMenuOpen(false) }} onSelect={() => { setMenuOpen(false) }} items={MENU_ITEMS} selectedId="pin"
          anchor={<Button variant="outline" size="sm" onClick={() => { setMenuOpen(value => !value) }}>Abrir menu</Button>} />
        <MenuSurface style={{ width: 180, padding: 4, position: 'relative' }}>
          <MenuGroup label="Grupo">
            <div style={{ padding: '6px 8px' }}>Item estático</div>
          </MenuGroup>
        </MenuSurface>
        <Tooltip label="Dica com atalho" shortcutKeys={['Ctrl', 'K']} side="bottom">
          <Button variant="ghost" size="sm">Passe o mouse</Button>
        </Tooltip>
        <HoverCardGroup as="span">
          <HoverCard anchor={<Tag tone="info">HoverCard</Tag>} content={<div style={{ padding: 8 }}>Conteúdo do cartão</div>}
            copyText="valor copiado" copyLabel="Copiar" copiedLabel="Copiado" />
        </HoverCardGroup>
      </Section>

      <Section title="Modal · RiskConfirmation · Toast · ImageLightbox · ImagePreview">
        <Button variant="outline" size="sm" onClick={() => { setModalOpen(true) }}>Modal</Button>
        <Button variant="outline" size="sm" onClick={() => { setRiskOpen(true) }}>Confirmação de risco</Button>
        <Button variant="outline" size="sm" onClick={() => { setToast(true) }}>Toast</Button>
        <Button variant="outline" size="sm" onClick={() => { setLightbox(true) }}>Lightbox</Button>
        <span style={{ width: 120 }}><ImagePreview src={IMAGE} alt="Prévia" loadingLabel={dshStrings.image.loading} failedLabel={dshStrings.image.failed} /></span>
        <Modal open={modalOpen} onClose={() => { setModalOpen(false) }} title="Novo projeto" description="Escolha uma pasta para começar." closeLabel="Fechar"
          footer={<><Button onClick={() => { setModalOpen(false) }}>Cancelar</Button><Button variant="primary" onClick={() => { setModalOpen(false) }}>Criar</Button></>}>
          <Input placeholder="Nome do projeto" data-modal-autofocus />
        </Modal>
        <RiskConfirmation open={riskOpen} title="Ligar terminal real?" description="O Boo poderá executar comandos no seu computador."
          acknowledgeLabel="Entendo o risco" cancelLabel="Cancelar" closeLabel="Fechar" confirmLabel="Ligar" acknowledged={ack}
          onAcknowledgedChange={setAck} onCancel={() => { setRiskOpen(false) }} onConfirm={() => { setRiskOpen(false) }} />
        {toast && <Toast text="Configuração salva" tone="success" onDone={() => { setToast(false) }} />}
        {lightbox && <ImageLightbox src={IMAGE} alt="Imagem" labels={imageLightboxLabels} onClose={() => { setLightbox(false) }} />}
      </Section>

      <Section title="UserMessageBubble · QuotePreview · CommandText">
        <Column>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><UserMessageBubble>Pode portar os componentes do DSH?</UserMessageBubble></div>
          <QuotePreview text="Trecho citado de uma resposta anterior que pode ser bem longo e ser cortado na largura máxima." />
          <span style={{ width: 300, display: 'block' }}><CommandText text="npm run dev -- --remoteDebuggingPort 9334 && echo pronto" label="Comando" /></span>
        </Column>
      </Section>

      <Section title="DisclosureRow · FoldToggle · AnimatedRows">
        <Column>
          <DisclosureRow icon={<IconBrowseOutlineRegular size={14} />} title="Pensamento" open={disclosure} expandable expandOnRowClick
            onToggle={() => { setDisclosure(value => !value) }} collapsedContent={<span>· 3 passos</span>}>
            <div style={{ padding: '4px 22px', color: 'var(--dsw-alias-label-secondary)' }}>Conteúdo expandido.</div>
          </DisclosureRow>
          <FoldToggle className={undefined} expanded={fold} hidden={7} labels={diffBlockLabels} onToggle={() => { setFold(value => !value) }} />
          <div ref={rowsHost} style={{ position: 'relative' }}>
            <AnimatedRows className="" rowKeys={rows} ready resetKey="r" label="Linhas">
              {rows.map(row => <div key={row} data-row-key={row} style={{ padding: '4px 0' }}>Linha {row}</div>)}
            </AnimatedRows>
          </div>
          <span><Button size="sm" onClick={() => { setRows(r => [...r.slice(1), r[0] ?? '']) }}>Girar linhas</Button></span>
        </Column>
      </Section>

      <Section title="CodeBlock · CodeToolbar">
        <Column>
          <CodeBlock code={'const x: number = 42\nconsole.log(x)\n'} lang="typescript" copyLabel={dshStrings.copy} copiedLabel={dshStrings.copied} toolbarLabels={codeToolbarLabels} />
        </Column>
      </Section>

      <Section title="DiffBlock · ReadBlock">
        <Column>
          <DiffBlock diffs={DIFF} labels={diffBlockLabels} />
          <ReadBlock lines={READ_LINES} totalLines={40} lang="typescript" label="src/app/soma.ts" labels={readBlockLabels} maxLines={8} />
        </Column>
      </Section>

      <Section title="TerminalBlock">
        <Column>
          <TerminalBlock command="npm test" cwd="D:/projeto" output={'\u001b[32m✓\u001b[0m soma.test.ts (3)\n\u001b[31m✗\u001b[0m falhou 1\n'} exitCode={1} labels={terminalBlockLabels} />
          <TerminalBlock command="npm run dev" output="ouvindo na porta 5173" running labels={terminalBlockLabels} />
        </Column>
      </Section>

      <Section title="SearchBlock · WebBlock">
        <Column>
          <SearchBlock kind="matches" total={2} truncated={false} labels={searchBlockLabels}
            files={[{ path: 'src/a.tsx', matches: [{ lineNumber: 3, line: 'useState(0)' }, { lineNumber: 9, line: 'useState(false)' }] }]} />
          <SearchBlock kind="paths" total={30} truncated paths={['src/a.ts', 'src/b.ts', 'src/c.ts']} labels={searchBlockLabels} />
          <WebBlock kind="fetch" url="https://react.dev/blog" statusCode={200} truncated={false} labels={webBlockLabels} />
        </Column>
      </Section>

      <Section title="JsonBlock · JsonTree">
        <Column>
          <JsonBlock label="Argumentos" payload={{ cidade: 'São Paulo', dias: 3 }} defaultOpen truncatedLabel={total => `… ${total} caracteres no total`} />
          <JsonTree label="Resultado" labels={jsonTreeLabels} copyable expandTopLevel
            data={{ nome: 'Boobot', versao: 1, ativo: true, tags: ['chat', 'agentes'], dono: { email: null } }} />
        </Column>
      </Section>

      <Section title="MarkdownText · DetailDocument">
        <Column>
          <MarkdownText text={MARKDOWN} labels={markdownLabels} />
          <DetailDocument state={{ status: 'found', markdown: '## Documento\nDetalhe em **Markdown**.' }}
            labels={{ title: 'Documento', loading: 'Carregando…', retry: 'Tentar de novo', markdown: markdownLabels }} onRetry={() => undefined} />
        </Column>
      </Section>

      <Section title="Linhas de ferramenta (ToolRow / ToolCallTree)">
        <Column>
          {TOOL_CALLS.map(call => <ToolCallTree key={call.id} call={call} onOpenFile={() => undefined} />)}
        </Column>
      </Section>
    </div>
  )
}

/** Página da galeria: dois painéis lado a lado. */
export default function DshGallery() {
  return (
    <div style={{ display: 'flex', gap: 0, minHeight: '100vh', overflow: 'auto', height: '100vh', alignItems: 'flex-start' }} data-dsh-gallery>
      <Pane mode="light" />
      <Pane mode="dark" />
    </div>
  )
}
