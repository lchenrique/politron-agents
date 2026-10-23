/** Mistura uma cor #rrggbb com branco (255) ou preto (0); usado para luz e sombra. */
export function mix(hex: string, target: number, amount: number): string {
 const value = parseInt(hex.slice(1), 16)
 return '#' + [16, 8, 0].map(shift => Math.round(((value >> shift) & 255) * (1 - amount) + target * amount).toString(16).padStart(2, '0')).join('')
}
