/** Recorte de @deepseek-ai/dsh-util-file-drag: só o tipo de nome exportado usado pelos primitivos. */
export interface DragFileName {
  readonly name?: string | undefined
  readonly mediaType: string
  readonly outputExtension?: string | undefined
}
