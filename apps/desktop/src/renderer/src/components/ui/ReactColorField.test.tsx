import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReactColorField } from './ReactColorField'

vi.mock('react-color', () => ({
  ChromePicker: ({color,onChange}: {color:string;onChange:(result:{hex:string})=>void}) =>
    <button type="button" aria-label="Selecionar no React Color" data-value={color}
      onClick={() => onChange({hex:'#aabbcc'})}>React Color</button>,
}))
describe('React Color compartilhado',()=>{
  it('renderiza o picker fora de ancestrais com overflow para evitar recorte',()=>{
    render(<div data-testid="clipped-container" className="overflow-hidden"><ReactColorField label="Cor do Boo" value="#123456" onChange={vi.fn()}/></div>)
    fireEvent.click(screen.getByRole('button',{name:'Cor do Boo'}))
    const dialog=screen.getByRole('dialog',{name:'Selecionar Cor do Boo'})
    expect(screen.getByTestId('clipped-container').contains(dialog)).toBe(false)
    expect(dialog).toHaveAttribute('data-side', 'top')
  })

  it('abre o picker, altera a cor e fecha usando Escape',()=>{
    const onChange=vi.fn()
    render(<ReactColorField label="Cor do Boo" value="#123456" onChange={onChange}/>)
    fireEvent.click(screen.getByRole('button',{name:'Cor do Boo'}))
    expect(screen.getByRole('dialog',{name:'Selecionar Cor do Boo'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Selecionar no React Color'}))
    expect(onChange).toHaveBeenCalledWith('#aabbcc')
    fireEvent.keyDown(document,{key:'Escape'})
    expect(screen.queryByRole('dialog',{name:'Selecionar Cor do Boo'})).not.toBeInTheDocument()
  })
})
