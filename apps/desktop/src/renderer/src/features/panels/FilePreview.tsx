import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AlertCircle, Copy, FileCode2, RefreshCw, Save } from 'lucide-react'
import type { OnMount } from '@monaco-editor/react'
import { Button } from '@/components/ui/button'
import { errorText } from '../app/appShellShared'
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

export function FilePreview({ workspaceId, path, draft, onDraftChange, readOnly = false }: {
  workspaceId: string
  path: string
  draft?: FileDraft
  onDraftChange: FileDraftChange
  readOnly?: boolean
}) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [lineCount, setLineCount] = useState(0)
  const saveRef = useRef<() => void>(() => {})
  const draftChangeRef = useRef(onDraftChange)
  draftChangeRef.current = onDraftChange
  const dirty = !!draft && draft.content !== draft.baseline
  useEffect(() => {
    if (draft) return
    let live = true
    setLoading(true)
    setError('')
    window.appAPI.readProjectFile(workspaceId, path).then(result => {
      if (live) draftChangeRef.current(current => current || { content: result.content, baseline: result.content, hash: result.hash })
    }).catch(cause => { if (live) setError(errorText(cause)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [workspaceId, path, revision, draft])

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
      <Button variant="ghost" size="icon" className="size-7 rounded-full" aria-label="Atualizar arquivo" title="Recarregar do disco" onClick={reload}><RefreshCw className="size-3.5" /></Button>
      <Button variant="ghost" size="icon" className="size-7 rounded-full" disabled={!draft} aria-label="Copiar conteúdo" onClick={() => { if (draft) void navigator.clipboard?.writeText(draft.content).catch(() => undefined) }}><Copy className="size-3.5" /></Button>
      {!readOnly && <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={!dirty || saving} aria-label="Salvar arquivo" onClick={() => void save()}><Save className="size-3.5" />{saving ? 'Salvando…' : 'Salvar'}</Button>}
    </header>
    {loading && !draft && <p className="p-4 text-xs text-muted-foreground">Carregando arquivo…</p>}
    {error && <div role="alert" className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><AlertCircle className="size-4 shrink-0" />{error}</div>}
    {draft && <div className="min-h-0 flex-1 overflow-hidden bg-background"><Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Iniciando Monaco Editor…</p>}>
      <MonacoCodeEditor path={'file:///' + workspaceId + '/' + encodeURIComponent(path)}
        value={draft.content} language={fileLanguage(path)} onMount={onMount}
        onChange={next => onDraftChange(current => current ? { ...current, content: next ?? '' } : undefined)}
        options={{ readOnly: saving || readOnly }} />
    </Suspense></div>}
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border/40 px-3 text-[10px] text-muted-foreground">
      <span>{readOnly ? 'Monaco Editor · somente leitura' : dirty ? '● Alterações não salvas' : 'Monaco Editor · Ctrl+S para salvar'} · Até 1 MB</span>
      <span>{draft && lineCount ? lineCount + ' linhas' : ''}</span>
    </footer>
  </section>
}
