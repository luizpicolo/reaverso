import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listLocalPleromaResources, parseResourceStatus } from '../../src/api/resources'
import { isOpenEducationalResourceStatus, REA_STATUS_MARKER } from '../../src/api/rea'

const account = { id: 'u1', username: 'ada', acct: 'ada', display_name: 'Ada', url: 'http://pleroma.test/users/ada' }
const resourceStatus = (id = '10') => ({
  id, created_at: '2026-01-02T10:00:00Z', account,
  content: '<p>📚 Álgebra Aberta<br>Uma apostila completa.<br>Área: Matemática<br>Tipo: Apostila<br>Licença: CC BY 4.0<br>IPFS: QmResource<br>SHA-256: abc<br>Manifesto: QmManifest<br>Assinatura: QmSignature<br>Timestamp OTS: QmOts<br>#algebra</p>',
  media_attachments: [{ id: 'm1', type: 'document', url: 'http://files.test/algebra.pdf', filename: 'algebra.pdf' }],
})

describe('parsing e catálogo de recursos', () => {
  beforeEach(() => localStorage.setItem('rea-fed-pleroma-config', JSON.stringify({ instanceUrl: 'http://pleroma.test', accessToken: 'token' })))

  it('ignora posts comuns e converte metadados de um recurso', () => {
    expect(parseResourceStatus({ ...resourceStatus(), content: '<p>Olá</p>' }, 'http://pleroma.test')).toBeNull()
    const parsed = parseResourceStatus(resourceStatus(), 'http://pleroma.test')!
    expect(parsed).toMatchObject({ title: 'Álgebra Aberta', area: 'Matemática', license: 'CC BY 4.0', tags: ['algebra'] })
    expect(parsed.ipfs).toMatchObject({ cid: 'QmResource', manifestUrl: 'http://ipfs.test/ipfs/QmManifest' })
    expect(parsed.verification.overall).toBe('verified')
  })

  it('reconhece apenas publicações REA completas, inclusive no formato legado e em reblogs', () => {
    const marked = { ...resourceStatus(), content: resourceStatus().content.replace('<p>', `<p>${REA_STATUS_MARKER}<br>`) }
    const hashtagOnly = {
      ...resourceStatus('11'),
      content: '<p>Uma indicação de leitura #REA</p>',
    }
    const missingSignature = {
      ...marked,
      id: '12',
      content: marked.content.replace('<br>Assinatura: QmSignature', ''),
    }
    const closedLicense = {
      ...marked,
      id: '13',
      content: marked.content.replace('CC BY 4.0', 'Todos os direitos reservados'),
    }

    expect(isOpenEducationalResourceStatus(marked)).toBe(true)
    expect(isOpenEducationalResourceStatus(resourceStatus('legacy'))).toBe(true)
    expect(isOpenEducationalResourceStatus(hashtagOnly)).toBe(false)
    expect(isOpenEducationalResourceStatus(missingSignature)).toBe(false)
    expect(isOpenEducationalResourceStatus(closedLicense)).toBe(false)
    expect(isOpenEducationalResourceStatus({ ...hashtagOnly, reblog: marked })).toBe(true)
  })

  it('pagina, filtra e informa progresso sem repetir posts', async () => {
    const page = Array.from({ length: 40 }, (_, index) => resourceStatus(String(100 - index)))
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([resourceStatus('60'), { ...resourceStatus('59'), content: '<p>post comum</p>' }]), { status: 200 })))
    const onPage = vi.fn()
    const result = await listLocalPleromaResources('matemática', { onPage })
    expect(result).toHaveLength(41)
    expect(onPage).toHaveBeenCalledTimes(2)
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('max_id=61')
  })
})
