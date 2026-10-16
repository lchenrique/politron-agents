export interface DiffBlock {
  filePath: string
  originalContent: string
  modifiedContent: string
}

export interface FileChangesBlock {
  files: Array<{
    path: string
    action: 'created' | 'modified' | 'deleted'
  }>
}
