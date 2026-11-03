// Painel do Board na Web UI do DSH. Só tokens --dsw-alias-*; nenhum pacote Client do DSH é importado.
window.__ModuleLoader__.load({
  id: '@boobot/board',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const LABELS = { backlog: 'Backlog', ready: 'Pronto', queued: 'Na fila', doing: 'Em andamento', review: 'Revisão', rework: 'Ajustes', integration: 'Integração', blocked: 'Bloqueado', done: 'Concluído', cancelled: 'Cancelado' }
    const COLUMNS = ['backlog', 'ready', 'doing', 'review', 'rework', 'blocked', 'done']

    const css = `
.bb-page{box-sizing:border-box;height:100%;overflow:auto;padding:calc(var(--dsh-frame-top-clearance,48px)) 24px 24px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
.bb-title{margin:0 0 4px;font-size:20px;line-height:28px;font-weight:600}
.bb-sub{margin:0 0 16px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.bb-cols{display:flex;gap:12px;align-items:flex-start;overflow-x:auto;padding-bottom:8px}
.bb-col{flex:0 0 260px;display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-2)}
.bb-col h3{margin:0 4px;font-size:12px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.bb-card{padding:10px 12px;border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:0 0 0 .5px var(--dsw-alias-border-strong,rgba(127,127,127,.3))}
.bb-card b{display:block;font-size:13px;line-height:20px;font-weight:500}
.bb-meta{margin-top:4px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.bb-empty{padding:16px;border:.5px dashed var(--dsw-alias-border-strong,rgba(127,127,127,.4));border-radius:var(--dsw-radius-md,12px);font-size:13px;color:var(--dsw-alias-label-secondary)}
.bb-boos{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.bb-boo{display:flex;align-items:center;gap:6px;padding:4px 6px 4px 12px;border-radius:999px;font-size:13px;line-height:20px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.bb-boo small{font-size:12px;color:var(--dsw-alias-label-secondary)}
.bb-btn{font:inherit;font-size:12px;line-height:20px;padding:2px 10px;border:.5px solid var(--dsw-alias-border-strong,rgba(127,127,127,.4));border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}
.bb-btn:hover{background:var(--dsw-alias-bg-layer-1)}
.bb-form{display:grid;gap:8px;max-width:520px;margin:0 0 20px;padding:12px;border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-2)}
.bb-form input,.bb-form textarea{font:inherit;font-size:13px;padding:6px 10px;border:.5px solid var(--dsw-alias-border-strong,rgba(127,127,127,.4));border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.bb-form textarea{min-height:64px;resize:vertical}
.bb-err{margin:0 0 12px;font-size:13px;color:var(--dsw-alias-label-primary)}
`

    // Ponto único de acesso aos dados: GET na rota do Host (`/boobot/board.json`), mesma origem do Web GUI.
    async function load() {
      const response = await fetch('/boobot/board.json', { cache: 'no-store' })
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Board indisponível (${response.status})`)
      return response.json()
    }

    // Ações do cadastro de Boos: POST na mesma rota; a resposta já é o Board atualizado.
    async function post(body) {
      const response = await fetch('/boobot/board.json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `Falhou (${response.status})`)
      return result
    }

    function BooForm({ onDone, onError }) {
      const [form, setForm] = React.useState({ name: '', description: '', instructions: '' })
      const [busy, setBusy] = React.useState(false)
      const set = key => event => setForm({ ...form, [key]: event.target.value })
      const submit = async event => {
        event.preventDefault()
        setBusy(true)
        try { onDone(await post({ action: 'agent_create', ...form })); setForm({ name: '', description: '', instructions: '' }) } catch (reason) { onError(String(reason?.message || reason)) } finally { setBusy(false) }
      }
      return h('form', { className: 'bb-form', onSubmit: submit, 'aria-label': 'Novo Boo' },
        h('input', { value: form.name, onChange: set('name'), placeholder: 'Nome do Boo', 'aria-label': 'Nome do Boo', required: true, maxLength: 60 }),
        h('input', { value: form.description, onChange: set('description'), placeholder: 'Função em uma frase', 'aria-label': 'Função', maxLength: 500 }),
        h('textarea', { value: form.instructions, onChange: set('instructions'), placeholder: 'Instruções (opcional)', 'aria-label': 'Instruções' }),
        h('div', null, h('button', { type: 'submit', className: 'bb-btn', disabled: busy }, busy ? 'Criando…' : 'Criar Boo')))
    }

    function BoardPage() {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      React.useEffect(() => {
        let alive = true
        const tick = () => load().then(value => { if (alive) { setData(value); setError('') } }, reason => { if (alive) setError(String(reason?.message || reason)) })
        tick()
        const timer = setInterval(tick, 5000)
        return () => { alive = false; clearInterval(timer) }
      }, [])

      const tasks = data?.tasks ?? []
      return h('div', { className: 'bb-page' },
        h('style', null, css),
        h('h2', { className: 'bb-title' }, 'Board da empresa'),
        h('p', { className: 'bb-sub' }, data ? `${data.agents.filter(agent => agent.role !== 'chief').length} Boos${data.agents.some(agent => agent.role === 'chief') ? ' + Chief' : ''} · ${data.teams.length} equipes · ${tasks.length} cartões` : (error ? '' : 'Carregando…')),
        data && h('div', { className: 'bb-boos', 'aria-label': 'Boos' }, data.agents.map(agent => h('span', { key: agent.id, className: 'bb-boo', title: agent.description || '' },
          agent.name, agent.role === 'chief' ? h('small', null, 'Chief') : h('button', { type: 'button', className: 'bb-btn', 'aria-label': `Arquivar ${agent.name}`,
            onClick: () => post({ action: 'agent_archive', id: agent.id }).then(value => { setData(value); setError('') }, reason => setError(String(reason?.message || reason))) }, 'Arquivar')))),
        data && h(BooForm, { onDone: value => { setData(value); setError('') }, onError: setError }),
        error && h('p', { className: 'bb-err', role: 'alert' }, error),
        data && !tasks.length && h('div', { className: 'bb-empty' }, 'Nenhum cartão ainda. Peça ao Chief para criar uma equipe e uma tarefa.'),
        h('div', { className: 'bb-cols' }, COLUMNS.map(status => {
          const items = tasks.filter(task => task.status === status)
          return h('section', { key: status, className: 'bb-col', 'aria-label': LABELS[status] },
            h('h3', null, `${LABELS[status]} · ${items.length}`),
            items.map(task => h('article', { key: task.id, className: 'bb-card' },
              h('b', null, task.title),
              h('div', { className: 'bb-meta' }, [task.team, task.assigneeAgentId && `→ ${task.assigneeAgentId}`].filter(Boolean).join(' · ')))))
        })))
    }

    function Icon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 },
        h('rect', { x: 2, y: 2.5, width: 3.5, height: 11, rx: 1 }), h('rect', { x: 6.25, y: 2.5, width: 3.5, height: 7, rx: 1 }), h('rect', { x: 10.5, y: 2.5, width: 3.5, height: 9, rx: 1 }))
    }

    const exports = {
      name: '@boobot/board',
      inject: ['slots'],
      apply(ctx) {
        // Ícone na lista da sidebar (`id`) e painel no slot `main` (`key` = mesmo id).
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'boobot-board', order: 40, label: () => 'Board' }, () => h(Icon)))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'boobot-board' }, () => h(BoardPage)))
      },
    }
    return exports
  },
})
