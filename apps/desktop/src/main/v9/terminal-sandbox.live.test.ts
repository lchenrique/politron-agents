// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { CodexRuntime } from './codex'

it.skipIf(process.env.BOOBOT_RUN_SANDBOX_PROBE !== '1')('sonda real do sandbox nativo do Codex, somente em diretórios descartáveis', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boobot-sandbox-probe-')), workspace = join(root, 'workspace'), outside = join(root, 'sibling.txt'), runtime = new CodexRuntime()
  await mkdir(workspace); await writeFile(outside, 'SINTETICO-FORA-DO-WORKSPACE')
  const command = `Get-Content -LiteralPath '${outside.replace(/'/g,"''")}'; Set-Content -LiteralPath inside.txt -Value OK; Set-Content -LiteralPath '${join(root,'outside-write.txt').replace(/'/g,"''")}' -Value FORA`
  try {
    await runtime.start()
    let result: unknown
    try { result = await runtime.request('command/exec', { command: ['powershell.exe','-NoProfile','-NonInteractive','-Command', command], cwd: workspace, timeoutMs: 20_000, sandboxPolicy: { type: 'workspaceWrite', writableRoots: [workspace], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true } }, 30_000) }
    catch (error) { result = { unavailable: error instanceof Error ? error.message : String(error) } }
    const outsideWritten = await readFile(join(root,'outside-write.txt'),'utf8').then(() => true, () => false)
    const insideWritten = await readFile(join(workspace,'inside.txt'),'utf8').then(() => true, () => false)
    await writeFile(join(root,'evidence.json'), JSON.stringify({ result, outsideWritten, insideWritten }, null, 2))
    console.info('SONDA DO SANDBOX:', root, JSON.stringify({ result, outsideWritten, insideWritten }))
    // Falha de inicialização não é prova de isolamento: o comando precisa realmente executar.
    expect(result).not.toHaveProperty('unavailable')
    expect(insideWritten).toBe(true)
    expect(outsideWritten).toBe(false)
  } finally { runtime.close() }
}, 45_000)
