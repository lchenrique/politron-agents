/** Markdown dos agentes para o subconjunto HTML do Telegram (parse_mode HTML), em blocos de até 4096 caracteres. */
export const TELEGRAM_LIMIT = 4096

/** O Telegram exige escapar só &, < e >; aspas viram &quot; para valer também dentro de href. */
export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Uma linha de texto comum. Nenhuma marcação atravessa linhas, então cada linha é HTML fechado. */
function inlineHtml(line: string): string {
  return line.split(/(`[^`\n]+`)/g).map((part, index) => {
    if (index % 2) return `<code>${escapeHtml(part.slice(1, -1))}</code>`
    return escapeHtml(part)
      .replace(/^#{1,6}\s+(.+)$/, '<b>$1</b>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      // Links http(s) viram <a>; caminhos relativos do projeto ficam só com o texto.
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => /^https?:\/\//i.test(url) ? `<a href="${url}">${label}</a>` : label)
  }).join('')
}

/** Divide o texto cru ao meio (de preferência numa quebra de linha) até o HTML gerado caber no limite. */
function fit(raw: string, limit: number, render: (value: string) => string): string[] {
  const html = render(raw)
  if (html.length <= limit) return [html]
  let cut = raw.lastIndexOf('\n', raw.length / 2)
  if (cut <= 0) { cut = Math.floor(raw.length / 2); if (/[\uDC00-\uDFFF]/.test(raw[cut] || '')) cut-- }
  return [...fit(raw.slice(0, cut), limit, render), ...fit(raw.slice(cut).replace(/^\n/, ''), limit, render)]
}

export function telegramChunks(markdown: string, limit = TELEGRAM_LIMIT): string[] {
  const units: string[] = []
  markdown.replace(/\r\n/g, '\n').split(/(```[^\n]*\n[\s\S]*?```)/g).forEach((part, index) => {
    if (index % 2) {
      const body = part.replace(/^```[^\n]*\n/, '').replace(/\n?```$/, '')
      for (const piece of fit(body, limit - '<pre></pre>'.length, escapeHtml)) units.push(`<pre>${piece}</pre>`)
    } else for (const line of part.replace(/^\n|\n$/g, '').split('\n')) units.push(...fit(line, limit, inlineHtml))
  })
  const chunks: string[] = []
  let current = ''
  for (const unit of units) {
    if (current && current.length + 1 + unit.length > limit) { chunks.push(current); current = unit }
    else current = current ? `${current}\n${unit}` : unit
  }
  if (current.trim()) chunks.push(current)
  return chunks.filter(chunk => chunk.trim())
}
