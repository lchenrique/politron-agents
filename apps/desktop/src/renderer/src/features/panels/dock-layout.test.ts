import { describe, expect, it } from 'vitest'
import { changeRatio, developmentDockLayout, deserializeDockLayout, fileTab, groupWithTab, groups, initialDockLayout, placeTab, pruneEmpty, removeGroup, splitGroup, toolTab } from './dock-layout'

describe('árvore de docking com múltiplos painéis', () => {
  it('permite chat esquerda, editor centro, explorador direita e terminal inferior', () => {
    const first = initialDockLayout()
    const chat = groups(first.root)[0]
    let state = splitGroup(first, chat.id, 'right', fileTab('ws', 'src/index.ts'))
    const editor = groupWithTab(state.root, 'file:ws:src%2Findex.ts')!
    state = splitGroup(state, editor.id, 'right', toolTab('files'))
    const files = groupWithTab(state.root, 'files')!
    state = splitGroup(state, editor.id, 'bottom', toolTab('terminal'))
    const terminals = groupWithTab(state.root, 'terminal')!
    expect(groups(state.root)).toHaveLength(4)
    expect(state.root.type).toBe('split')
    expect(groupWithTab(state.root, 'chat')?.id).toBe(chat.id)
    expect(groupWithTab(state.root, 'files')?.id).toBe(files.id)
    expect(groupWithTab(state.root, 'terminal')?.id).toBe(terminals.id)
    expect(groupWithTab(state.root, editor.tabs[0].id)?.id).toBe(editor.id)
    const restored = deserializeDockLayout(JSON.parse(JSON.stringify(state)))
    expect(groups(restored.root)).toHaveLength(4)
    expect(groupWithTab(restored.root, 'terminal')?.id).toBe(terminals.id)
  })

  it('movimenta cada ferramenta sem duplicar conteúdo e recolhe grupos vazios', () => {
    let state = initialDockLayout()
    const main = groups(state.root)[0]
    state = splitGroup(state, main.id, 'right', toolTab('files'))
    const side = groupWithTab(state.root, 'files')!
    state = placeTab(state, toolTab('chat'), side.id)
    expect(groups(state.root).flatMap(item => item.tabs).filter(tab => tab.kind === 'chat')).toHaveLength(1)
    state = pruneEmpty(state)
    expect(groups(state.root)).toHaveLength(1)
    expect(groups(state.root)[0].tabs.map(tab => tab.kind)).toEqual(['files', 'chat'])
  })

  it('redimensiona splits e permite remover grupos vazios, preservando outros', () => {
    let state = initialDockLayout()
    state = splitGroup(state, groups(state.root)[0].id, 'bottom')
    expect(groups(state.root)).toHaveLength(2)
    const split = state.root
    expect(split.type).toBe('split')
    if (split.type !== 'split') return
    state = changeRatio(state, split.id, 71)
    expect(state.root.type === 'split' && state.root.ratio).toBe(71)
    expect(changeRatio(state, split.id, 3).root.type === 'split' && (changeRatio(state, split.id, 3).root as typeof split).ratio).toBe(18)
    const empty = groups(state.root).find(group => !group.tabs.length)!
    state = removeGroup(state, empty.id)
    expect(groups(state.root)).toHaveLength(1)
    expect(groupWithTab(state.root, 'chat')).toBeDefined()
  })

  it('migra layout anterior sem perder localização das abas', () => {
    const previous = {
      main: { tabs: [toolTab('chat'), fileTab('ws', 'README.md')], active: 'chat' },
      side: { tabs: [toolTab('terminal'), toolTab('files')], active: 'terminal' },
      position: 'left', size: 37,
    }
    const state = deserializeDockLayout(previous)
    expect(groups(state.root)).toHaveLength(2)
    expect(groupWithTab(state.root, 'terminal')).toBeDefined()
    expect(groupWithTab(state.root, 'file:ws:README.md')).toBeDefined()
    expect(state.root.type === 'split' && state.root.ratio).toBe(37)
  })

  it('monta layout pronto de quatro painéis, preservando abas de arquivos e ferramentas', () => {
    let before = initialDockLayout()
    before = placeTab(before, fileTab('ws', 'src/App.tsx'), groups(before.root)[0].id)
    before = splitGroup(before, groups(before.root)[0].id, 'right', toolTab('mascot'))
    const preset = developmentDockLayout(before)
    expect(groups(preset.root)).toHaveLength(4)
    expect(groupWithTab(preset.root, 'chat')).toBeDefined()
    expect(groupWithTab(preset.root, 'files')).toBeDefined()
    expect(groupWithTab(preset.root, 'terminal')).toBeDefined()
    expect(groupWithTab(preset.root, fileTab('ws', 'src/App.tsx').id)).toBeDefined()
    expect(groupWithTab(preset.root, 'mascot')).toBeDefined()
    expect(preset.root.type === 'split' && preset.root.axis).toBe('vertical')
    const restored = deserializeDockLayout(JSON.parse(JSON.stringify(preset)))
    expect(groups(restored.root)).toHaveLength(4)
  })

  it('não aceita duplicações ou layouts corrompidos', () => {
    const invalid = {
      type: 'split', id: 'x', axis: 'vertical', ratio: -10,
      first: { type: 'group', id: 'g1', tabs: [toolTab('chat'), toolTab('chat')], active: 'chat' },
      second: { type: 'group', id: 'g2', tabs: [], active: '' },
    }
    const state = deserializeDockLayout({ root: invalid, activeGroup: 'g1' })
    expect(groups(state.root).flatMap(group => group.tabs).filter(tab => tab.id === 'chat')).toHaveLength(1)
    expect(state.root.type === 'split' && state.root.ratio).toBe(18)
    expect(groups(deserializeDockLayout(null).root)).toHaveLength(1)
  })
})
