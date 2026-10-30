import { existsSync, renameSync, statSync } from 'node:fs'

/** Falhas de abertura do SQLite que podem ser transitórias quando outro processo do Boobot fecha o mesmo banco. */
export function isTransientDatabaseError(error: unknown): boolean {
  return /database disk image is malformed|database is locked|SQLITE_BUSY|SQLITE_CORRUPT/i.test(String((error as Error)?.message || error))
}

/**
 * Índice WAL (-shm) antigo ao lado de um WAL vazio pode fazer o SQLite acusar "malformed" sem o banco estar estragado.
 * Com o WAL vazio não há dado pendente no índice, então ele é posto de lado (renomeado, não apagado) e o SQLite o recria.
 * Com WAL não vazio nada é tocado. Devolve o novo nome do índice, ou null se não mexeu.
 */
export function setAsideStaleWalIndex(database: string, now = Date.now()): string | null {
  const shm = database + '-shm', wal = database + '-wal'
  if (!existsSync(shm) || (existsSync(wal) && statSync(wal).size > 0)) return null
  const target = `${shm}.stale-${now}`
  renameSync(shm, target)
  return target
}

/** Repete a abertura só para erros transitórios; qualquer outro erro sobe na hora. */
export async function retryTransient<T>(open: () => T, { attempts = 4, delayMs = 750, onRetry }: { attempts?: number; delayMs?: number; onRetry?: (error: unknown, attempt: number) => void } = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return open() } catch (error) {
      if (attempt >= attempts || !isTransientDatabaseError(error)) throw error
      onRetry?.(error, attempt)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}
