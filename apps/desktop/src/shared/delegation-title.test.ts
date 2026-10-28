import { describe, expect, it } from 'vitest'
import { conversationDisplayName, delegatedConversationName, delegationTitle } from './delegation-title'

describe('títulos de delegação', () => {
  it('prefere a linha de tarefa e ignora o contexto', () => {
    expect(delegationTitle('Contexto: monorepo BubbleDesk, SaaS multi-tenant.\nTarefa: revisar o fluxo de login. Depois relate.')).toBe('revisar o fluxo de login')
    expect(delegationTitle('Contexto: monorepo BubbleDesk. Tarefa: mapear as rotas da API')).toBe('mapear as rotas da API')
  })

  it('usa a primeira frase sem rótulo e corta textos longos', () => {
    expect(delegationTitle('Contexto: monorepo BubbleDesk, SaaS multi-tenant. Outra frase.')).toBe('monorepo BubbleDesk, SaaS multi-tenant')
    expect(delegationTitle('a'.repeat(200), 20)).toBe('a'.repeat(19) + '…')
    expect(delegationTitle('   ')).toBe('Pedido')
  })

  it('nomeia a conversa delegada com até 50 caracteres', () => {
    const name = delegatedConversationName('Examen', 'Contexto: monorepo BubbleDesk, SaaS multi-tenant com várias filas de mensagens e workers')
    expect(name.startsWith('Examen · monorepo BubbleDesk')).toBe(true)
    expect(name.length).toBeLessThanOrEqual(50)
  })

  it('exibe conversas antigas no formato curto', () => {
    expect(conversationDisplayName('Pedido: Mimir · Contexto: monorepo BubbleDesk, SaaS')).toBe('Mimir · monorepo BubbleDesk, SaaS')
    expect(conversationDisplayName('Minha conversa')).toBe('Minha conversa')
  })
})
