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
.bb-err{margin:0 0 12px;font-size:13px;color:var(--dsw-alias-label-primary)}
`

    // Ponto único de acesso aos dados: roda o comando /board e lê o JSON devolvido (ver README, "A confirmar").
    async function load(ctx) {
      const result = await ctx.remote.commands.execute('/board')
      if (!result || result.kind === 'error') throw new Error(result?.text || 'Não foi possível ler o Board.')
      return JSON.parse(result.text)
    }

    function BoardPage({ ctx }) {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      React.useEffect(() => {
        let alive = true
        const tick = () => load(ctx).then(value => { if (alive) { setData(value); setError('') } }, reason => { if (alive) setError(String(reason?.message || reason)) })
        tick()
        const timer = setInterval(tick, 5000)
        return () => { alive = false; clearInterval(timer) }
      }, [ctx])

      const tasks = data?.tasks ?? []
      return h('div', { className: 'bb-page' },
        h('style', null, css),
        h('h2', { className: 'bb-title' }, 'Board da empresa'),
        h('p', { className: 'bb-sub' }, data ? `${data.teams.length} equipes · ${tasks.length} cartões` : 'Carregando…'),
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

    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        // Painel global: ícone na lista da sidebar + componente no slot `main` com o mesmo id.
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'boobot-board', order: 40, label: 'Board' }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', id: 'boobot-board' }, () => h(BoardPage, { ctx })))
      },
    }
  },
})
