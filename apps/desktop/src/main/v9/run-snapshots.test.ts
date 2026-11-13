// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inside, normalizeRelative, RunSnapshots } from './run-snapshots'

const directories: string[] = []
const temporary = (prefix: string) => { const directory = mkdtempSync(join(tmpdir(), prefix)); directories.push(directory); return directory }
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) })

describe('backup por execução', () => {
  it('restaura o conteúdo anterior de um arquivo alterado', async () => {
    const data = temporary('boobot-snap-data-')
    const workspace = temporary('boobot-snap-ws-')
    writeFileSync(join(workspace, 'app.ts'), 'versão original')
    const snapshots = new RunSnapshots(data)
    await snapshots.capture('run-1', workspace, 'app.ts')
    writeFileSync(join(workspace, 'app.ts'), 'versão do Boo')

    expect(await snapshots.status('run-1')).toEqual({ available: true, files: 1 })
    expect(await snapshots.undo('run-1')).toEqual({ restored: 1, removed: 0 })
    expect(readFileSync(join(workspace, 'app.ts'), 'utf8')).toBe('versão original')
    // Depois de desfazer, o backup some: não dá para desfazer duas vezes.
    expect(await snapshots.status('run-1')).toEqual({ available: false, files: 0 })
  })

  it('remove o arquivo criado pela execução e preserva o que ela não tocou', async () => {
    const data = temporary('boobot-snap-data-')
    const workspace = temporary('boobot-snap-ws-')
    mkdirSync(join(workspace, 'src'), { recursive: true })
    writeFileSync(join(workspace, 'outro.ts'), 'intocado')
    const snapshots = new RunSnapshots(data)
    // Ordem real: captura antes da escrita (o arquivo ainda não existia), depois o Boo cria.
    await snapshots.capture('run-2', workspace, 'src/novo.ts')
    writeFileSync(join(workspace, 'src', 'novo.ts'), 'criado agora')
    await snapshots.capture('run-2', workspace, 'outro.ts')

    expect(await snapshots.undo('run-2')).toEqual({ restored: 1, removed: 1 })
    expect(existsSync(join(workspace, 'src', 'novo.ts'))).toBe(false)
    expect(readFileSync(join(workspace, 'outro.ts'), 'utf8')).toBe('intocado')
  })

  it('registra que o arquivo não existia e apaga na hora de desfazer', async () => {
    const data = temporary('boobot-snap-data-')
    const workspace = temporary('boobot-snap-ws-')
    const snapshots = new RunSnapshots(data)
    // Captura antes de o Boo criar o arquivo: nada para salvar, mas fica registrado.
    await snapshots.capture('run-3', workspace, 'criado.ts')
    writeFileSync(join(workspace, 'criado.ts'), 'novo')
    expect(await snapshots.undo('run-3')).toEqual({ restored: 0, removed: 1 })
    expect(existsSync(join(workspace, 'criado.ts'))).toBe(false)
  })

  it('não duplica o backup quando o mesmo arquivo é escrito várias vezes', async () => {
    const data = temporary('boobot-snap-data-')
    const workspace = temporary('boobot-snap-ws-')
    writeFileSync(join(workspace, 'a.ts'), 'primeira')
    const snapshots = new RunSnapshots(data)
    await snapshots.capture('run-4', workspace, 'a.ts')
    writeFileSync(join(workspace, 'a.ts'), 'segunda')
    await snapshots.capture('run-4', workspace, 'a.ts')
    writeFileSync(join(workspace, 'a.ts'), 'terceira')
    expect((await snapshots.status('run-4')).files).toBe(1)
    await snapshots.undo('run-4')
    expect(readFileSync(join(workspace, 'a.ts'), 'utf8')).toBe('primeira')
  })

  it('recusa caminho que sai da pasta do workspace', async () => {
    expect(normalizeRelative('../fora.ts')).toBeNull()
    expect(normalizeRelative('C:/Windows/system32')).toBeNull()
    expect(normalizeRelative('src/../fora.ts')).toBeNull()
    expect(normalizeRelative('src/app.ts')).toBe('src/app.ts')
    expect(inside('C:/projetos/app', '../fora.ts')).toBeNull()
    expect(inside('C:/projetos/app', 'src/app.ts')).not.toBeNull()
  })
})
