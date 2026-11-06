import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TelegramPanel } from './TelegramPanel'

afterEach(() => vi.unstubAllGlobals())
const base = { hasToken: true, enabled: true, state: 'connected', botUsername: 'boobot_bot', error: null, chats: [{ id: 7, name: 'Carlos', pairedAt: '2026-11-06T10:00:00Z' }], pairing: { code: 'ABCD2345', expiresAt: '2026-11-06T10:10:00Z', link: 'https://t.me/boobot_bot?start=ABCD2345' } }

describe('TelegramPanel', () => {
  it('mostra os dois QR codes com as URLs corretas e os chats pareados', async () => {
    vi.stubGlobal('telegramAPI', { status: vi.fn().mockResolvedValue(base) })
    render(<TelegramPanel />)
    await waitFor(() => expect(screen.getByAltText('QR code para https://t.me/boobot_bot?start=ABCD2345')).toBeTruthy())
    expect(screen.getByAltText('QR code para https://t.me/BotFather')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://t.me/boobot_bot?start=ABCD2345' }).getAttribute('href')).toBe('https://t.me/boobot_bot?start=ABCD2345')
    expect(screen.getByRole('link', { name: 'https://t.me/BotFather' }).getAttribute('href')).toBe('https://t.me/BotFather')
    expect(screen.getByText('Carlos')).toBeTruthy(); expect(screen.getByText('Revogar')).toBeTruthy()
    expect(screen.getByText('Conectado como @boobot_bot.')).toBeTruthy()
    await waitFor(() => expect(document.querySelectorAll('img[src^="data:image/svg+xml"]').length).toBe(2))
  })
})
