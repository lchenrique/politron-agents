'use strict'
/* Boobot PWA F1: browser-only UI. No host secrets, direct filesystem or native execution. */
const $ = id => document.getElementById(id)
const state = {
  snapshot: null, host: null, workspaceId: null, conversationId: null,
  messages: [], panel: 'activity', busy: false, timer: null, status: 'offline',
}
const labels = { completed: 'Concluído', running: 'Em andamento', queued: 'Na fila', waiting: 'Aguardando', failed: 'Falhou', interrupted: 'Interrompido' }
const when = time => { try { return new Date(time).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) } catch { return '' } }

function node(tag, cls, value) {
  const element = document.createElement(tag)
  if (cls) element.className = cls
  if (value !== undefined) element.textContent = String(value)
  return element
}
function clear(element) { element.replaceChildren() }
function notify(message) {
  const toast = $('toast'); toast.textContent = message; toast.style.display = 'block'
  clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.style.display = 'none', 4600)
}
async function request(path, payload) {
  const init = path === '/api/status' ? { credentials: 'same-origin', cache: 'no-store' } : {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Boobot-PWA': '1' },
    body: JSON.stringify(payload || {}),
  }
  const response = await fetch(path, init)
  let data
  try { data = await response.json() } catch { throw Error('Resposta inválida do host.') }
  if (!response.ok) { const error = Error(data.error || 'Falha de conexão.'); error.status = response.status; throw error }
  return data
}
async function rpc(method, ...args) { const response = await request('/api/rpc', { method, args }); return response.result }
function pairScreen(visible) { $('pairing').hidden = !visible; $('app').hidden = visible }
function menu(open) {
  $('inspector').classList.remove('open')
  $('sidebar').classList.toggle('open', open)
  $('scrim').hidden = !open
}
function details(open) {
  $('sidebar').classList.remove('open')
  $('inspector').classList.toggle('open', open)
  $('scrim').hidden = !open
}
function workspace() { return state.snapshot?.workspaces?.find(item => item.id === state.workspaceId) }
function conversation() { return state.snapshot?.conversations?.find(item => item.id === state.conversationId) }
function status(value) {
  state.status = value
  $('sync-state').textContent = value === 'online' ? '● Sincronizado' : value === 'loading' ? '◌ Atualizando…' : '● Sem conexão'
  $('sync-state').style.color = value === 'offline' ? '#ffb2c2' : '#9ce5ca'
}
function infoCard(title, description, pill) {
  const card = node('div', 'detail-card'), h = node('h4', '', title), p = node('p', '', description)
  card.append(h, p)
  if (pill) card.append(node('span', 'small-pill', pill))
  return card
}
function activePanel(panel) {
  state.panel = panel
  document.querySelectorAll('[data-panel]').forEach(el => el.classList.toggle('active', el.dataset.panel === panel))
  void inspect()
}
async function inspect() {
  const panel = $('inspector-body'); clear(panel)
  const space = workspace()
  if (!space) { panel.append(node('p', 'muted', 'Selecione um projeto para explorar.')); return }
  if (state.panel === 'activity') {
    const runs = (state.snapshot?.runs || []).filter(r => r.workspaceId === space.id).slice(-12).reverse()
    const approvals = (state.snapshot?.approvals || []).filter(a => a.status === 'pending' && runs.some(r => r.id === a.runId))
    panel.append(infoCard('Projeto', space.name, space.branch ? 'Branch: ' + space.branch : 'Local'))
    if (approvals.length) { panel.append(node('p', 'muted', 'APROVAÇÕES PENDENTES (somente visualização)')); for (const a of approvals) panel.append(infoCard(a.kind, a.details?.action || a.details?.path || 'Aguardando autorização', when(a.createdAt))) }
    panel.append(node('p', 'muted', 'EXECUÇÕES RECENTES'))
    if (!runs.length) panel.append(node('p', 'muted', 'Nenhuma execução registrada.'))
    for (const run of runs) panel.append(infoCard(run.agent?.name || run.agentId || 'Boo', run.input?.slice(0, 180) || 'Execução', labels[run.status] || run.status))
  } else if (state.panel === 'diff') {
    panel.append(node('p', 'muted', 'Alterações do workspace'))
    try {
      const diff = await rpc('v9:workspaceDiff', space.id)
      panel.append(node('pre', '', typeof diff === 'string' ? diff.slice(0, 160_000) || 'Sem alterações pendentes.' : 'Sem alterações disponíveis.'))
    } catch (error) { panel.append(node('p', 'muted', error.message)) }
  } else if (state.panel === 'files') {
    panel.append(node('p', 'muted', 'Arquivos do projeto · leitura'))
    try {
      const files = await rpc('v9:listProjectFiles', space.id, '')
      const ul = node('ul', 'file-list')
      for (const file of (Array.isArray(files) ? files : []).slice(0, 200)) {
        const li = node('li')
        li.append(node('span', 'file-icon', file.directory ? '▤' : '◇'), document.createTextNode(file.name))
        ul.append(li)
      }
      if (!ul.children.length) panel.append(node('p', 'muted', 'Nenhum arquivo listado.'))
      else panel.append(ul)
    } catch (error) { panel.append(node('p', 'muted', error.message)) }
  }
}
function renderSidebar() {
  const projects = $('projects'), conversations = $('conversations')
  clear(projects); clear(conversations)
  for (const p of (state.snapshot?.workspaces || []).filter(w => !w.archived)) {
    const button = node('button', 'item-button' + (p.id === state.workspaceId ? ' active' : ''))
    button.type = 'button'
    const icon = node('span', 'item-icon', p.kind === 'free' ? '✧' : '⌘')
    const name = node('span', 'item-name')
    name.append(node('strong', '', p.name), node('small', '', p.branch || (p.kind === 'free' ? 'Projeto livre' : 'Workspace local')))
    button.append(icon, name)
    button.addEventListener('click', () => { void selectWorkspace(p.id) })
    projects.append(button)
  }
  for (const c of (state.snapshot?.conversations || []).filter(c => !c.archived && c.workspaceId === state.workspaceId)) {
    const button = node('button', 'item-button' + (c.id === state.conversationId ? ' active' : ''))
    button.type = 'button'
    const name = node('span', 'item-name')
    name.append(node('strong', '', c.name || 'Conversa'), node('small', '', c.kind === 'group' ? 'Grupo de Boos' : 'Conversa direta'))
    button.append(node('span', 'item-icon', c.kind === 'group' ? '♧' : '✦'), name)
    button.addEventListener('click', () => { void selectConversation(c.id) })
    conversations.append(button)
  }
  if (!projects.children.length) projects.append(node('p', 'muted', 'Nenhum projeto neste host.'))
  if (!conversations.children.length) conversations.append(node('p', 'muted', 'Nenhuma conversa neste projeto.'))
}
function overview() {
  const box = $('overview'); clear(box)
  const data = [
    [state.snapshot?.workspaces?.filter(w => !w.archived).length || 0, 'Projetos'],
    [state.snapshot?.conversations?.filter(c => !c.archived).length || 0, 'Conversas'],
    [state.snapshot?.agents?.length || 0, 'Boos'],
  ]
  for (const [count, label] of data) {
    const item = node('div', 'stat')
    item.append(node('strong', '', count), node('small', '', label)); box.append(item)
  }
}
async function refreshMessages() {
  if (!state.conversationId) return
  const id = state.conversationId
  try {
    const data = await rpc('v9:historyPage', id, null, 65)
    if (id !== state.conversationId) return
    state.messages = Array.isArray(data?.messages) ? data.messages : []
    renderMessages()
  } catch (error) { notify(error.message) }
}
function renderMessages() {
  const box = $('message-list')
  clear(box)
  for (const message of state.messages) {
    const block = node('article', 'message' + (message.role === 'user' ? ' mine' : '') + (message.role === 'activity' ? ' activity' : ''))
    const heading = node('div', 'message-head')
    const agent = state.snapshot?.agents?.find(a => a.id === message.agentId)
    heading.append(node('strong', '', message.role === 'user' ? 'Você' : agent?.name || message.author || 'Boo'), node('time', '', when(message.createdAt)))
    block.append(heading, node('div', 'bubble', message.text || (message.role === 'activity' ? 'Atividade registrada.' : '…')))
    box.append(block)
  }
  if (!box.children.length) box.append(node('p', 'muted', 'Ainda não há mensagens nesta conversa.'))
  box.scrollTop = box.scrollHeight
}
async function selectWorkspace(id) {
  state.workspaceId = id; state.conversationId = null
  $('welcome').hidden = false; $('message-list').hidden = true
  $('breadcrumb').textContent = 'PROJETO'; $('page-title').textContent = workspace()?.name || 'Projeto'
  renderSidebar(); menu(false); activePanel('activity')
}
async function selectConversation(id) {
  state.conversationId = id
  $('welcome').hidden = true; $('message-list').hidden = false
  $('breadcrumb').textContent = workspace()?.name || 'CONVERSAS'
  $('page-title').textContent = conversation()?.name || 'Conversa'
  renderSidebar(); menu(false); await refreshMessages()
}
async function sync(first = false) {
  if (state.busy) return
  state.busy = true
  if (first) status('loading')
  try {
    const data = await rpc('v9:snapshot')
    state.snapshot = data
    if (state.workspaceId && !data.workspaces.some(w => w.id === state.workspaceId)) state.workspaceId = null
    if (state.conversationId && !data.conversations.some(c => c.id === state.conversationId)) state.conversationId = null
    renderSidebar(); overview()
    if (state.conversationId) await refreshMessages()
    if (state.panel === 'activity') await inspect()
    status('online')
  } catch (error) {
    status('offline')
    if (error.status === 401 || error.status === 409) { pairScreen(true); clearInterval(state.timer); state.timer = null }
    notify(error.message)
  } finally { state.busy = false }
}
async function init() {
  try {
    const result = await request('/api/status')
    if (!result.paired) { pairScreen(true); return }
    state.host = result.host
    $('host-name').textContent = result.host?.name || 'Host'
    pairScreen(false)
    await sync(true)
    clearInterval(state.timer)
    state.timer = setInterval(() => { if (!document.hidden) void sync() }, 9_000)
  } catch (error) { pairScreen(true); $('pair-error').textContent = error.message }
}
$('pair-form').addEventListener('submit', async event => {
  event.preventDefault()
  $('pair-error').textContent = ''
  const button = $('pair-button'); button.disabled = true
  try { await request('/api/pair', { code: $('pair-code').value.trim() }); $('pair-code').value = ''; await init() }
  catch (error) { $('pair-error').textContent = error.message }
  finally { button.disabled = false }
})
$('logout-button').addEventListener('click', async () => {
  try { await request('/api/logout', {}); clearInterval(state.timer); state.timer = null; state.snapshot = null; state.messages = []; pairScreen(true) }
  catch (error) { notify(error.message) }
})
$('refresh-button').addEventListener('click', () => void sync(true))
$('menu-button').addEventListener('click', () => menu(true))
$('close-menu').addEventListener('click', () => menu(false))
$('details-button').addEventListener('click', () => details(true))
$('close-details').addEventListener('click', () => details(false))
$('scrim').addEventListener('click', () => { menu(false); details(false) })
document.querySelectorAll('[data-panel]').forEach(el => el.addEventListener('click', () => activePanel(el.dataset.panel)))
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.snapshot) void sync() })
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined)
void init()
