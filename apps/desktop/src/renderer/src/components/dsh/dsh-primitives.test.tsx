import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Menu, Modal, SegmentedTabs, Switch, Tooltip, type MenuEntry } from './index.ts'

function ModalHarness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => { setOpen(true) }}>abrir</button>
      <Modal open={open} onClose={() => { onClose?.(); setOpen(false) }} title="Novo projeto" description="Descrição" closeLabel="Fechar"
        footer={<button type="button">Criar</button>}>
        <input aria-label="Nome" data-modal-autofocus />
      </Modal>
    </>
  )
}

describe('Modal (DSH)', () => {
  it('abre com aria de diálogo, foca o campo marcado e fecha com Esc devolvendo o foco', () => {
    const onClose = vi.fn()
    render(<ModalHarness onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'abrir' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Novo projeto' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('data-dsh-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Novo projeto' })).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByLabelText('Nome'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('prende o Tab dentro do diálogo e fecha pelo botão Fechar', () => {
    render(<ModalHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'abrir' }))
    const dialog = screen.getByRole('dialog')
    const close = screen.getByRole('button', { name: 'Fechar' })
    const create = screen.getByRole('button', { name: 'Criar' })
    const focusables = [close, screen.getByLabelText('Nome'), create].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
    const last = focusables[focusables.length - 1] as HTMLElement
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(focusables[0])
    ;(focusables[0] as HTMLElement).focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.click(close)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('fecha ao clicar fora do cartão e devolve o foco ao acionador', () => {
    render(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: 'abrir' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Novo projeto' })
    const mask = dialog.parentElement?.querySelector('[aria-hidden="true"]')
    expect(mask).not.toBeNull()
    fireEvent.click(mask as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})

const ITEMS: MenuEntry[] = [
  { id: 'a', label: 'Renomear' },
  { id: 'b', label: 'Fixar', disabled: true },
  { id: 'c', label: 'Duplicar' },
  { type: 'separator', id: 's' },
  { id: 'd', label: 'Excluir', danger: true },
]

function MenuHarness({ onSelect }: { onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <Menu open={open} autoFocus items={ITEMS} onSelect={id => { onSelect(id); setOpen(false) }} onClose={() => { setOpen(false) }}
      anchor={<button type="button">menu</button>} />
  )
}

describe('Menu (DSH)', () => {
  it('navega com setas pulando itens desativados, Home/End, e seleciona com Enter', () => {
    const onSelect = vi.fn()
    render(<MenuHarness onSelect={onSelect} />)
    const menu = screen.getByRole('menu')
    const items = screen.getAllByRole('menuitem')
    expect(items.map(item => item.textContent)).toEqual(['Renomear', 'Fixar', 'Duplicar', 'Excluir'])
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[2])
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(items[3])
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[3])
    fireEvent.click(items[2] as HTMLElement)
    expect(onSelect).toHaveBeenCalledWith('c')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('fecha com Esc', () => {
    render(<MenuHarness onSelect={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Tooltip (DSH)', () => {
  // A bolha monta escondida até o ResizeObserver medir (o jsdom não mede), então a consulta inclui ocultos.
  it('aparece no hover e no foco e some ao sair', () => {
    vi.useFakeTimers()
    try {
      render(<Tooltip label="Dica" side="bottom"><button type="button">alvo</button></Tooltip>)
      const target = screen.getByRole('button', { name: 'alvo' })
      fireEvent.pointerEnter(target, { pointerType: 'mouse' })
      fireEvent.mouseEnter(target)
      act(() => { vi.runAllTimers() })
      expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Dica')
      fireEvent.pointerLeave(target, { pointerType: 'mouse' })
      fireEvent.mouseLeave(target)
      act(() => { vi.runAllTimers() })
      expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument()
      act(() => { target.focus() })
      act(() => { vi.runAllTimers() })
      expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Dica')
    } finally {
      vi.useRealTimers()
    }
  })
})

function TabsHarness() {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a')
  return (
    <SegmentedTabs value={value} onChange={setValue} label="Painel" items={[
      { value: 'a', label: 'Chat', id: 't-a', panelId: 'p-a' },
      { value: 'b', label: 'Arquivos', id: 't-b', panelId: 'p-b' },
      { value: 'c', label: 'Git', id: 't-c', panelId: 'p-c' },
    ]} />
  )
}

describe('SegmentedTabs (DSH)', () => {
  it('é uma tablist com uma aba ativa por vez e muda por clique e setas', () => {
    render(<TabsHarness />)
    expect(screen.getByRole('tablist', { name: 'Painel' })).toBeInTheDocument()
    const [chat, files, git] = screen.getAllByRole('tab')
    expect(chat).toHaveAttribute('aria-selected', 'true')
    expect(chat).toHaveAttribute('aria-controls', 'p-a')
    fireEvent.click(files as HTMLElement)
    expect(files).toHaveAttribute('aria-selected', 'true')
    expect(chat).toHaveAttribute('aria-selected', 'false')
    fireEvent.keyDown(files as HTMLElement, { key: 'ArrowRight' })
    expect(git).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(git)
    fireEvent.keyDown(git as HTMLElement, { key: 'Home' })
    expect(chat).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Switch (DSH)', () => {
  it('expõe role switch com aria-checked e alterna', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Switch checked={false} onChange={onChange} label="Ativar" />)
    const control = screen.getByRole('switch', { name: 'Ativar' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<Switch checked onChange={onChange} label="Ativar" disabled />)
    expect(control).toHaveAttribute('aria-checked', 'true')
    expect(control).toBeDisabled()
  })
})
