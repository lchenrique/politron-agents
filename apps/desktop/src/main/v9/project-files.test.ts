import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listProjectDirectory, readProjectImage, readProjectText, resolveProjectPath, writeProjectText } from './project-files'

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

  it('valida caminhos para abrir fora do app somente dentro do projeto', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-open-'))
    directories.push(root)
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'a.ts'), 'x')
    expect(await resolveProjectPath(root, '')).toMatchObject({ directory: true })
    expect(await resolveProjectPath(root, 'src/a.ts')).toMatchObject({ directory: false })
    await expect(resolveProjectPath(root, '../fora')).rejects.toThrow(/fora do projeto/)
    await expect(resolveProjectPath(root, tmpdir())).rejects.toThrow(/inválido/)
    await expect(resolveProjectPath(root, 'src/../../x')).rejects.toThrow(/fora do projeto/)
  })

  it('lê imagens como data URL pela extensão e recusa outros formatos', async () => {
    const root = mkdtempSync(join(tmpdir(), 'politron-image-'))
    directories.push(root)
    writeFileSync(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]))
    writeFileSync(join(root, 'run.exe'), 'MZ')
    expect((await readProjectImage(root, 'logo.png')).dataUrl).toBe('data:image/png;base64,iVBORwA=')
    await expect(readProjectImage(root, 'run.exe')).rejects.toThrow(/sem prévia/)
    await expect(readProjectImage(root, '../logo.png')).rejects.toThrow(/fora do projeto/)
  })
})
