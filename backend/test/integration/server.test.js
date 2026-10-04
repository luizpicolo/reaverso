import { readFile } from 'node:fs/promises'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../src/server.js'
import { createManifest } from '../../src/manifest/create.js'
import { sha256Buffer } from '../../src/crypto/sha256.js'

describe('API Express', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))

  it('expõe saúde e CORS', async () => {
    const response = await request(app).get('/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, service: 'rea-fed-ipfs-api', keyMode: 'per-user' })
    expect(response.headers['access-control-allow-origin']).toBe('*')
  })

  it('valida o Bearer token e provisiona a chave pública', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 'user1', username: 'ada', acct: 'ada' }), { status: 200 }))
    const response = await request(app).get('/api/resources/keys').set('Authorization', 'Bearer token')
    expect(response.status).toBe(200)
    expect(response.text).toContain('BEGIN PUBLIC KEY')
    expect(vi.mocked(fetch).mock.calls[0][1].headers.Authorization).toBe('Bearer token')
  })

  it('verifica multipart real, hash, assinatura e autoria', async () => {
    const original = Buffer.from('conteúdo original')
    const outputDir = process.env.STORAGE_DIR
    const created = await createManifest({ outputDir, title: 'Aula', author: 'Ada', account: { id: 'user1', username: 'ada', acct: 'ada' }, cid: 'QmResource', sha256: sha256Buffer(original), fileName: 'aula.txt', fileSize: original.length })
    const response = await request(app).post('/api/resources/verify')
      .attach('file', original, 'aula.txt')
      .attach('manifest', created.manifestBuffer, 'manifest.json')
      .attach('signature', await readFile(created.signaturePath), 'assinatura.sig')
      .attach('ots', Buffer.from('prova-inválida'), 'prova.ots')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ overall: 'pending', integrity: true, signature: true, authorship: true, timestamp: false })
  })

  it('retorna erros de entrada como JSON', async () => {
    const missing = await request(app).post('/api/resources/verify').attach('file', Buffer.from('x'), 'x.txt')
    expect(missing.status).toBe(400)
    expect(missing.body.error).toContain('Envie file, manifest, signature e ots')
    const remote = await request(app).post('/api/resources/verify-remote').send({ cid: 'QmOnly' })
    expect(remote.status).toBe(400)
  })
})
