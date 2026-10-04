import { createPublicKey, verify } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureUserKeys, getUserPrivateKey, getUserPublicKey } from '../../src/keys/store.js'
import { createManifest } from '../../src/manifest/create.js'

describe('chaves por usuário e manifesto', () => {
  it('cria um par estável e rejeita IDs inseguros', async () => {
    const first = await ensureUserKeys('usuario_42')
    const privateKey = await getUserPrivateKey('usuario_42')
    const publicKey = await getUserPublicKey('usuario_42')
    expect(createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString()).toBe(publicKey)
    expect(await ensureUserKeys('usuario_42')).toEqual(first)
    await expect(ensureUserKeys('../escape')).rejects.toThrow('ID de usuário inválido')
  })

  it('grava manifesto determinístico e assinatura verificável', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'rea-manifest-'))
    const result = await createManifest({ outputDir, title: 'Aula', author: 'Ada', account: { id: 'ada', username: 'ada', acct: 'ada@test' }, cid: 'QmFile', sha256: 'abc', version: '1.0.0', fileName: 'aula.pdf', fileSize: 10, publicKeyCid: 'QmKey' })
    const signature = Buffer.from((await readFile(result.signaturePath, 'utf8')).trim(), 'base64')
    expect(result.manifest.signer).toEqual({ id: 'ada', username: 'ada', acct: 'ada@test' })
    expect(verify(null, result.manifestBuffer, await getUserPublicKey('ada'), signature)).toBe(true)
  })
})
