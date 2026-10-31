/** Identificador curto exibido no cartão, estilo chave do Jira. */
export const shortTaskId = (id: string) => `#${id.replace(/[^a-z0-9]/gi, '').slice(0, 5).toUpperCase()}`
