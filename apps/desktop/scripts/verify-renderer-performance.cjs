// Execute após npm run build. Carga sintética local, sem inferência nem perfil do usuário.
// BOOBOT_PERF_LABEL identifica antes/depois; usa o mesmo número de eventos e a mesma janela.
const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const cwd = path.resolve(__dirname, '..')
const label = process.env.BOOBOT_PERF_LABEL || 'renderer'
const root = fs.mkdtempSync(path.join(os.tmpdir(), `boobot-perf-${label}-`))
const metricsOf = result => Object.fromEntries(result.metrics.map(metric => [metric.name, metric.value]))
let app

async function main() {
  const env = { ...process.env, BOOBOT_E2E_USER_DATA_DIR: path.join(root, 'userData') }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  app = await _electron.launch({ executablePath: require('electron'), args: [path.join(cwd, 'out/main/index.js')], cwd, env, timeout: 60_000 })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForFunction(() => !!window.appAPI)
  const fixture = await page.evaluate(async () => {
    for (let index = 0; index < 40; index++) await window.appAPI.saveAgent({ name: `Boo ${index}`, alias: `boo-${index}`, instructions: 'Teste local de renderização.', color: '#786bea' })
    const conversation = await window.appAPI.saveConversation({ name: 'Desempenho do renderer', agentIds: [] })
    return { conversationId: conversation.id }
  })
  await page.getByRole('button', { name: 'Desempenho do renderer', exact: true }).click()
  await page.getByRole('tab', { name: /Agentes/ }).click()
  await page.getByRole('button', { name: 'Abrir painéis e abas' }).click()
  await page.getByRole('menuitem', { name: 'Mascote', exact: true }).click()
  await page.getByRole('region', { name: 'Visualização do mascote' }).waitFor()
  await page.waitForTimeout(1500)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const phases = []
  // Ordem alternada reduz o viés de aquecimento. Cada amostra envia 180 textos e 36 changed.
  for (const [index, visible] of [true, false, false, true].entries()) {
    await page.evaluate(show => {
      for (const element of document.querySelectorAll('.poli-avatar')) element.style.visibility = show ? '' : 'hidden'
      // visibility:hidden conserva o layout; o teste pausa também o movimento para isolar os Boos.
      document.documentElement.classList.toggle('boobot-perf-hide-boos', !show)
      if (!document.getElementById('boobot-perf-style')) {
        const style = document.createElement('style')
        style.id = 'boobot-perf-style'
        style.textContent = '.boobot-perf-hide-boos .poli-avatar * { animation: none !important; transition: none !important; }'
        document.head.append(style)
      }
    }, visible)
    await page.waitForTimeout(250)
    const before = metricsOf(await cdp.send('Performance.getMetrics'))
    await page.evaluate(() => {
      window.__boobotPerfFrames = []
      let previous = performance.now()
      const tick = now => {
        window.__boobotPerfFrames.push(now - previous)
        previous = now
        window.__boobotPerfFrame = requestAnimationFrame(tick)
      }
      window.__boobotPerfFrame = requestAnimationFrame(tick)
    })
    const started = Date.now()
    await app.evaluate(async ({ BrowserWindow }, { conversationId }) => {
      const target = BrowserWindow.getAllWindows().find(window => !window.isDestroyed()).webContents
      for (let item = 0; item < 180; item++) {
        target.send('v9:event', { type: 'message', message: { id: 'perf-stream', conversationId, agentId: 'app-assistant', author: 'Assistente', role: 'assistant', text: `Resposta local ${item}. ${'Texto de teste. '.repeat(item + 1)}`, status: 'running', runId: null, createdAt: '' } })
        if (item % 5 === 0) target.send('v9:event', { type: 'changed' })
        await new Promise(resolve => setTimeout(resolve, 33))
      }
    }, fixture)
    await page.waitForTimeout(150)
    const after = metricsOf(await cdp.send('Performance.getMetrics'))
    const ui = await page.evaluate(() => {
      cancelAnimationFrame(window.__boobotPerfFrame)
      const frames = window.__boobotPerfFrames.slice(1).sort((a, b) => a - b)
      return {
        avatars: document.querySelectorAll('.poli-avatar').length,
        activeAvatars: document.querySelectorAll('.poli-avatar[data-motion-active="true"]').length,
        runningAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length,
        frames: frames.length,
        frameP95Ms: frames[Math.floor(frames.length * .95)] || 0,
        framesOver50Ms: frames.filter(frame => frame > 50).length,
        finalText: document.querySelector('[data-message-id="perf-stream"]')?.textContent?.includes('Resposta local 179.'),
      }
    })
    assert.equal(ui.finalText, true, 'O último evento de texto precisa chegar ao chat.')
    const sample = { index, visible, durationMs: Date.now() - started, taskMs: (after.TaskDuration - before.TaskDuration) * 1000, scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000, styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, layouts: after.LayoutCount - before.LayoutCount, ...ui }
    phases.push(sample)
    console.log(JSON.stringify(sample))
  }
  assert.deepEqual(errors, [])
  const result = { label, fixture: { agents: 40, textEventsPerSample: 180, changedEventsPerSample: 36, intervalMs: 33 }, phases, errors }
  fs.writeFileSync(path.join(root, 'metrics.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ evidence: root }))
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { if (app) await app.close() })
