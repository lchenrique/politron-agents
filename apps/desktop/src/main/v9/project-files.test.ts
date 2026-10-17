import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listProjectDirectory, readProjectText, writeProjectText } from './project-files'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

describe('explorador seguro de arquivos do workspace', () => {
  it('lista as pastas antes dos arquivos e permite abrir arquivos de texto', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-explorer-'))
    directories.push(root)
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'README.md'), '# Politron')
    writeFileSync(join(root, 'src', 'index.ts'), 'export const x = 1')
    const list = await listProjectDirectory(root)
    expect(list.map(entry => entry.name)).toEqual(['src', 'README.md'])
    expect(await readProjectText(root, 'src/index.ts')).toMatchObject({ content: 'export const x = 1' })
  })

  it('salva alteração com hash atual e recusa sobrescrever arquivo modificado por outro processo', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-save-'))
    directories.push(root)
    writeFileSync(join(root, 'code.ts'), 'primeira')
    const initial = await readProjectText(root, 'code.ts')
    const saved = await writeProjectText(root, 'code.ts', 'segunda', initial.hash)
    expect(readFileSync(join(root, 'code.ts'), 'utf8')).toBe('segunda')
    expect((await readProjectText(root, 'code.ts')).hash).toBe(saved.hash)
    writeFileSync(join(root, 'code.ts'), 'mudança do agente')
    await expect(writeProjectText(root, 'code.ts', 'minha edição', saved.hash)).rejects.toThrow(/alterado no disco/)
    expect(readFileSync(join(root, 'code.ts'), 'utf8')).toBe('mudança do agente')
  })

  it('recusa salvamento fora da raiz, binários e arquivos acima do limite', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-safe-save-'))
    directories.push(root)
    writeFileSync(join(root, 'safe.ts'), 'código')
    const { hash } = await readProjectText(root, 'safe.ts')
    await expect(writeProjectText(root, '../escape.ts', 'foo', hash)).rejects.toThrow(/fora do projeto/)
    await expect(writeProjectText(root, 'safe.ts', 'X'.repeat(1024 * 1024 + 1), hash)).rejects.toThrow(/1 MB/)
    await expect(writeProjectText(root, 'safe.ts', 'foo', 'wrong')).rejects.toThrow(/Abra novamente/)
    expect(readFileSync(join(root, 'safe.ts'), 'utf8')).toBe('código')
  })

  it('bloqueia arquivos fora da raiz, mesmo com ../', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-explorer-'))
    directories.push(root)
    await expect(readProjectText(root, '../elsewhere.txt')).rejects.toThrow(/fora do projeto/)
    await expect(listProjectDirectory(root, '../')).rejects.toThrow(/fora do projeto/)
  })

  it('não tenta renderizar arquivos binários ou acima de 1 MB', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-explorer-'))
    directories.push(root)
    writeFileSync(join(root, 'image.dat'), Buffer.from([1, 0, 2]))
    writeFileSync(join(root, 'big.txt'), 'x'.repeat(1024 * 1024 + 1))
    await expect(readProjectText(root, 'image.dat')).rejects.toThrow(/binários/)
    await expect(readProjectText(root, 'big.txt')).rejects.toThrow(/1 MB/)
  })
})
