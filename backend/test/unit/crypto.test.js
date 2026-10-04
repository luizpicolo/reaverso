import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha256Buffer, sha256File } from '../../src/crypto/sha256.js'
import { verifyManifestSignatureCompatible, verifyManifestSignatureWithPublicKey } from '../../src/crypto/verify.js'

describe('SHA-256 e assinaturas Ed25519', () => {
  it('produz o mesmo hash para buffer e arquivo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rea-hash-'))
    const path = join(dir, 'recurso.txt')
    await writeFile(path, 'conteúdo')
    expect(await sha256File(path)).toBe(sha256Buffer(Buffer.from('conteúdo')))
  })

  it('valida bytes exatos, modo SHA-256 compatível e rejeita assinatura inválida', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const manifest = Buffer.from('{"title":"Aula"}')
    const exact = sign(null, manifest, privateKey).toString('base64')
    expect(verifyManifestSignatureWithPublicKey(manifest, exact, publicKey)).toBe(true)
    expect(verifyManifestSignatureCompatible(manifest, exact, publicKey)).toBe('manifest')
    expect(() => verifyManifestSignatureWithPublicKey(manifest, 'abc', publicKey)).toThrow('tamanho inválido')
  })
})
