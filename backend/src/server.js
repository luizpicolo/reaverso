import 'dotenv/config'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import Busboy from 'busboy'
import { sha256File, sha256Buffer } from './crypto/sha256.js'
import { verifyManifestSignatureCompatible } from './crypto/verify.js'
import { uploadToIPFS, uploadBufferToIPFS } from './ipfs/ipfs.js'
import { cacheIpfsFile, cacheIpfsBuffer, cacheEvidenceSet, getIpfsBuffer } from './ipfs/cache.js'
import { createManifest } from './manifest/create.js'
import { timestampHash } from './ots/timestamp.js'
import { verifyTimestamp } from './ots/verify.js'
import { ensureUserKeys, getUserPublicKey, getUserKeyPaths } from './keys/store.js'

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '0.0.0.0'
const PleromaInstance = (process.env.PLEROMA_INSTANCE_URL || '').replace(/\/+$/, '')
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '')
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 52428800)
const STORAGE_DIR = resolve(process.env.STORAGE_DIR || './data/uploads')

await mkdir(STORAGE_DIR, { recursive: true })

export const app = express()

app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

function safeName(name = 'arquivo') {
  const base = basename(name).replace(/[^a-zA-Z0-9._-]/g, '_')
  return base || 'arquivo'
}

async function verifyPleromaToken(token) {
  if (!PleromaInstance) throw new Error('PLEROMA_INSTANCE_URL não configurada no backend.')
  if (!token) throw new Error('Token Pleroma não informado.')

  const response = await fetch(`${PleromaInstance}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('A autorização do Pleroma não foi aceita.')
  return response.json()
}

async function authenticate(req, _res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || ''
    req.account = await verifyPleromaToken(token)
    next()
  } catch (error) {
    next(error)
  }
}

async function parseMultipartSafely(req, targetDir, mode) {
  return new Promise((resolvePromise, rejectPromise) => {
    const fields = {}
    const files = []
    const pending = []
    let fileError

    let bb
    try {
      bb = Busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_FILE_SIZE,
          files: mode === 'verify' ? 4 : 1,
          fields: 20,
          fieldSize: 10000,
        },
      })
    } catch (error) {
      rejectPromise(error)
      return
    }

    bb.on('field', (name, value) => { fields[name] = value })
    bb.on('file', (name, stream, info) => {
      const filename = safeName(info.filename)
      const path = join(targetDir, `${files.length}-${filename}`)
      const output = createWriteStream(path, { flags: 'wx' })
      let size = 0
      let truncated = false

      stream.on('data', chunk => { size += chunk.length })
      stream.on('limit', () => {
        truncated = true
        fileError = new Error(`O arquivo excede o limite de ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`)
      })

      const promise = pipeline(stream, output)
        .then(() => {
          if (truncated) throw fileError
          files.push({ name, filename, mimeType: info.mimeType, path, size })
        })
        .catch(error => { fileError = error })

      pending.push(promise)
    })

    bb.on('error', rejectPromise)
    bb.on('finish', async () => {
      try {
        await Promise.all(pending)
        if (fileError) throw fileError
        resolvePromise({ fields, files })
      } catch (error) {
        rejectPromise(error)
      }
    })

    req.pipe(bb)
  })
}

function ipfsUrl(cid) {
  const gateway = (process.env.IPFS_GATEWAY_URL || '').replace(/\/+$/, '')
  return gateway ? `${gateway}/ipfs/${cid}` : `ipfs://${cid}`
}

async function handleUpload(req, res) {
  const account = req.account
  const requestDir = join(STORAGE_DIR, randomUUID())
  await mkdir(requestDir, { recursive: true })

  try {
    // Provisiona automaticamente a identidade criptográfica do usuário.
    await ensureUserKeys(account.id)

    const { fields, files } = await parseMultipartSafely(req, requestDir, 'upload')
    const file = files[0]
    if (!file) throw new Error('Nenhum arquivo foi enviado.')

    const title = String(fields.title || file.filename || 'Recurso sem título').trim()
    const author = String(fields.author || account.display_name || account.username || account.acct || '').trim()
    const version = String(fields.version || '1.0.0').trim() || '1.0.0'

    const sha256 = await sha256File(file.path)
    const ipfsFile = await uploadToIPFS(file.path)
    await cacheIpfsFile(ipfsFile.cid, file.path)

    const userPublicKey = await getUserPublicKey(account.id)
    const publicKeyIpfs = await uploadBufferToIPFS(Buffer.from(userPublicKey, 'utf8'), `${account.id}-public-key.pem`)
    await cacheIpfsBuffer(publicKeyIpfs.cid, Buffer.from(userPublicKey, 'utf8'))

    const { manifest, manifestPath, signaturePath, manifestBuffer } = await createManifest({
      outputDir: requestDir,
      title,
      author,
      account,
      cid: ipfsFile.cid,
      sha256,
      version,
      fileName: file.filename,
      fileSize: file.size,
      publicKeyCid: publicKeyIpfs.cid,
    })

    const manifestIpfs = await uploadToIPFS(manifestPath)
    const signatureIpfs = await uploadToIPFS(signaturePath)
    await Promise.all([
      cacheIpfsFile(manifestIpfs.cid, manifestPath),
      cacheIpfsFile(signatureIpfs.cid, signaturePath),
    ])

    let timestamp = null
    let timestampError = ''
    let timestampPath = null
    try {
      timestampPath = join(requestDir, 'prova.ots')
      timestamp = await timestampHash(sha256Buffer(manifestBuffer), timestampPath)
      const timestampIpfs = await uploadToIPFS(timestampPath)
      await cacheIpfsFile(timestampIpfs.cid, timestampPath)
      timestamp = { ...timestamp, cid: timestampIpfs.cid }
    } catch (error) {
      timestampError = error instanceof Error ? error.message : 'Não foi possível criar o timestamp.'
    }

    // Mantém uma cópia local do conjunto completo de evidências. A verificação
    // remota continua sendo feita por CID, mas o cache permite verificar sem
    // consultar o IPFS depois que os objetos já foram obtidos uma vez.
    await cacheEvidenceSet(ipfsFile.cid, {
      resource: await readFile(file.path),
      'manifest.json': manifestBuffer,
      'assinatura.sig': await readFile(signaturePath),
      'chave-publica.pem': Buffer.from(userPublicKey, 'utf8'),
      ...(timestamp ? { 'prova.ots': await readFile(timestampPath) } : {}),
    })

    return res.status(200).json({
      success: true,
      resource: {
        fileName: file.filename,
        fileSize: file.size,
        sha256,
        cid: ipfsFile.cid,
        url: ipfsUrl(ipfsFile.cid),
      },
      manifest: {
        ...manifest,
        cid: manifestIpfs.cid,
        url: ipfsUrl(manifestIpfs.cid),
      },
      signature: {
        cid: signatureIpfs.cid,
        url: ipfsUrl(signatureIpfs.cid),
      },
      publicKey: {
        cid: publicKeyIpfs.cid,
        url: ipfsUrl(publicKeyIpfs.cid),
      },
      timestamp: timestamp ? {
        cid: timestamp.cid,
        url: ipfsUrl(timestamp.cid),
      } : null,
      timestampStatus: timestamp ? 'created' : 'pending',
      ...(timestampError ? { timestampError } : {}),
      verificationUrl: `${PUBLIC_BASE_URL}/api/resources/verify`,
    })
  } finally {
    await rm(requestDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function verifyEvidenceBuffers({
  originalBuffer,
  manifestBuffer,
  signatureBase64,
  otsBuffer,
  publicKeyPem = null,
  expectedSignerId = null,
  expectedCid = null,
}) {
  let manifest
  try {
    manifest = JSON.parse(manifestBuffer.toString('utf8'))
  } catch {
    throw new Error('O manifesto não é um JSON válido.')
  }

  const signerId = String(manifest.signer?.id || '')
  const legacyManifest = !signerId

  const fileHash = sha256Buffer(originalBuffer)
  const expectedHash = String(manifest.sha256 || '').trim().toLowerCase()
  const integrity = Boolean(expectedHash) && fileHash.toLowerCase() === expectedHash
  const cidMatches = Boolean(manifest.cid) && (!expectedCid || String(manifest.cid) === String(expectedCid))

  let signature = false
  let signatureSource = 'none'
  let signatureError = ''

  const candidates = []
  if (publicKeyPem) candidates.push({ pem: publicKeyPem, source: 'ipfs-public-key' })

  if (signerId) {
    try {
      const { publicKeyPath } = getUserKeyPaths(signerId)
      const localPublicKey = await readFile(publicKeyPath, 'utf8')
      if (!candidates.some(candidate => candidate.pem === localPublicKey)) {
        candidates.push({ pem: localPublicKey, source: 'backend-user-key' })
      }
    } catch (error) {
      signatureError = error instanceof Error ? error.message : 'Chave pública local indisponível.'
    }
  }

  // Recursos antigos não têm signer.id/publicKeyCid e foram assinados com a
  // chave global da versão anterior. Mantemos somente leitura dessa chave para
  // compatibilidade; novos recursos continuam obrigatoriamente por usuário.
  if (legacyManifest) {
    try {
      const legacyPath = resolve('./src/keys/public-key.pem')
      const legacyPublicKey = await readFile(legacyPath, 'utf8')
      if (!candidates.some(candidate => candidate.pem === legacyPublicKey)) {
        candidates.push({ pem: legacyPublicKey, source: 'legacy-global-key' })
      }
    } catch { /* chave legada não instalada */ }
  }

  for (const candidate of candidates) {
    try {
      const mode = verifyManifestSignatureCompatible(manifestBuffer, signatureBase64, candidate.pem)
      if (mode) {
        signature = true
        signatureSource = `${candidate.source}:${mode}`
        signatureError = ''
        break
      }
      signatureError = 'A chave pública não corresponde à assinatura do manifesto.'
    } catch (error) {
      signatureError = error instanceof Error ? error.message : 'Falha ao validar a assinatura.'
    }
  }

  // Autoria é a combinação de uma assinatura válida com a identidade do
  // assinante registrada no manifesto. Quando a página conhece o autor da
  // publicação Pleroma, também exigimos que os IDs coincidam.
  const signerMatchesExpected = !expectedSignerId || String(expectedSignerId) === signerId
  const authorship = signature && Boolean(signerId) && signerMatchesExpected
  if (!signerId) signatureError = signature ? 'Assinatura válida, mas o manifesto é de uma versão antiga e não informa signer.id.' : signatureError
  else if (!signerMatchesExpected) signatureError = 'O assinante do manifesto não corresponde ao autor da publicação Pleroma.'

  let timestamp = false
  let timestampDetails = 'Evidência temporal não confirmada.'
  if (otsBuffer && otsBuffer.length) {
    try {
      const result = await verifyTimestamp(manifestBuffer, otsBuffer)
      timestamp = Boolean(result && Object.keys(result).length)
      if (timestamp) timestampDetails = `Timestamp confirmado: ${JSON.stringify(result)}`
    } catch (error) {
      timestampDetails = error instanceof Error ? `Falha na verificação OTS: ${error.message}` : 'Falha na verificação OTS.'
    }
  } else {
    timestampDetails = 'Nenhum timestamp OTS foi publicado para este recurso.'
  }

  const overall = integrity && signature && authorship
    ? (otsBuffer?.length && timestamp ? 'verified' : 'pending')
    : (!integrity ? 'altered' : 'invalid')

  const steps = [
    { id: 'signature', label: 'Verifica Assinatura', valid: signature, status: signature ? 'valid' : 'invalid', detail: signature ? `Assinatura válida (${signatureSource}).` : (signatureError || 'Assinatura Ed25519 inválida.') },
    { id: 'ots', label: 'Verifica OTS', valid: timestamp, status: otsBuffer?.length ? (timestamp ? 'valid' : 'invalid') : 'pending', detail: timestampDetails },
    { id: 'cid', label: 'Verifica CID', valid: cidMatches, status: cidMatches ? 'valid' : 'invalid', detail: cidMatches ? 'O manifesto possui o CID do recurso.' : 'O manifesto não possui CID do recurso.' },
    { id: 'hash', label: 'Verifica Hash', valid: integrity, status: integrity ? 'valid' : 'invalid', detail: integrity ? 'SHA-256 do arquivo coincide com o manifesto.' : 'SHA-256 do arquivo não coincide com o manifesto.' },
    { id: 'authorship', label: 'Verifica Autoria', valid: authorship, status: authorship ? 'valid' : 'invalid', detail: authorship ? 'O assinante corresponde à identidade da publicação Pleroma.' : 'A assinatura não pôde ser vinculada ao autor da publicação Pleroma.' },
  ]

  return {
    overall,
    integrity,
    signature,
    authorship,
    timestamp,
    signer: manifest.signer,
    manifest,
    signatureSource,
    signatureError,
    steps,
    details: [
      `SHA-256 do arquivo: ${fileHash}`,
      `SHA-256 esperado no manifesto: ${manifest.sha256 || 'não informado'}`,
      `CID informado no manifesto: ${manifest.cid || 'não informado'}`,
      cidMatches ? 'CID confirmado: o CID solicitado coincide com o CID registrado no manifesto.' : 'CID não confirmado: o CID solicitado não coincide com o manifesto.',
      signature ? `Assinatura válida (${signatureSource}).` : `Assinatura inválida. ${signatureError || 'Chave pública não corresponde à assinatura.'}`,
      authorship ? 'Autoria confirmada: o assinante corresponde à identidade Pleroma informada.' : `Autoria não confirmada: ${signatureError || 'a assinatura ou a identidade do assinante não pôde ser validada.'}`,
      timestampDetails,
    ],
  }
}

async function handleVerify(req, res) {
  const requestDir = join(STORAGE_DIR, `verify-${randomUUID()}`)
  await mkdir(requestDir, { recursive: true })

  try {
    const { files } = await parseMultipartSafely(req, requestDir, 'verify')
    const byName = new Map(files.map(file => [file.name, file]))
    const original = byName.get('file')
    const manifestFile = byName.get('manifest')
    const signatureFile = byName.get('signature')
    const otsFile = byName.get('ots')

    if (!original || !manifestFile || !signatureFile || !otsFile) {
      throw new Error('Envie file, manifest, signature e ots.')
    }

    const [originalBuffer, manifestBuffer, signatureBase64, otsBuffer] = await Promise.all([
      readFile(original.path),
      readFile(manifestFile.path),
      readFile(signatureFile.path, 'utf8'),
      readFile(otsFile.path),
    ])

    let publicKeyPem = null
    try {
      const parsed = JSON.parse(manifestBuffer.toString('utf8'))
      if (parsed.publicKeyCid) {
        publicKeyPem = (await getIpfsBuffer(parsed.publicKeyCid)).buffer.toString('utf8')
      }
    } catch {
      // O helper de verificação retornará uma mensagem específica para manifesto inválido.
    }

    return res.status(200).json(await verifyEvidenceBuffers({ originalBuffer, manifestBuffer, signatureBase64, otsBuffer, publicKeyPem }))
  } finally {
    await rm(requestDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function handleRemoteVerify(req, res) {
  const { cid, manifestCid, signatureCid, timestampCid, expectedSignerId } = req.body || {}
  if (!cid || !manifestCid || !signatureCid) throw new Error('Informe o CID do recurso, manifesto e assinatura.')

  const [resource, manifest, signature, timestamp] = await Promise.all([
    getIpfsBuffer(cid),
    getIpfsBuffer(manifestCid),
    getIpfsBuffer(signatureCid),
    timestampCid ? getIpfsBuffer(timestampCid) : Promise.resolve(null),
  ])

  let parsedManifest
  try {
    parsedManifest = JSON.parse(manifest.buffer.toString('utf8'))
  } catch {
    throw new Error('O manifesto IPFS não é um JSON válido.')
  }

  const publicKeyCid = String(parsedManifest.publicKeyCid || '')
  let publicKey = null
  if (publicKeyCid) publicKey = await getIpfsBuffer(publicKeyCid)

  // A primeira verificação materializa o conjunto completo no armazenamento
  // local. Nas próximas execuções getIpfsBuffer() encontra tudo no cache e não
  // faz chamadas ao Kubo/IPFS.
  await cacheEvidenceSet(cid, {
    resource: resource.buffer,
    'manifest.json': manifest.buffer,
    'assinatura.sig': signature.buffer,
    ...(publicKey ? { 'chave-publica.pem': publicKey.buffer } : {}),
    ...(timestamp ? { 'prova.ots': timestamp.buffer } : {}),
  })

  const result = await verifyEvidenceBuffers({
    originalBuffer: resource.buffer,
    manifestBuffer: manifest.buffer,
    signatureBase64: signature.buffer.toString('utf8').trim(),
    otsBuffer: timestamp?.buffer || null,
    publicKeyPem: publicKey?.buffer.toString('utf8') || null,
    expectedSignerId: expectedSignerId ? String(expectedSignerId) : null,
    expectedCid: String(cid),
  })

  const manifestCidMatches = String(result.manifest?.cid || '') === String(cid)
  const evidenceCidMatches = Boolean(manifestCid && signatureCid)
  const overall = result.overall === 'verified' && manifestCidMatches && evidenceCidMatches ? 'verified' :
    result.overall === 'altered' || !manifestCidMatches ? 'altered' : 'invalid'

  return res.status(200).json({
    ...result,
    overall,
    details: [
      ...result.details,
      manifestCidMatches ? 'CID do recurso coincide com o CID registrado no manifesto.' : 'O CID do recurso NÃO coincide com o CID registrado no manifesto.',
      evidenceCidMatches ? 'Manifesto e assinatura foram localizados pelos CIDs publicados.' : 'Uma evidência possui CID ausente.',
    ],
    source: {
      resource: resource.source,
      manifest: manifest.source,
      signature: signature.source,
      timestamp: timestamp?.source || 'not-published',
      publicKey: publicKey?.source || 'not-available',
    },
    cids: { cid, manifestCid, signatureCid, timestampCid: timestampCid || null, publicKeyCid },
    publicKeySource: publicKey?.source || 'backend-user-key',
  })
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'rea-fed-ipfs-api', keyMode: 'per-user' })
})

// O frontend pode chamar esta rota logo após o login.
// O backend usa o ID retornado pelo Pleroma como identidade estável.
app.get('/api/resources/keys', authenticate, async (req, res) => {
  const publicKey = await getUserPublicKey(req.account.id)
  res.type('application/x-pem-file').send(publicKey)
})

app.get('/api/resources/public-key', authenticate, async (req, res) => {
  const publicKey = await getUserPublicKey(req.account.id)
  res.type('application/x-pem-file').send(publicKey)
})

app.post('/api/resources/upload', authenticate, async (req, res) => {
  await handleUpload(req, res)
})

app.post('/api/resources/verify', async (req, res) => {
  await handleVerify(req, res)
})

// Verificação pública: recebe somente CIDs publicados no manifesto/status.
// O backend busca primeiro no cache local e só consulta o IPFS quando necessário.
app.post('/api/resources/verify-remote', async (req, res) => {
  await handleRemoteVerify(req, res)
})

app.use((error, _req, res, _next) => {
  console.error(error)
  const message = error instanceof Error ? error.message : 'Erro interno.'
  res.status(400).json({ error: message })
})

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, HOST, () => {
    console.log(`REA.fed IPFS API em http://${HOST}:${PORT}`)
  })
}
