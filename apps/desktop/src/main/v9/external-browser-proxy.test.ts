// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ExternalBrowserProxy, externalBrowserApprovalPreview, externalBrowserCallViolation } from './external-browser-proxy'

const fixture = fileURLToPath(new URL('./test-fixtures/fake-node-repl.mjs', import.meta.url))
// Cada teste inicia um processo node_repl falso; sob a suíte completa 5s não bastam.
vi.setConfig({ testTimeout: 30000 })
const cleanup: Array<() => unknown> = []
afterEach(async () => { for (const step of cleanup.splice(0).reverse()) await step() })

function setup(authorize = vi.fn(async () => null as string | null), command = process.execPath, extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'politron-proxy-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const log = join(dir, 'calls.log')
  const proxy = new ExternalBrowserProxy({ command, args: [fixture], env: { FAKE_NODE_REPL_LOG: log, ...extraEnv } }, authorize)
  cleanup.push(() => proxy.close())
  return { proxy, log, authorize }
}
async function connect(proxy: ExternalBrowserProxy, token = proxy.token) {
  const client = new Client({ name: 'codex-test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(proxy.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  cleanup.push(() => client.close())
  return client
}
const text = (result: Record<string, unknown>) => (result.content as Array<{ text?: string }>).map(item => item.text).join('')

describe('proxy MCP mediado do node_repl', () => {
  it('fail-closed: nenhum js é encaminhado, nem inofensivo nem com aprovação, e bypasses conhecidos não chegam à aprovação', async () => {
    const { proxy, log, authorize } = setup()
    await proxy.start()
    const client = await connect(proxy)
    // Bypasses que contornavam o antigo filtro por regex, mais automação comum: tudo recusado antes da aprovação.
    for (const code of ['await tab.goto("https://exemplo.com")', 'document.\\u0063ookie', "document['coo' + 'kie']", 'document.\u0063ookie',
      "globalThis[atob('ZXZhbA==')]('1')", "Function('return pro' + 'cess')().env", "eval('local' + 'Storage')",
      'await import(String.fromCharCode(102, 115))', 'tab.playwright.evaluate("document.cookie")', 'tab.cdp.send("Network.getAllCookies")',
      'await tab.goto("chrome://password-manager")', 'await tab.goto("file:///C:/")', "const k = 'cook'; document[k + 'ie']"]) {
      const result = await client.callTool({ name: 'js', arguments: { code } })
      expect(result.isError, code).toBe(true)
      expect(text(result)).toMatch(/fail-closed.*nenhuma aba foi acessada/)
    }
    expect(await client.callTool({ name: 'browser_use_full_cdp_access', arguments: {} })).toMatchObject({ isError: true })
    expect(authorize).not.toHaveBeenCalled()
    expect(existsSync(log)).toBe(false)
  })

  it('recusa clientes sem o token da sessão', async () => {
    const { proxy } = setup()
    await proxy.start()
    await expect(connect(proxy, 'token-errado')).rejects.toThrow()
  })

  it('depois de encerrado não encaminha mais chamadas', async () => {
    const { proxy, log } = setup()
    await proxy.start()
    const client = await connect(proxy)
    await proxy.close()
    await expect(client.callTool({ name: 'js', arguments: { code: '1' } })).rejects.toThrow()
    expect(existsSync(log)).toBe(false)
  })

  it('encerra o proxy quando o node_repl cai depois de iniciado', async () => {
    const { proxy } = setup(undefined, process.execPath, { FAKE_NODE_REPL_EXIT_MS: '300' })
    await proxy.start()
    for (let i = 0; i < 100 && proxy.ready; i++) await new Promise(resolve => setTimeout(resolve, 20))
    expect(proxy.ready).toBe(false)
  })

  it('falha fechada quando o node_repl não inicia', async () => {
    const { proxy } = setup(undefined, join(tmpdir(), 'node_repl-inexistente.exe'))
    await expect(proxy.start()).rejects.toThrow(/node_repl/)
    expect(() => proxy.url).toThrow()
  })

  it('política de conteúdo não confia em filtro textual: recusa qualquer js', () => {
    expect(externalBrowserCallViolation()).toMatch(/fail-closed/)
  })
})

describe('prévia da aprovação do navegador externo', () => {
  const redact = (url: string) => url.replace(/[?#].*$/, '')
  it('mostra o código com textos e comentários ocultos, alvos sem query e sem segredos', () => {
    const preview = externalBrowserApprovalPreview({ code: 'await tab.goto("https://exemplo.com/conta?token=abc#f"); await tab.fill("#senha", "hunter2") // chave sk-123\n/* Bearer xyz */ tab.click(`ok`)', extra: 'segredo' }, redact)
    expect(preview.targets).toEqual(['https://exemplo.com/conta'])
    expect(preview.code).toContain('tab.goto("https://exemplo.com/conta")')
    expect(preview.code).toContain('tab.fill("[texto oculto]", "[texto oculto]")')
    expect(preview.code).toMatch(/\[comentário oculto\][\s\S]*\[comentário oculto\]/)
    expect(preview.code).toContain('Outros campos (valores ocultos): extra')
    expect(preview.code).not.toMatch(/abc|hunter2|sk-123|xyz|segredo|#f/)
    expect(preview.truncated).toBe(false)
  })
  it('oculta o restante e avisa quando não consegue garantir a redação', () => {
    for (const code of ['x = /"/; y = "xyzzy"', 'tab.fill(`${"a"}xyzzy`)', 'tab.fill("xyzzy', 'a = 1 /* xyzzy']) {
      const preview = externalBrowserApprovalPreview({ code }, redact)
      expect(preview.code, code).not.toContain('xyzzy')
      expect(preview.code, code).toMatch(/restante oculto/)
      expect(preview.truncated, code).toBe(true)
    }
  })
  it('indica explicitamente quando a prévia foi truncada', () => {
    const preview = externalBrowserApprovalPreview({ code: 'tab.click(1);'.repeat(1000) }, redact)
    expect(preview.truncated).toBe(true)
    expect(preview.code).toMatch(/\[prévia truncada: \d+ de 13000 caracteres exibidos\]$/)
  })
})
