import { useEffect, type ComponentProps } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from '../../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker'
import CssWorker from '../../../../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker'
import HtmlWorker from '../../../../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker'
import JsonWorker from '../../../../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker'
import TsWorker from '../../../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker'

loader.config({ monaco })
const workerGlobal = self as typeof self & { MonacoEnvironment?: { getWorker: (_: unknown, label: string) => Worker } }
workerGlobal.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'json') return new JsonWorker()
    return new EditorWorker()
  },
}

function cssColor(name: string, fallback: string): string {
  const element = document.createElement('i')
  element.style.backgroundColor = 'var(' + name + ')'
  element.style.display = 'none'
  document.body.append(element)
  const color = getComputedStyle(element).backgroundColor
  element.remove()
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*[, ]+\s*(\d+)\s*[, ]+\s*(\d+)/)
  return rgb ? '#' + [rgb[1], rgb[2], rgb[3]].map(value => Number(value).toString(16).padStart(2, '0')).join('') : fallback
}

export function installPolitronTheme() {
  const root = document.documentElement
  const dark = root.classList.contains('dark') || !root.classList.contains('light') && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const background = cssColor('--background', dark ? '#101013' : '#fafafa')
  const foreground = cssColor('--foreground', dark ? '#eaeaea' : '#242424')
  const muted = cssColor('--muted-foreground', dark ? '#888894' : '#777777')
  const accent = cssColor('--primary', dark ? '#ab9aff' : '#6743cb')
  monaco.editor.defineTheme('politron-adaptive', {
    base: dark ? 'vs-dark' : 'vs', inherit: true,
    rules: [],
    colors: {
      'editor.background': background,
      'editor.foreground': foreground,
      'editorLineNumber.foreground': muted,
      'editorLineNumber.activeForeground': foreground,
      'editorCursor.foreground': accent,
      'editor.selectionBackground': accent + '38',
      'editor.inactiveSelectionBackground': accent + '20',
      'editor.lineHighlightBackground': accent + '0c',
      'editorWidget.background': background,
      'editorWidget.foreground': foreground,
      'editorSuggestWidget.background': background,
      'editorSuggestWidget.foreground': foreground,
      'editorOverviewRuler.border': background,
    },
  })
  monaco.editor.setTheme('politron-adaptive')
}
/** Keep text models when an inactive file tab releases its editor view.
 * Dispose them explicitly when that tab is closed to avoid unbounded caching. */
export function disposePolitronFileModel(workspaceId: string, path: string) {
  const uri = monaco.Uri.parse('file:///' + workspaceId + '/' + encodeURIComponent(path))
  monaco.editor.getModel(uri)?.dispose()
}

export function MonacoCodeEditor(props: Omit<ComponentProps<typeof Editor>, 'theme'>) {
  useEffect(() => {
    const sync = () => installPolitronTheme()
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener?.('change', sync)
    return () => { observer.disconnect(); media?.removeEventListener?.('change', sync) }
  }, [])
  return <Editor {...props} keepCurrentModel theme="politron-adaptive" options={{
    automaticLayout: true,
    fontSize: 13, lineHeight: 22, minimap: { enabled: false },
    scrollBeyondLastLine: false, wordWrap: 'off', smoothScrolling: true,
    padding: { top: 12, bottom: 12 },
    ...props.options,
  }} />
}
