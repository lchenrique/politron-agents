import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Catálogo de skills dos Boos (as equipes prontas saíram com o Marketplace). Empacotado: `resources/marketplace`; em desenvolvimento e testes: a pasta do código. */
export function marketplaceRoot(): string {
  const packaged = process.resourcesPath ? join(process.resourcesPath, 'marketplace') : ''
  return packaged && existsSync(packaged) ? packaged : join(process.cwd(), 'src', 'main', 'marketplace', 'catalog')
}
