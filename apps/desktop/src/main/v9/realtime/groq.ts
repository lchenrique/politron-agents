/** Cliente mínimo do Groq (API compatível com OpenAI): Whisper turbo e chat em streaming. */

const API = 'https://api.groq.com/openai/v1'
export const GROQ_TRANSCRIBE_MODEL = 'whisper-large-v3-turbo'

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ToolSpec { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

async function failure(response: Response): Promise<Error> {
  const body = await response.text().catch(() => '')
  if (response.status === 401) return new Error('Chave do Groq recusada. Confira a chave em console.groq.com/keys.')
  if (response.status === 429) return new Error('Limite gratuito do Groq atingido por enquanto. Espere um pouco e tente de novo.')
  return new Error(`Groq respondeu HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
}

export async function listGroqChatModels(key: string): Promise<string[]> {
  const response = await fetch(`${API}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw await failure(response)
  const data = await response.json() as { data?: { id: string; active?: boolean }[] }
  const skip = /whisper|tts|playai|orpheus|guard|prompt-guard|distil|compound/i
  return (data.data || []).filter(model => model.active !== false && !skip.test(model.id)).map(model => model.id).sort()
}

export async function transcribe(key: string, wav: Uint8Array, signal: AbortSignal, model = GROQ_TRANSCRIBE_MODEL): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([Buffer.from(wav)], { type: 'audio/wav' }), 'fala.wav')
  form.append('model', model)
  form.append('language', 'pt')
  form.append('response_format', 'json')
  form.append('temperature', '0')
  const response = await fetch(`${API}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal })
  if (!response.ok) throw await failure(response)
  return String(((await response.json()) as { text?: string }).text || '').trim()
}

export type ChatChunk = { type: 'text'; delta: string } | { type: 'tools'; calls: ToolCall[] }

/** Chat em streaming; devolve o texto em pedaços e, se o modelo pedir ferramentas, as chamadas completas no final. */
export async function* chatStream(key: string, model: string, messages: ChatMessage[], tools: ToolSpec[], signal: AbortSignal): AsyncGenerator<ChatChunk> {
  const body: Record<string, unknown> = { model, messages, stream: true, temperature: 0.6, max_completion_tokens: 400 }
  if (tools.length) { body.tools = tools; body.tool_choice = 'auto' }
  // Modelos de raciocínio do Groq: pouco raciocínio, para a primeira palavra sair rápido numa conversa falada.
  if (/gpt-oss/i.test(model)) { body.reasoning_effort = 'low'; body.include_reasoning = false }
  const response = await fetch(`${API}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  if (!response.ok || !response.body) throw await failure(response)
  const calls = new Map<number, ToolCall>()
  const decoder = new TextDecoder()
  let pending = ''
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() || ''
    for (const line of lines) {
      const data = line.startsWith('data:') ? line.slice(5).trim() : ''
      if (!data || data === '[DONE]') continue
      let parsed: any
      try { parsed = JSON.parse(data) } catch { continue }
      const delta = parsed.choices?.[0]?.delta
      if (delta?.content) yield { type: 'text', delta: delta.content }
      for (const call of delta?.tool_calls || []) {
        const current = calls.get(call.index) || { id: call.id || '', type: 'function' as const, function: { name: '', arguments: '' } }
        if (call.id) current.id = call.id
        if (call.function?.name) current.function.name += call.function.name
        if (call.function?.arguments) current.function.arguments += call.function.arguments
        calls.set(call.index, current)
      }
    }
  }
  if (calls.size) yield { type: 'tools', calls: [...calls.values()] }
}
