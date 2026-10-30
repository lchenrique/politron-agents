import type { Agent } from '../../shared/v9'
import { validateBooAccessoryColors } from '../../shared/boo-accessory-colors'

/** Whitelist estrita: perfil e aparência não podem escalar permissões ou alterar o runtime. */
export const SELF_PROFILE_FIELDS = [
  'name', 'description', 'instructions', 'color', 'pitsShape', 'pitsAccessory', 'pitsHeadAccessory', 'pitsFaceAccessory', 'pitsAccessoryColors',
  'pitsEyeColor', 'pitsCheekColor', 'pitsEyeSize', 'pitsEyeSpacing',
  'pitsAccentColor', 'pitsHeadset', 'pitsBlush', 'pitsAura', 'pitsAnimate', 'pitsSpeed', 'pitsAmplitude', 'pitsBodyWidth', 'pitsBodyHeight', 'pitsMouthSize', 'pitsBlushStrength',
] as const

const hexColor = /^#[\da-f]{6}$/i
const shapes = ['round', 'flat', 'long', 'drop', 'squircle', 'bean', 'ghost-wave', 'ghost-puff', 'ghost-peak', 'cute-squid', 'soft-square', 'little-cat'] as const
const accessories = ['none', 'antenna', 'horns', 'glasses', 'cap'] as const
const heads = ['none', 'antenna', 'horns', 'cap', 'cap-flat', 'cap-back', 'beanie', 'bucket', 'top-hat', 'witch-hat', 'headphones', 'crown', 'party-hat', 'chef-hat', 'bow', 'flower', 'halo'] as const
const faces = ['none', 'glasses', 'round-glasses', 'sunglasses', 'heart-glasses', 'star-glasses', 'monocle', 'mustache', 'star-mask'] as const
const limits: Record<string, [number, number]> = {
  pitsEyeSize: [4, 15], pitsEyeSpacing: [16, 42],
  pitsBodyWidth: [.75, 1.25], pitsBodyHeight: [.75, 1.25],
  pitsMouthSize: [.65, 1.6], pitsBlushStrength: [0, 1],
  pitsSpeed: [1, 6], pitsAmplitude: [0, 24],
}
const allowed = new Set<string>(SELF_PROFILE_FIELDS)
export function buildSelfProfileUpdate(current: Agent, supplied: Record<string, unknown>): Agent {
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('Informe os campos do próprio perfil.')
  const entries = Object.entries(supplied)
  if (!entries.length) throw new Error('Descreva pelo menos uma mudança no seu perfil.')
  if (entries.some(([key]) => !allowed.has(key))) throw new Error('Alteração sensível não permitida por autoedição. Use as configurações manuais.')
  const update: Record<string, unknown> = {}
  for (const [key, value] of entries) {
    if (key === 'name' || key === 'description' || key === 'instructions') {
      const max = key === 'name' ? 80 : key === 'description' ? 500 : 20000
      if (typeof value !== 'string' || value.length > max || (key !== 'description' && !value.trim())) throw new Error('Texto inválido para ' + key)
      update[key] = value.trim()
    } else if (key === 'color' || key === 'pitsEyeColor' || key === 'pitsCheekColor' || key === 'pitsAccentColor') {
      if (typeof value !== 'string' || !hexColor.test(value)) throw new Error('Cor inválida em ' + key + '. Use #RRGGBB.')
      update[key] = value.toLowerCase()
    } else if (key === 'pitsShape') {
      if (typeof value !== 'string' || !shapes.includes(value as typeof shapes[number])) throw new Error('Formato do Boo inválido.')
      update[key] = value
    } else if (key === 'pitsAccessoryColors') {
      update[key] = validateBooAccessoryColors(value)
    } else if (key === 'pitsHeadAccessory') {
      if (typeof value !== 'string' || !heads.includes(value as typeof heads[number])) throw new Error('Acessório de cabeça inválido.')
      update[key] = value
    } else if (key === 'pitsFaceAccessory') {
      if (typeof value !== 'string' || !faces.includes(value as typeof faces[number])) throw new Error('Acessório de rosto inválido.')
      update[key] = value
    } else if (key === 'pitsAccessory') {
      if (typeof value !== 'string' || !accessories.includes(value as typeof accessories[number])) throw new Error('Acessório do Boo inválido.')
      update[key] = value
    } else if (key in limits) {
      const [min, max] = limits[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Valor de aparência fora do limite em ' + key)
      update[key] = value
    } else {
      if (typeof value !== 'boolean') throw new Error('Use verdadeiro ou falso em ' + key)
      update[key] = value
    }
  }
  return { ...current, ...update } as Agent
}
