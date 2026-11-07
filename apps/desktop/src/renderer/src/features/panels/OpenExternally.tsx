import { Code2, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { errorText } from '../app/appShellShared'

/** Abre a pasta ou o arquivo do projeto no Explorador ou no VS Code; o processo principal valida o caminho. */
export function OpenExternallyButtons({ workspaceId, path, onError }: { workspaceId: string; path: string; onError: (message: string) => void }) {
  const open = (target: 'explorer' | 'vscode') => {
    onError('')
    void window.appAPI.openProjectPath(workspaceId, path, target).catch(cause => onError(errorText(cause)))
  }
  const what = path ? 'o arquivo' : 'a pasta do projeto'
  return <>
    <Button variant="ghost" size="icon" className="size-7 rounded-full" aria-label="Abrir no Explorador" title={`Abrir ${what} no Explorador`} onClick={() => open('explorer')}><FolderOpen className="size-3.5" /></Button>
    <Button variant="ghost" size="icon" className="size-7 rounded-full" aria-label="Abrir no VS Code" title={`Abrir ${what} no VS Code`} onClick={() => open('vscode')}><Code2 className="size-3.5" /></Button>
  </>
}
