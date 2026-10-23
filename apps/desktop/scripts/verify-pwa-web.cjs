// Browser smoke of actual React PWA with the exact PoliAvatar from desktop.
// Isolated fake host, never touches user agents or data.
const { chromium } = require('playwright')
const esbuild = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const assert = require('node:assert/strict')
const cwd = path.resolve(__dirname, '..')
const source = path.join(cwd, 'src/main/pwa/gateway.ts')
const code = esbuild.buildSync({entryPoints:[source],bundle:true,platform:'node',format:'cjs',external:['electron'],write:false}).outputFiles[0].text
const mod = new Module(source, module)
mod.filename = source
mod.paths = Module._nodeModulePaths(path.dirname(source))
mod._compile(code,source)
const {PwaGateway}=mod.exports
let gateway, browser
async function main(){
  const calls=[]
  const snapshot={
    workspaces:[{id:'ws1',name:'Projeto Fictício',kind:'local',archived:false,branch:'main'}],
    conversations:[{id:'c1',workspaceId:'ws1',name:'Conversa de teste',kind:'direct',archived:false,agentIds:['boo1']}],
    agents:[
      {id:'boo1',name:'Boo de QA',alias:'boo-qa',color:'#786bea',pitsShape:'little-cat',
       pitsHeadAccessory:'witch-hat',pitsFaceAccessory:'heart-glasses',pitsAccessoryColors:{'witch-hat':['#5a36a0','#261b43','#efbe40']}},
      {id:'boo2',name:'Ghost',color:'#66bbcc',pitsShape:'ghost-wave',pitsHeadAccessory:'headphones'}
    ],runs:[],approvals:[]
  }
  gateway=new PwaGateway({
    assets:path.join(cwd,'src/main/pwa/assets'),
    host:()=>({id:'local',name:'Desktop QA'}),
    dispatch:async(method,args)=>{
      calls.push([method,args])
      if(method==='v9:snapshot')return snapshot
      if(method==='v9:historyPage')return {messages:[{id:'m1',conversationId:'c1',agentId:'boo1',
        author:'Boo de QA',role:'assistant',status:'completed',text:[
          'Mensagem do host de teste.', '', '## Plano do projeto', '', '**Interface compartilhada** com `TypeScript`.', '',
          '- Preservar os Boos', '- Reutilizar os componentes', '',
          '| Recurso | Estado |', '| --- | --- |', '| Chat | Pronto |', '| Arquivo | ' + 'arquivo-'.repeat(30) + ' |', '',
          '```typescript', 'const marca = "Boobot";', '// ' + 'linha-longa-'.repeat(28), '```', '',
          '[Documentação](https://example.com/boobot)',
        ].join('\n'),createdAt:new Date().toISOString()}],hasMore:false}
      if(method==='v9:workspaceDiff')return 'diff --git a/test.txt b/test.txt'
      if(method==='v9:listProjectFiles')return [{name:'src',path:'src',directory:true}]
      if(method==='v9:send'){snapshot.runs=[{id:'run1',workspaceId:'ws1',conversationId:'c1',agentId:'boo1',status:'running'}];return undefined}
      if(method==='v9:stop'){snapshot.runs=[];return undefined}
      throw Error('Unsupported method '+method)
    }
  })
  const port=await gateway.listen(0),base='http://127.0.0.1:'+port
  browser=await chromium.launch({headless:true})
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1})
  const errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  const network=[]
  page.on('response',r=>{if(r.status()>=400)network.push([r.status(),r.url()])})
  await page.goto(base,{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Conectar ao seu host'}).waitFor()
  assert.ok((await page.locator('body').innerText()).includes('Abra o Boobot no computador'))
  assert.ok(!(await page.locator('body').innerText()).includes('Electron:'), 'Internal framework visible in PWA instructions')
  await page.screenshot({path:path.join(os.tmpdir(),'boobot-pwa-mobile-pair.png'),fullPage:true})
  const code=gateway.issueCode().code
  await page.getByLabel('Código de oito dígitos').fill(code)
  await page.getByRole('button',{name:'Conectar dispositivo'}).click()
  await page.getByText('Seus Boos, de onde você estiver.').waitFor()
  await page.getByRole('button',{name:'Abrir menu'}).click()
  await page.getByRole('button',{name:/Projeto Fictício/}).click()
  await page.getByRole('button',{name:'Abrir menu'}).click()
  await page.getByRole('button',{name:/Conversa de teste/}).first().click()
  await page.getByText('Mensagem do host de teste.').waitFor()
  await page.getByRole('heading',{name:'Plano do projeto',level:2}).waitFor({timeout:5000})
  const typography=await page.evaluate(()=>({
    heading:parseFloat(getComputedStyle(document.querySelector('.boobot-pwa-messages h2')).fontSize),
    paragraph:parseFloat(getComputedStyle(document.querySelector('.boobot-pwa-messages p')).fontSize),
    list:getComputedStyle(document.querySelector('.boobot-pwa-messages ul')).listStyleType,
  }))
  assert.ok(typography.heading>typography.paragraph,'Markdown headings must have visual hierarchy')
  assert.equal(typography.list,'disc','Markdown list markers must be visible')
  assert.equal(await page.locator('[data-slot="agent-code-block"]').count(),1)
  assert.equal(await page.getByRole('table').count(),1)
  assert.equal(await page.getByRole('link',{name:'Documentação'}).getAttribute('rel'),'noopener noreferrer')
  assert.equal(await page.locator('[data-slot="prompt-input"]').count(),1)
  assert.equal(await page.getByRole('button',{name:'Anexar arquivos'}).count(),0)
  const svgAvatars=await page.locator('.poli-avatar svg path').count()
  assert.ok(svgAvatars>=1,'PWA does not reuse PoliAvatar SVG')
  assert.ok(await page.getByRole('button',{name:'Enviar mensagem'}).isDisabled(),'Chat must default disabled')
  const sessions=gateway.status().devices
  assert.equal(sessions.length,1)
  gateway.setDevicePermissions(sessions[0].id,{chat:true,approvals:false})
  await page.waitForTimeout(7800)
  await page.getByLabel('Mensagem para o Boo').fill('Teste remoto de mensagem')
  await page.getByRole('button',{name:'Enviar mensagem'}).click()
  await page.getByText(/Mensagem enviada ao host/).waitFor()
  assert.ok(calls.find(([method,args])=>method==='v9:send' && args[0]==='c1' && args[1]==='Teste remoto de mensagem'))
  await page.getByRole('button',{name:'Parar agente'}).click()
  await page.getByText('Solicitação de parada enviada ao host.').waitFor()
  assert.ok(calls.find(([method,args])=>method==='v9:stop' && args[0]==='c1'))
  await page.getByRole('button',{name:'Fechar alerta'}).click()
  await page.screenshot({path:path.join(os.tmpdir(),'boobot-pwa-mobile-chat.png')})
  await page.getByRole('button',{name:'Abrir detalhes do projeto'}).click()
  await page.getByRole('button',{name:'Diff'}).click()
  await page.getByText('diff --git a/test.txt b/test.txt').waitFor()
  await page.getByRole('button',{name:'Arquivos'}).click()
  await page.getByText('src',{exact:true}).waitFor()
  const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,svg:document.querySelectorAll('.poli-avatar').length}))
  assert.equal(mobile.overflow,false)
  await page.screenshot({path:path.join(os.tmpdir(),'boobot-pwa-mobile-paired.png')})
  await page.locator('#inspector button[aria-label="Fechar detalhes"]').click()
  const desktop=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1})
  desktop.on('pageerror',err=>errors.push(err.message))
  await desktop.context().addCookies(await page.context().cookies(base))
  await desktop.goto(base,{waitUntil:'networkidle'})
  await desktop.getByText('Seus Boos, de onde você estiver.').waitFor()
  await desktop.getByRole('button',{name:/Projeto Fictício/}).click()
  await desktop.getByRole('button',{name:/Conversa de teste/}).first().click()
  await desktop.getByText('Mensagem do host de teste.').waitFor()
  await desktop.getByRole('heading',{name:'Plano do projeto',level:2}).waitFor()
  await desktop.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base})
  await desktop.getByRole('button',{name:'Copiar código'}).click()
  assert.equal((await desktop.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),'const marca = "Boobot";\n// ' + 'linha-longa-'.repeat(28))
  assert.equal(await desktop.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await desktop.screenshot({path:path.join(os.tmpdir(),'boobot-pwa-desktop.png'),fullPage:true})
  assert.deepEqual(errors,[])
  assert.deepEqual(network.filter(([status])=>status!==403),[])
  console.log(JSON.stringify({result:'PASS',gatewayPort:port,mobile,boos:2,chat:true,errors,network,
    typography,screenshots:['boobot-pwa-mobile-pair.png','boobot-pwa-mobile-chat.png','boobot-pwa-mobile-paired.png','boobot-pwa-desktop.png']},null,2))
}
main().catch(err=>{console.error(err);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(gateway)await gateway.close()})
