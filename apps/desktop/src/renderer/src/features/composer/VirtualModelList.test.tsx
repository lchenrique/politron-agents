import { createRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ModelChoice } from './model-options'
import { VirtualModelList } from './VirtualModelList'

const models: ModelChoice[] = Array.from({ length: 565 }, (_, index) => ({
  id: 'pi:provider/model-' + index,
  name: 'Modelo ' + String(index).padStart(3, '0'),
  provider: 'Pi',
  enabled: index !== 560,
}))

function Harness({ onChoose = vi.fn() }: { onChoose?: (id: string) => void }) {
  const [search, setSearch] = useState('')
  return <VirtualModelList models={models} providerName="Pi" value=""
    search={search} onSearchChange={setSearch} searchRef={createRef<HTMLInputElement | null>()} onChoose={onChoose} />
}

describe('lista virtualizada de modelos', () => {
  it('renderiza poucas linhas para um catálogo de 565 modelos, mas busca no catálogo inteiro', async () => {
    render(<Harness />)
    expect(screen.getByRole('listbox', { name: 'Modelos de Pi' })).toBeInTheDocument()
    expect(screen.getAllByRole('option').length).toBeLessThan(30)
    expect(screen.queryByText('Modelo 564')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar modelos' }), { target: { value: 'Modelo 564' } })
    expect(await screen.findByRole('option', { name: /Modelo 564/ })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('permite escolher por teclado após filtrar e pula modelos indisponíveis', async () => {
    const onChoose = vi.fn()
    render(<Harness onChoose={onChoose} />)
    const search = screen.getByRole('combobox', { name: 'Buscar modelos' })
    fireEvent.change(search, { target: { value: 'Modelo 56' } })
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(5))
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Modelo 560/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).toHaveBeenCalledWith('pi:provider/model-561')
    expect(onChoose).toHaveBeenCalledTimes(1)
  })
})
