import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore } from './store'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('persistência do Poli Studio', () => {
  it('persiste a promoção e remoção do papel Chief após reiniciar o banco', () => {
    const dir = mkdtempSync(join(tmpdir(), 'politron-chief-'))
    dirs.push(dir)
    const store = new WorkspaceStore(dir)
    const agent = store.saveAgent({ name: 'Atlas', alias: 'atlas', instructions: 'Organize tarefas.' })
    expect(store.agent(agent.id).role).toBe('agent')
    store.saveAgent({ ...agent, role: 'chief' })
    expect(store.snapshot().agents.find(item => item.id === agent.id)?.role).toBe('chief')
    store.db.close()
    const reopened = new WorkspaceStore(dir)
    expect(reopened.agent(agent.id).role).toBe('chief')
    reopened.saveAgent({ ...reopened.agent(agent.id), role: 'agent' })
    expect(reopened.agent(agent.id).role).toBe('agent')
    reopened.db.close()
  })

  it('salva e recupera olhos, bochechas, animação e formato após reabrir o banco', () => {
    const dir = mkdtempSync(join(tmpdir(), 'politron-poli-'))
    dirs.push(dir)
    const store = new WorkspaceStore(dir)
    const agent = store.saveAgent({
      name: 'Pits', alias: 'pits', instructions: 'Responda com clareza.',
      color: '#4098eb', pitsShape: 'long', pitsEyeColor: '#ffffee',
      pitsCheekColor: '#ee99aa', pitsEyeSize: 12, pitsEyeSpacing: 30,
      pitsBlush: false, pitsAura: false, pitsAnimate: false, pitsSpeed: 4, pitsAmplitude: 17,
    })
    store.db.close()
    const reopened = new WorkspaceStore(dir)
    const saved = reopened.agent(agent.id)
    expect(saved).toMatchObject({
      color: '#4098eb', pitsShape: 'long', pitsEyeColor: '#ffffee',
      pitsCheekColor: '#ee99aa', pitsEyeSize: 12, pitsEyeSpacing: 30,
      pitsBlush: false, pitsAura: false, pitsAnimate: false, pitsSpeed: 4, pitsAmplitude: 17,
    })
    reopened.db.close()
  })
})

describe('cor sorteada para um Pit novo', () => {
  it('sorteia uma cor da paleta quando nenhuma é informada, inclusive quando o Chief cria o agente sem escolher cor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'politron-cor-'))
    dirs.push(dir)
    const store = new WorkspaceStore(dir)
    const agent = store.saveAgent({ name: 'Nina Frontend', alias: 'nina', instructions: 'Cuide do frontend.' })
    expect(agent.color).toMatch(/^#[\da-f]{6}$/i)
    expect(agent.color).not.toBe('#6366f1')
    store.db.close()
  })

  it('preserva a cor já escolhida ao atualizar o agente sem mandar cor de novo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'politron-cor-manter-'))
    dirs.push(dir)
    const store = new WorkspaceStore(dir)
    const agent = store.saveAgent({ name: 'Nina', alias: 'nina', instructions: 'x', color: '#32b6a0' })
    const updated = store.saveAgent({ id: agent.id, name: 'Nina Frontend', alias: 'nina', instructions: 'x' })
    expect(updated.color).toBe('#32b6a0')
    store.db.close()
  })
})
