/** Coleção pequena desenhada para o Boo atual; IDs antigos permanecem somente nos dados legados. */
export const BOO_DETAILS = [
  { id: 'none', label: 'Sem detalhe', note: 'O Boo original' },
  { id: 'boo-sprout', label: 'Brotinho', note: 'Duas folhas delicadas' },
  { id: 'boo-star', label: 'Estrelinha', note: 'Um pequeno ponto de luz' },
  { id: 'boo-king-crown', label: 'Coroa de rei', note: 'Uma coroa dourada discreta' },
  { id: 'boo-halo', label: 'Auréola', note: 'Um brilho leve sobre a cabeça' },
  { id: 'boo-noel', label: 'Gorro de Natal', note: 'Para uma ocasião especial' },
] as const
export type BooDetailId = typeof BOO_DETAILS[number]['id']
export const BOO_DETAIL_IDS: string[] = BOO_DETAILS.map(detail => detail.id)
export function booDetailId(value: unknown): BooDetailId {
  return BOO_DETAILS.find(detail => detail.id === value)?.id || 'none'
}
