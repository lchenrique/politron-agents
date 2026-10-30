/** Falhas de abertura do SQLite que podem ser transitórias quando outro processo do Boobot fecha o mesmo banco. */
export function isTransientDatabaseError(error: unknown): boolean {
  return /database disk image is malformed|database is locked|SQLITE_BUSY|SQLITE_CORRUPT/i.test(String((error as Error)?.message || error))
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
