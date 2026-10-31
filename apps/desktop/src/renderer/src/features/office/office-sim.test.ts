import { describe, expect, it } from 'vitest'
import { createSim, frontOf, seatOf, stepSim, type OfficeLayout, type SimDesk } from './office-sim'

const layout: OfficeLayout = {
  width: 10, depth: 8, chiefId: 'chief',
  desks: { chief: { x: 5, y: 2 }, freya: { x: 2, y: 5 }, tyr: { x: 7, y: 5 } },
  pois: [{ id: 'coffee', kind: 'coffee', at: { x: 9, y: 1 } }, { id: 'plant', kind: 'plant', at: { x: 1, y: 1 } }, { id: 'sofa', kind: 'sofa', at: { x: 1, y: 7 } }],
}
const fixed = (value: number) => () => value
const run = (sim: ReturnType<typeof createSim>, desks: SimDesk[], seconds: number, rng = fixed(0.4)) => { for (let t = 0; t < seconds; t += 0.1) stepSim(sim, layout, desks, 0.1, rng); return sim }
const desks = (active: Record<string, boolean>, fromChief: Record<string, boolean> = {}): SimDesk[] => ['chief', 'freya', 'tyr'].map(id => ({ id, active: !!active[id], fromChief: !!fromChief[id] }))

describe('simulação do escritório', () => {
  it('quem trabalha vai para a mesa e fica sentado; quem está livre passeia', () => {
    const sim = run(createSim(), desks({ freya: true }), 0.1)
    expect(sim.actors.get('freya')).toMatchObject({ mode: 'desk', pos: seatOf(layout.desks.freya!) })
    run(sim, desks({ freya: true }), 12)
    expect(sim.actors.get('freya')!.mode).toBe('desk')
    const tyr = sim.actors.get('tyr')!
    expect(tyr.pos).not.toEqual(seatOf(layout.desks.tyr!))
    expect(['walking', 'idle', 'talk', 'sleep']).toContain(tyr.mode)
  })

  it('delegação nova do Chief: ele leva o papel até a mesa do Boo e volta para a dele', () => {
    const sim = run(createSim(), desks({ chief: true }), 0.1)
    stepSim(sim, layout, desks({ chief: true, tyr: true }, { tyr: true }), 0.1)
    const chief = sim.actors.get('chief')!
    expect(chief.errand).toMatchObject({ kind: 'deliver', target: 'tyr' })
    let sawPaper = false
    for (let t = 0; t < 20 && chief.errand; t += 0.1) { stepSim(sim, layout, desks({ chief: true, tyr: true }, { tyr: true }), 0.1); if (chief.badge === 'paper') { sawPaper = true; expect(chief.pos).toEqual(frontOf(layout.desks.tyr!)) } }
    expect(sawPaper).toBe(true)
    run(sim, desks({ chief: true, tyr: true }, { tyr: true }), 10)
    expect(chief).toMatchObject({ mode: 'desk', pos: seatOf(layout.desks.chief!) })
  })

  it('ao terminar uma tarefa do Chief, o Boo vai até a mesa dele com o ✓ e depois volta a passear', () => {
    const sim = run(createSim(), desks({ freya: true }, { freya: true }), 0.5)
    stepSim(sim, layout, desks({}, {}), 0.1)
    const freya = sim.actors.get('freya')!
    expect(freya.errand).toMatchObject({ kind: 'report', target: 'chief' })
    let sawCheck = false
    for (let t = 0; t < 20 && freya.errand; t += 0.1) { stepSim(sim, layout, desks({}), 0.1); if (freya.badge === 'check') { sawCheck = true; expect(freya.pos).toEqual(frontOf(layout.desks.chief!)) } }
    expect(sawCheck).toBe(true)
    expect(freya.errand).toBeUndefined()
  })

  it('remove quem saiu e não cria Boo sem mesa', () => {
    const sim = run(createSim(), desks({}), 0.1)
    stepSim(sim, layout, [{ id: 'chief', active: false, fromChief: false }, { id: 'sem-mesa', active: true, fromChief: false }], 0.1)
    expect([...sim.actors.keys()]).toEqual(['chief'])
  })
})
