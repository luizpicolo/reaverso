import { beforeEach, describe, expect, it, vi } from 'vitest'
import { provisionUserKeys, uploadResourceToIpfs, verifyResourceIdentity, verifyResourceWithIpfsApi } from '../../src/api/ipfs'

describe('cliente da API IPFS', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })

  it('exige token nas operações autenticadas', async () => {
    await expect(provisionUserKeys({ instanceUrl: 'http://pleroma.test', accessToken: '' })).rejects.toThrow('token de acesso')
    await expect(uploadResourceToIpfs(
      { instanceUrl: 'http://pleroma.test', accessToken: '' },
      { file: new File(['x'], 'a.txt'), title: 'A', author: 'B' },
    )).rejects.toThrow('token de acesso')
  })

  it('envia o recurso como multipart e propaga a resposta', async () => {
    const payload = { success: true, resource: { cid: 'cid' } }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    const result = await uploadResourceToIpfs(
      { instanceUrl: 'http://pleroma.test', accessToken: 'secret' },
      { file: new File(['conteúdo'], 'aula.pdf'), title: 'Aula', author: 'Ada' },
    )
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.headers).toEqual({ Authorization: 'Bearer secret' })
    expect((init?.body as FormData).get('title')).toBe('Aula')
    expect(result).toEqual(payload)
  })

  it('envia evidências locais e verificação remota', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ overall: 'verified' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ overall: 'verified' }), { status: 200 }))
    const file = new File(['x'], 'x')
    await verifyResourceWithIpfsApi({ file, manifest: file, signature: file, ots: file })
    expect((vi.mocked(fetch).mock.calls[0][1]?.body as FormData).get('ots')).toBeInstanceOf(File)
    await verifyResourceIdentity({ cid: 'a', manifestCid: 'b', signatureCid: 'c', expectedSignerId: '42' })
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toMatchObject({ cid: 'a', expectedSignerId: '42' })
  })

  it('usa a mensagem de erro da API', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'CID inválido' }), { status: 400 }))
    await expect(verifyResourceIdentity({ cid: '!', manifestCid: 'b', signatureCid: 'c' })).rejects.toThrow('CID inválido')
  })
})
