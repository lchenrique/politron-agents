import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AlertCircle, Copy, FileCode2, RefreshCw, Save } from 'lucide-react'
import type { OnMount } from '@monaco-editor/react'
import { Button } from '@/components/ui/button'
import { errorText } from '../app/appShellShared'
import { MessageMarkdown } from '../chat/MessageMarkdown'
import { OpenExternallyButtons } from './OpenExternally'
const MonacoCodeEditor = lazy(() => import('./MonacoCodeEditor').then(module => ({ default: module.MonacoCodeEditor })))

export interface FileDraft { content: string; baseline: string; hash: string }
export type FileDraftChange = (updater: (current?: FileDraft) => FileDraft | undefined) => void

const languages: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', css: 'css', scss: 'scss', html: 'html', htm: 'html',
  md: 'markdown', yaml: 'yaml', yml: 'yaml', py: 'python',
  go: 'go', rs: 'rust', sql: 'sql', sh: 'shell', ps1: 'powershell', xml: 'xml',
}
export const fileLanguage = (path: string): string => languages[path.split('.').pop()?.toLowerCase() || ''] || 'plaintext'

export type PreviewKind = 'markdown' | 'html' | 'image'
const previewKinds: Record<string, PreviewKind> = {
  md: 'markdown', markdown: 'markdown', mdx: 'markdown', html: 'html', htm: 'html',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
}
export const previewKind = (path: string): PreviewKind | undefined => previewKinds[path.split('.').pop()?.toLowerCase() || '']
/** Imagens de bitmap não têm texto: só há prévia, sem Monaco. */
export const isBinaryImage = (path: string) => previewKind(path) === 'image' && !/\.svg$/i.test(path)

// HTML do projeto é conteúdo não confiável: iframe sem scripts (sandbox="") e CSP que bloqueia rede.
const HTML_GUARD = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><base target="_blank">`

function PreviewPane({ kind, path, content, imageUrl }: { kind: PreviewKind; path: string; content?: string; imageUrl?: string }) {
  if (kind === 'markdown') return <div className="h-full overflow-auto px-6 py-5"><MessageMarkdown>{content ?? ''}</MessageMarkdown></div>
  if (kind === 'html') return <iframe title={'Pré-visualização de ' + path} sandbox="" referrerPolicy="no-referrer" srcDoc={HTML_GUARD + (content ?? '')} className="size-full border-0 bg-white" />
  // SVG também vai como <img>: nunca inline no DOM do app.
  const src = /\.svg$/i.test(path) ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(content ?? '') : imageUrl
  return <div className="flex h-full items-center justify-center overflow-auto bg-muted/30 p-4">
    {src && <img src={src} alt={path.split('/').pop() || path} className="max-h-full max-w-full object-contain" />}
  </div>
}

export function FilePreview({ workspaceId, path, draft, onDraftChange }: {
  workspaceId: string
  path: string
  draft?: FileDraft
  onDraftChange: FileDraftChange
}) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [lineCount, setLineCount] = useState(0)
  const kind = previewKind(path)
  const binary = isBinaryImage(path)
  const [mode, setMode] = useState<'code' | 'preview'>(kind === 'image' ? 'preview' : 'code')
  const [imageUrl, setImageUrl] = useState<string>()
  const saveRef = useRef<() => void>(() => {})
  const draftChangeRef = useRef(onDraftChange)
  draftChangeRef.current = onDraftChange
  const dirty = !!draft && draft.content !== draft.baseline
  useEffect(() => {
    if (!binary) return
    let live = true
    setLoading(true)
    setError('')
    window.appAPI.readProjectImage(workspaceId, path).then(result => { if (live) setImageUrl(result.dataUrl) })
      .catch(cause => { if (live) setError(errorText(cause)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [binary, workspaceId, path, revision])
  useEffect(() => {
    if (draft || binary) return
    let live = true
    setLoading(true)
    setError('')
    window.appAPI.readProjectFile(workspaceId, path).then(result => {
      if (live) draftChangeRef.current(current => current || { content: result.content, baseline: result.content, hash: result.hash })
    }).catch(cause => { if (live) setError(errorText(cause)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [workspaceId, path, revision, draft, binary])

  const save = async () => {
    if (!draft || saving || !dirty) return
    setSaving(true)
    setError('')
    const content = draft.content
    const expectedHash = draft.hash
    try {
      const result = await window.appAPI.writeProjectFile(workspaceId, path, content, expectedHash)
      onDraftChange(current => current ? { ...current, hash: result.hash, baseline: content } : undefined)
    } catch (cause) { setError(errorText(cause)) }
    finally { setSaving(false) }
  }
  saveRef.current = () => { void save() }
  const onMount: OnMount = (instance, monaco) => {
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    setLineCount(instance.getModel()?.getLineCount() ?? 0)
    instance.onDidChangeModelContent(() => {
      const next = instance.getModel()?.getLineCount() ?? 0
      setLineCount(current => current === next ? current : next)
    })
  }
  const reload = () => {
    if (dirty && !window.confirm('Descartar as alterações não salvas e recarregar este arquivo do disco?')) return
    onDraftChange(() => undefined)
    setRevision(current => current + 1)
  }
  return <section className="flex h-full min-h-0 flex-col overflow-hidden" aria-label={'Arquivo ' + path}>
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
      <FileCode2 className="size-3.5 text-primary" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={path}>{path}</span>
      {dirty && <span aria-label="Alterações não salvas" className="size-2 shrink-0 rounded-full bg-warning" />}
      {kind && !binary && <div role="group" aria-label="Modo de exibição" className="flex shrink-0 items-center rounded-md bg-muted p-0.5">
        {(['code', 'preview'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}
          className={'h-6 rounded-[5px] px-2 text-[11.5px] font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--dsh-blue)] ' + (mode === value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
          {value === 'code' ? 'Código' : 'Pré-visualizar'}</button>)}
      </div>}
      <OpenExternallyButtons workspaceId={workspaceId} path={path} onError={setError} />
      <Button variant="ghost" size="icon" className="size-7 rounded-full" aria-label="Atualizar arquivo" title="Recarregar do disco" onClick={reload}><RefreshCw className="size-3.5" /></Button>
      {!binary && <><Button variant="ghost" size="icon" className="size-7 rounded-full" disabled={!draft} aria-label="Copiar conteúdo" onClick={() => { if (draft) void navigator.clipboard?.writeText(draft.content).catch(() => undefined) }}><Copy className="size-3.5" /></Button>
      <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={!dirty || saving} aria-label="Salvar arquivo" onClick={() => void save()}><Save className="size-3.5" />{saving ? 'Salvando…' : 'Salvar'}</Button></>}
    </header>
    {loading && !draft && !imageUrl && <p className="p-4 text-xs text-muted-foreground">Carregando arquivo…</p>}
    {error && <div role="alert" className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><AlertCircle className="size-4 shrink-0" />{error}</div>}
    {kind && mode === 'preview' && (binary ? imageUrl : draft) && <div className="min-h-0 flex-1 overflow-hidden bg-background">
      <PreviewPane kind={kind} path={path} content={draft?.content} imageUrl={imageUrl} />
    </div>}
    {draft && mode === 'code' && <div className="min-h-0 flex-1 overflow-hidden bg-background"><Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Iniciando Monaco Editor…</p>}>
      <MonacoCodeEditor path={'file:///' + workspaceId + '/' + encodeURIComponent(path)}
        value={draft.content} language={fileLanguage(path)} onMount={onMount}
        onChange={next => onDraftChange(current => current ? { ...current, content: next ?? '' } : undefined)}
        options={{ readOnly: saving }} />
    </Suspense></div>}
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border/40 px-3 text-[10px] text-muted-foreground">
      <span>{binary ? 'Imagem · Até 10 MB' : (dirty ? '● Alterações não salvas' : mode === 'preview' ? 'Pré-visualização' : 'Monaco Editor · Ctrl+S para salvar') + ' · Até 1 MB'}</span>
      <span>{draft && lineCount && mode === 'code' ? lineCount + ' linhas' : ''}</span>
    </footer>
  </section>
}
