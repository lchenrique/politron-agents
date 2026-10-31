import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentSkills } from './AgentSkills'

const original = window.skillsAPI
afterEach(() => { window.skillsAPI = original })

it('lista só skills do Marketplace e marca/desmarca pelo slug', async () => {
  window.skillsAPI = { ...original, list: vi.fn(async () => [
    { id: 'marketplace:virality', name: 'virality', description: 'Ganchos', source: 'marketplace', path: 'x' },
    { id: 'claude:/x', name: 'global', description: 'Global', source: 'claude', path: 'y' },
  ]) } as typeof window.skillsAPI
  const onChange = vi.fn()
  const { rerender } = render(<AgentSkills value={[]} onChange={onChange} />)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'virality' }))
  expect(onChange).toHaveBeenCalledWith(['virality'])
  expect(screen.queryByRole('checkbox', { name: 'global' })).toBeNull()
  rerender(<AgentSkills value={['virality']} onChange={onChange} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'virality' }))
  expect(onChange).toHaveBeenLastCalledWith([])
})
