import { describe, expect, it } from 'vitest'
import { cacheEvidenceSet, cacheIpfsBuffer, getCachedEvidenceSet, getIpfsBuffer } from '../../src/ipfs/cache.js'

describe('cache IPFS', () => {
  it('salva e reutiliza conteúdo sem acessar o Kubo', async () => {
    await cacheIpfsBuffer('QmCached', Buffer.from('arquivo'))
    await expect(getIpfsBuffer('QmCached')).resolves.toMatchObject({ buffer: Buffer.from('arquivo'), source: 'local-cache' })
  })

  it('materializa evidências e bloqueia CIDs inseguros', async () => {
    await cacheEvidenceSet('QmEvidence', { resource: Buffer.from('r'), 'manifest.json': Buffer.from('{}') })
    const evidence = await getCachedEvidenceSet('QmEvidence')
    expect(evidence.resource.toString()).toBe('r')
    await expect(cacheIpfsBuffer('../escape', Buffer.from('x'))).rejects.toThrow('CID IPFS inválido')
  })
})
