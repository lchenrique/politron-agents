// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { WorkspaceStore } from './store'

it.skipIf(process.env.POLITRON_RUN_PERFORMANCE !== '1')('mede snapshot com histórico descartável', () => {
  const results: { recordsPerTable: number; p50: number; p95: number }[] = []
  for (const count of [100, 500, 2000, 10000]) {
    const directory = mkdtempSync(join(tmpdir(), 'politron-snapshot-benchmark-'))
    const store = new WorkspaceStore(directory)
    const db = new DatabaseSync(join(directory, 'politron-v9.sqlite'))
    try {
      db.exec('BEGIN')
      for (const table of ['v9_runs', 'v9_file_changes']) {
        // v9_file_changes exige run_id, tool_call_id e workspace_id; o harness antigo nao conhecia essas colunas.
        const insert = table === 'v9_runs'
          ? db.prepare('INSERT INTO v9_runs(id,data) VALUES(?,?)')
          : db.prepare('INSERT INTO v9_file_changes(id,run_id,tool_call_id,workspace_id,data) VALUES(?,?,?,?,?)')
        for (let index = 0; index < count; index++) {
          const id = `${table}-${index}`
          const data = JSON.stringify({ id, detail: 'x'.repeat(2048) })
          if (table === 'v9_runs') insert.run(id, data)
          else insert.run(id, 'run-benchmark', `tool-${index}`, 'workspace-benchmark', data)
        }
      }
      db.exec('COMMIT')
      for (let index = 0; index < 5; index++) store.snapshot()
      const samples = Array.from({ length: 30 }, () => {
        const start = performance.now()
        const snapshot = store.snapshot()
        const elapsed = performance.now() - start
        expect(snapshot.runs).toHaveLength(Math.min(100, count))
        expect(snapshot.fileChanges).toHaveLength(Math.min(500, count))
        return elapsed
      }).sort((a, b) => a - b)
      results.push({ recordsPerTable: count, p50: samples[14], p95: samples[28] })
    } finally {
      db.close()
      store.close()
      rmSync(directory, { recursive: true, force: true })
    }
  }
  console.info(JSON.stringify({ benchmark: 'workspace-snapshot-v2', method: 'Node; SQLite quente; 30 amostras; payload sintético de 2 KB; sem limite de tempo no teste', results }))
}, 60000)
