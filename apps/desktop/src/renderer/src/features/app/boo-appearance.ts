import type { Agent } from '../../../../shared/v9'

/** Silhuetas suaves: a bolinha original permanece, outras lembram fantasminhas sem virar lençóis. */
export const BOO_BODY_PATHS: Record<NonNullable<Agent['pitsShape']>, string> = {
  round: 'M63 46 Q120 -8 177 46 Q205 71 201 111 Q197 169 120 174 Q43 169 39 111 Q35 71 63 46',
  flat: 'M58 72 Q70 50 120 51 Q170 50 182 72 Q202 91 198 121 Q194 167 120 169 Q46 167 42 121 Q38 91 58 72',
  long: 'M79 30 Q120 -3 161 30 Q192 56 189 113 Q185 186 120 187 Q55 186 51 113 Q48 56 79 30',
  drop: 'M120 9 Q144 47 175 61 Q205 78 197 122 Q186 177 120 179 Q54 177 43 122 Q35 78 65 61 Q96 47 120 9',
  squircle: 'M68 29 Q94 20 120 20 Q146 20 172 29 Q199 37 199 68 L199 129 Q199 166 165 171 Q120 177 75 171 Q41 166 41 129 L41 68 Q41 37 68 29',
  bean: 'M87 28 Q120 15 162 40 Q198 57 191 91 Q185 110 192 132 Q199 168 150 175 Q101 188 66 160 Q28 137 50 95 Q55 55 87 28',
  'ghost-wave': 'M63 46 Q120 -5 177 46 Q202 69 199 115 Q199 147 189 167 Q177 157 162 171 Q149 181 137 170 Q120 156 105 174 Q91 184 77 169 Q63 156 51 166 Q39 144 40 115 Q36 73 63 46 Z',
  'ghost-puff': 'M120 14 C78 14 47 38 43 76 C37 106 39 131 52 151 Q58 162 70 161 Q82 158 90 172 Q101 184 113 173 Q120 168 127 173 Q139 184 150 172 Q158 158 170 161 Q182 162 188 151 C201 131 203 106 197 76 C193 38 162 14 120 14 Z',
  'cute-squid': 'M120 14 Q163 14 185 49 Q202 84 195 115 Q190 143 177 154 Q188 171 175 182 Q164 185 153 171 Q143 189 131 180 Q120 167 109 180 Q95 188 87 170 Q75 183 64 176 Q55 170 63 155 Q40 136 41 103 Q41 42 92 19 Q106 14 120 14 Z',
  'soft-square': 'M69 23 Q88 12 120 16 Q152 12 171 23 Q199 33 202 66 L202 129 Q198 163 172 173 Q147 180 120 172 Q94 180 68 173 Q42 161 38 129 L38 66 Q41 35 69 23 Z',
  'little-cat': 'M52 16 Q67 14 85 33 Q120 18 155 33 Q173 14 188 16 L187 72 Q204 104 193 135 Q178 180 120 178 Q62 180 47 135 Q36 104 53 72 Z',
  'ghost-peak': 'M120 12 Q133 25 158 32 Q190 45 198 83 Q208 122 187 159 Q173 179 157 166 Q138 184 120 171 Q100 184 83 166 Q64 179 50 159 Q30 124 42 84 Q49 47 82 31 Q106 26 120 12 Z',
}

export const BOO_SHAPE_PRESETS: { value: NonNullable<Agent['pitsShape']>; label: string }[] = [
  { value: 'round', label: 'Bolinha' },
  { value: 'ghost-wave', label: 'Ondinha' },
  { value: 'ghost-puff', label: 'Fofinho' },
  { value: 'ghost-peak', label: 'Pontudinho' },
  { value: 'drop', label: 'Gota' },
  { value: 'soft-square', label: 'Quadradinho' },
  { value: 'cute-squid', label: 'Lulinha' },
  { value: 'little-cat', label: 'Gatinho' },
]

/** Restaura somente o visual, mantendo identidade, instruções, modelo e permissões. */
export const DEFAULT_BOO_APPEARANCE: Partial<Agent> = {
  color: '#786bea',
  pitsShape: 'round',
  pitsAccessory: 'none',
  pitsHeadAccessory: 'none',
  pitsFaceAccessory: 'none',
  pitsEyeColor: '#ffffff',
  pitsCheekColor: '#f5a5d1',
  pitsEyeSize: 8,
  pitsEyeSpacing: 26,
  pitsMouthSize: 1,
  pitsBlushStrength: 0.45,
  pitsBodyWidth: 1,
  pitsBodyHeight: 1,
  pitsBlush: true,
  pitsAura: true,
  pitsAnimate: true,
  pitsSpeed: 3,
  pitsAmplitude: 9,
}
