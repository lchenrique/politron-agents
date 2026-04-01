#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const AGENT_DIRS = [
  'academic',
  'design',
  'engineering',
  'game-development',
  'marketing',
  'paid-media',
  'sales',
  'product',
  'project-management',
  'testing',
  'support',
  'spatial-computing',
  'specialized'
]

const COLOR_MAP = {
  cyan: '#00FFFF',
  blue: '#3498DB',
  green: '#2ECC71',
  red: '#E74C3C',
  purple: '#9B59B6',
  orange: '#F39C12',
  teal: '#008080',
  indigo: '#6366F1',
  pink: '#E84393',
  gold: '#EAB308',
  amber: '#F59E0B',
  'neon-green': '#10B981',
  'neon-cyan': '#06B6D4',
  'metallic-blue': '#3B82F6',
  yellow: '#EAB308',
  violet: '#8B5CF6',
  rose: '#F43F5E',
  lime: '#84CC16',
  gray: '#6B7280',
  fuchsia: '#D946EF'
}

function parseArgs(argv) {
  const args = { workspaceRoot: process.cwd() }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--workspace-root') {
      args.workspaceRoot = argv[index + 1]
      index += 1
    }
  }

  return args
}

function walkMarkdownFiles(rootDir) {
  const files = []
  if (!existsSync(rootDir)) {
    return files
  }

  for (const entry of readdirSync(rootDir)) {
    const entryPath = join(rootDir, entry)
    const entryStat = statSync(entryPath)

    if (entryStat.isDirectory()) {
      files.push(...walkMarkdownFiles(entryPath))
      continue
    }

    if (entryStat.isFile() && entryPath.toLowerCase().endsWith('.md')) {
      files.push(entryPath)
    }
  }

  return files
}

function parseFrontmatter(content) {
  const normalized = content.replace(/^\uFEFF/, '')
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)

  if (!match) {
    return null
  }

  const frontmatter = {}
  for (const line of match[1].split(/\r?\n/)) {
    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!fieldMatch) {
      continue
    }

    const [, key, rawValue] = fieldMatch
    frontmatter[key] = rawValue.trim().replace(/^['"]|['"]$/g, '')
  }

  return {
    frontmatter,
    body: match[2].trim()
  }
}

function repairMojibake(value) {
  const text = String(value ?? '')
  if (!/[Ãâðï]/.test(text)) {
    return text
  }

  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8')
    return repaired.includes('�') ? text : repaired
  } catch {
    return text
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function resolveOpencodeColor(colorValue) {
  const normalized = String(colorValue ?? '')
    .trim()
    .toLowerCase()

  const mapped = COLOR_MAP[normalized] ?? normalized

  if (/^#[0-9a-f]{6}$/i.test(mapped)) {
    return `#${mapped.slice(1).toUpperCase()}`
  }

  if (/^[0-9a-f]{6}$/i.test(mapped)) {
    return `#${mapped.toUpperCase()}`
  }

  return '#6B7280'
}

function convertAgentFile(sourceFile, targetDir) {
  const parsed = parseFrontmatter(readFileSync(sourceFile, 'utf8'))
  if (!parsed) {
    return null
  }

  const { frontmatter, body } = parsed
  if (!frontmatter.name || !frontmatter.description) {
    return null
  }

  const name = repairMojibake(frontmatter.name)
  const description = repairMojibake(frontmatter.description)
  const bodyText = repairMojibake(body)
  const slug = slugify(name)
  const targetFile = join(targetDir, `${slug}.md`)
  const convertedContent = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    'mode: all',
    `color: '${resolveOpencodeColor(frontmatter.color)}'`,
    '---',
    bodyText,
    ''
  ].join('\n')

  mkdirSync(dirname(targetFile), { recursive: true })
  writeFileSync(targetFile, convertedContent, 'utf8')

  return targetFile
}

function main() {
  const { workspaceRoot } = parseArgs(process.argv)
  const repoRoot = resolve(workspaceRoot)
  const vendorRoot = join(repoRoot, '.vendor', 'agency-agents')
  const targetDir = join(repoRoot, '.opencode', 'agents')

  if (!existsSync(vendorRoot)) {
    console.warn(`[AgencyAgents] Vendor repo not found: ${vendorRoot}`)
    process.exit(0)
  }

  let convertedCount = 0

  for (const dir of AGENT_DIRS) {
    const dirPath = join(vendorRoot, dir)
    const markdownFiles = walkMarkdownFiles(dirPath)

    for (const file of markdownFiles) {
      const convertedFile = convertAgentFile(file, targetDir)
      if (convertedFile) {
        convertedCount += 1
      }
    }
  }

  console.log(`[AgencyAgents] Converted ${convertedCount} agents to ${targetDir}`)
}

main()
