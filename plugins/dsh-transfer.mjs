#!/usr/bin/env node
// Leva o DSH de um computador para outro de uma vez: plugins instalados, plugins locais do Boobot, Boos, times e cadernos.
//
//   node dsh-transfer.mjs export [--out <pasta>] [--dsh <~/.dsh>]   gera boobot-dsh-<data>.zip (rode no computador de origem)
//   node dsh-transfer.mjs import [--dsh <~/.dsh>]                   rode no destino, dentro da pasta extraída do zip
//
// O que vai: lista de plugins (npm e locais), código dos plugins locais, cadastro dos Boos e times, cadernos e as configurações do
// perfil (só como referência). O que NÃO vai: logins (Codex, Claude Code), sessões, chaves, e ids desta máquina (sessões, projetos
// e rotinas dos Boos). O import nunca sobrescreve nada que já exista no destino e não instala plugins sozinho: gera
// INSTALAR-BOOBOT.md para o agente do DSH executar com plugin_manager.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const command = args[0]
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : fallback }
const dshDir = option('--dsh', join(homedir(), '.dsh'))
const PROFILE = join(dshDir, 'profiles', 'desktop')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const skip = path => /(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(path)
const copyTree = (from, to) => cpSync(from, to, { recursive: true, filter: source => !skip(source) })

/** Estado dos Boos sem o que só vale na máquina de origem: sessões casa, rotinas (agendadas em sessões) e projetos dos times. */
export function portableState(raw) {
  const { homes, routines, projects, ...rest } = raw
  return { ...rest, homes: {}, routines: [], projects: {} }
}

/** Separa as dependências do perfil em plugins do npm e plugins locais (link:). */
export function classify(dependencies) {
  const npm = []
  const local = []
  for (const [name, spec] of Object.entries(dependencies ?? {})) {
    if (spec.startsWith('link:')) local.push({ name, dir: spec.slice('link:'.length) })
    else npm.push({ name, version: spec, install: `${name}@${spec}` })
  }
  return { npm, local }
}

function exportAll() {
  if (!existsSync(join(PROFILE, 'package.json'))) throw new Error(`Perfil do DSH não encontrado em ${PROFILE}`)
  const profile = read(join(PROFILE, 'package.json'))
  const { npm, local } = classify(profile.dependencies)
  const bundles = profile.dsh?.profile?.bundles ?? []
  const stage = mkdtempSync(join(tmpdir(), 'boobot-dsh-'))
  try {
    const plugins = []
    for (const plugin of local) {
      if (!existsSync(plugin.dir)) { console.warn(`aviso: plugin local ausente, ignorado: ${plugin.dir}`); continue }
      const folder = basename(plugin.dir)
      copyTree(plugin.dir, join(stage, 'plugins', folder))
      plugins.push({ name: plugin.name, folder })
    }
    const statePath = join(dshDir, 'boobot-boos.json')
    const hasData = existsSync(statePath)
    if (hasData) {
      mkdirSync(join(stage, 'data'), { recursive: true })
      writeFileSync(join(stage, 'data', 'boobot-boos.json'), JSON.stringify(portableState(read(statePath)), null, 2))
      const notebooks = join(dshDir, 'boobot-boos', 'cadernos')
      if (existsSync(notebooks)) copyTree(notebooks, join(stage, 'data', 'cadernos'))
    }
    if (existsSync(join(PROFILE, 'cordis.patch.yml'))) {
      mkdirSync(join(stage, 'perfil'), { recursive: true })
      writeFileSync(join(stage, 'perfil', 'cordis.patch.referencia.yml'), readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8'))
    }
    const official = bundles.filter(name => name.startsWith('@deepseek-ai/') && !['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'].includes(name))
    writeFileSync(join(stage, 'manifest.json'), JSON.stringify({ exportedAt: new Date().toISOString(), npm, plugins, official, hasData }, null, 2))
    cpSync(fileURLToPath(import.meta.url), join(stage, 'dsh-transfer.mjs'))

    const out = option('--out', process.cwd())
    mkdirSync(out, { recursive: true })
    const zip = join(out, `boobot-dsh-${new Date().toISOString().slice(0, 10)}.zip`)
    rmSync(zip, { force: true })
    // No Windows, o `tar` do PATH pode ser o do Git (GNU), que não cria zip e confunde `C:` com host; usa o bsdtar do sistema.
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe') : 'tar'
    const result = spawnSync(tar, ['-a', '-c', '-f', zip, '-C', stage, '.'], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`Falha ao compactar (tar): ${result.stderr || result.error}`)
    console.log(`Pacote gerado: ${zip}`)
    console.log(`  plugins do npm: ${npm.length} | plugins locais: ${plugins.length} | oficiais: ${official.length} | dados dos Boos: ${hasData ? 'sim' : 'não'}`)
    console.log('No outro computador: extraia o zip e rode  node dsh-transfer.mjs import')
  } finally { rmSync(stage, { recursive: true, force: true }) }
}

/** Copia sem sobrescrever: devolve quantos arquivos foram criados e quantos já existiam. */
function copyMissing(from, to) {
  let created = 0
  let kept = 0
  for (const entry of readdirSync(from)) {
    const source = join(from, entry)
    const target = join(to, entry)
    if (statSync(source).isDirectory()) { mkdirSync(target, { recursive: true }); const inner = copyMissing(source, target); created += inner.created; kept += inner.kept } else if (existsSync(target)) kept += 1
    else { mkdirSync(dirname(target), { recursive: true }); cpSync(source, target); created += 1 }
  }
  return { created, kept }
}

function importAll() {
  const manifestPath = join(here, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error('manifest.json não encontrado: rode o import dentro da pasta extraída do zip.')
  const manifest = read(manifestPath)
  mkdirSync(dshDir, { recursive: true })
  const lines = []

  const pluginsRoot = join(dshDir, 'boobot-plugins')
  const targets = []
  for (const plugin of manifest.plugins) {
    const target = join(pluginsRoot, plugin.folder)
    if (existsSync(target)) lines.push(`- ${plugin.name}: pasta já existe em ${target}, mantida (apague-a para recopiar).`)
    else { copyTree(join(here, 'plugins', plugin.folder), target); lines.push(`- ${plugin.name}: copiado para ${target}.`) }
    targets.push({ name: plugin.name, target })
  }

  if (manifest.hasData) {
    const state = join(dshDir, 'boobot-boos.json')
    if (existsSync(state)) {
      const aside = join(dshDir, 'boobot-boos.importado.json')
      cpSync(join(here, 'data', 'boobot-boos.json'), aside)
      lines.push(`- Cadastro dos Boos: já existe um em ${state}; o importado ficou em ${aside} (nada foi sobrescrito).`)
    } else { cpSync(join(here, 'data', 'boobot-boos.json'), state); lines.push(`- Cadastro dos Boos: importado para ${state}.`) }
    const notebooks = join(here, 'data', 'cadernos')
    if (existsSync(notebooks)) {
      const result = copyMissing(notebooks, join(dshDir, 'boobot-boos', 'cadernos'))
      lines.push(`- Cadernos: ${result.created} arquivo(s) criado(s), ${result.kept} já existiam e foram mantidos.`)
    }
  }

  const reference = join(here, 'perfil', 'cordis.patch.referencia.yml')
  if (existsSync(reference)) { cpSync(reference, join(dshDir, 'cordis.patch.referencia.yml')); lines.push(`- Configurações do outro computador: ${join(dshDir, 'cordis.patch.referencia.yml')} (só referência; contém caminhos de lá).`) }

  const guide = join(dshDir, 'INSTALAR-BOOBOT.md')
  writeFileSync(guide, [
    '# Instalar o ambiente trazido de outro computador',
    '',
    'Para o agente do DSH: instale os bundles abaixo, nesta ordem, com `plugin_manager` (`install_bundle`, `enabled: true`). Pare e avise o usuário se algum falhar.',
    '',
    '## Plugins do npm',
    ...manifest.npm.map(plugin => `- \`${plugin.install}\``),
    '',
    '## Plugins locais do Boobot (caminho absoluto)',
    ...targets.map(item => `- \`${item.target}\` (${item.name})`),
    '',
    '## Oficiais do DSH (ligar pela lista `list_bundles`, usando o `installTarget.spec`)',
    ...(manifest.official.length ? manifest.official.map(name => `- \`${name}\``) : ['- nenhum']),
    '',
    '## O que não veio e o usuário precisa refazer',
    '- Login do Codex e do Claude Code (os plugins instalam, mas pedem login).',
    '- Associação de times a projetos e as rotinas dos Boos (os ids de projeto e de sessão são de cada computador).',
    '- Caminho do `claude.exe` no plugin `dsh-oh-my-claude`, se for diferente neste computador.',
    '',
    `Exportado em ${manifest.exportedAt}.`,
    '',
  ].join('\n'))
  lines.push(`- Guia de instalação: ${guide}`)

  console.log(lines.join('\n'))
  console.log('\nPróximo passo: abra o DSH e peça ao agente: "leia ~/.dsh/INSTALAR-BOOBOT.md e instale tudo".')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (command === 'export') exportAll()
    else if (command === 'import') importAll()
    else { console.error('Uso: node dsh-transfer.mjs export|import [--out <pasta>] [--dsh <~/.dsh>]'); process.exitCode = 1 }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
