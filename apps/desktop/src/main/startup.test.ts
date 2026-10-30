import { describe, expect, it, vi } from 'vitest'
import { isTransientDatabaseError, retryTransient } from './startup'

describe('abertura do banco na inicialização', () => {
  it('repete erro transitório do SQLite e devolve a abertura que deu certo', async () => {
    const open = vi.fn().mockImplementationOnce(() => { throw new Error('database disk image is malformed') }).mockReturnValue('ok')
    const onRetry = vi.fn()
    await expect(retryTransient(open, { delayMs: 1, onRetry })).resolves.toBe('ok')
    expect(open).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('desiste depois das tentativas e não repete erros que não são transitórios', async () => {
    const corrupt = vi.fn(() => { throw new Error('database disk image is malformed') })
    await expect(retryTransient(corrupt, { attempts: 3, delayMs: 1 })).rejects.toThrow('malformed')
    expect(corrupt).toHaveBeenCalledTimes(3)
    const newer = vi.fn(() => { throw new Error('O banco V9 usa o esquema 99, mais novo que o suportado (10).') })
    await expect(retryTransient(newer, { delayMs: 1 })).rejects.toThrow('mais novo')
    expect(newer).toHaveBeenCalledTimes(1)
    expect(isTransientDatabaseError(new Error('database is locked'))).toBe(true)
  })
})
