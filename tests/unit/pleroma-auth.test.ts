import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPleromaConfig, loadPleromaConfig, loginWithPleromaPassword, normalizeInstanceUrl, resolvePleromaMediaUrl } from '../../src/api/pleroma'

describe('autenticação Pleroma', () => {
  beforeEach(() => { clearPleromaConfig(); vi.stubGlobal('fetch', vi.fn()) })

  it('normaliza instâncias e recupera configuração persistida', () => {
    expect(normalizeInstanceUrl(' pleroma.example/// ')).toBe('https://pleroma.example')
    localStorage.setItem('rea-fed-pleroma-config', JSON.stringify({ instanceUrl: 'http://pleroma.test', accessToken: 'abc' }))
    expect(loadPleromaConfig()).toMatchObject({ instanceUrl: 'http://pleroma.test', accessToken: 'abc' })
  })

  it('executa descoberta, registro, password grant e provisionamento', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: 'Teste' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: 'id', client_secret: 'secret' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', refresh_token: 'refresh' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('PUBLIC KEY', { status: 200 }))
    const config = await loginWithPleromaPassword('@ada@pleroma.test', 'senha')
    const tokenBody = vi.mocked(fetch).mock.calls[2][1]?.body as URLSearchParams
    expect(tokenBody.get('username')).toBe('ada')
    expect(config.accessToken).toBe('token')
    expect(vi.mocked(fetch).mock.calls[3][1]?.headers).toEqual({ Authorization: 'Bearer token' })
  })

  it('decodifica URLs de mídia do proxy', () => {
    const encoded = btoa('https://remote.test/image.png').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    expect(resolvePleromaMediaUrl(`http://pleroma.test/proxy/cache/${encoded}/image.png`)).toBe('https://remote.test/image.png')
  })
})
