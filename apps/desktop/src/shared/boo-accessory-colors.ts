/** Paletas por acessório, compartilhadas entre armazenamento, SVG e o overlay Rive. */
export type BooAccessoryColors = Record<string, string[]>

export const BOO_ACCESSORY_IDS = [
  'antenna', 'horns', 'cap', 'cap-flat', 'cap-back', 'beanie', 'bucket',
  'top-hat', 'witch-hat', 'headphones', 'crown', 'party-hat', 'chef-hat',
  'bow', 'flower', 'halo', 'glasses', 'round-glasses', 'sunglasses',
  'heart-glasses', 'star-glasses', 'monocle', 'mustache', 'star-mask',
] as const

const validIds = new Set<string>(BOO_ACCESSORY_IDS)
const hexColor = /^#[\da-f]{6}$/i

/** Impede payloads arbitrários no SQLite, na autoedição dos agentes e no preview. */
export function validateBooAccessoryColors(input: unknown): BooAccessoryColors {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Paleta dos acessórios inválida.')
  }
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Paleta dos acessórios inválida.')
  }
  const entries = Object.entries(input)
  if (entries.length > BOO_ACCESSORY_IDS.length) throw new Error('Quantidade inválida de acessórios coloridos.')
  const result: BooAccessoryColors = Object.create(null)
  for (const [name, colors] of entries) {
    if (!validIds.has(name) || !Array.isArray(colors) || colors.length > 3 ||
      colors.some(color => typeof color !== 'string' || !hexColor.test(color))) {
      throw new Error('Cores inválidas para o acessório ' + name + '.')
    }
    if (colors.length) result[name] = colors.map(color => color.toLowerCase())
  }
  return result
}
