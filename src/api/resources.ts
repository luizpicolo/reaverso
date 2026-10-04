import type { FederationPlatform, Resource } from '../types'
import { loadPleromaConfig, normalizeInstanceUrl, verifyPleromaConnection } from './pleroma'
import type { PleromaStatus } from './pleroma'
import { isOpenEducationalResourceStatus } from './rea'
export { isOpenEducationalResourceStatus } from './rea'

function statusText(status: PleromaStatus) {
  return htmlToText(status.content || '').replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean)
}

function platformFromStatus(instanceUrl: string, status: PleromaStatus): FederationPlatform {
  const host = new URL(normalizeInstanceUrl(instanceUrl)).host
  return { id: host, name: host, handle: `@${status.account.acct}`, url: normalizeInstanceUrl(instanceUrl), description: 'Instância Pleroma conectada ao REA.fed.', status: 'online', followersCount: 0, resourcesCount: 0, isFollowing: true }
}

function htmlToText(html = '') {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, ' ')
  const normalized = html.replace(/<br\s*\/?>(\r?\n)?/gi, '\n').replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, '\n')
  const doc = new DOMParser().parseFromString(normalized, 'text/html')
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ')
}

function fileNameFromUrl(url?: string) {
  if (!url) return ''
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || '') } catch { return '' }
}

export function parseResourceStatus(status: PleromaStatus, instanceUrl: string): Resource | null {
  const attachment = status.media_attachments?.[0]
  const text = statusText(status)
  if (!attachment || !isOpenEducationalResourceStatus(status)) return null

  const titleIndex = text.findIndex(line => line.startsWith('📚 '))
  const title = text[titleIndex].replace(/^📚\s*/, '').trim() || attachment.filename || 'Recurso sem título'
  const metadata = new Map<string, string>()
  const descriptionLines: string[] = []
  const metadataPrefixes = ['Área:', 'Tipo:', 'Licença:', 'IPFS:', 'SHA-256:', 'Manifesto:', 'Assinatura:', 'Chave pública:', 'Timestamp OTS:']
  let inMetadata = false

  for (const line of text.slice(titleIndex + 1)) {
    if (metadataPrefixes.some(prefix => line.startsWith(prefix))) {
      inMetadata = true
      const separator = line.indexOf(':')
      metadata.set(line.slice(0, separator), line.slice(separator + 1).trim())
      continue
    }
    if (/^(#\S+\s*)+$/.test(line)) continue
    if (!inMetadata) descriptionLines.push(line)
  }

  const tags = text.join(' ').match(/#[\p{L}\p{N}_-]+/gu)?.map(tag => tag.slice(1)) || []
  const platform = platformFromStatus(instanceUrl, status)
  const publishedAt = status.created_at || new Date().toISOString()
  const ipfsCid = metadata.get('IPFS')
  const ipfsGateway = String(import.meta.env.VITE_IPFS_GATEWAY_URL || '').replace(/\/+$/, '')
  const ipfs = ipfsCid ? {
    cid: ipfsCid,
    url: ipfsGateway ? `${ipfsGateway}/ipfs/${ipfsCid}` : `ipfs://${ipfsCid}`,
    sha256: metadata.get('SHA-256') || '',
    manifestUrl: metadata.get('Manifesto') ? (ipfsGateway ? `${ipfsGateway}/ipfs/${metadata.get('Manifesto')}` : `ipfs://${metadata.get('Manifesto')}`) : undefined,
    signatureUrl: metadata.get('Assinatura') ? (ipfsGateway ? `${ipfsGateway}/ipfs/${metadata.get('Assinatura')}` : `ipfs://${metadata.get('Assinatura')}`) : undefined,
    timestampUrl: metadata.get('Timestamp OTS') && metadata.get('Timestamp OTS') !== 'pendente' ? (ipfsGateway ? `${ipfsGateway}/ipfs/${metadata.get('Timestamp OTS')}` : `ipfs://${metadata.get('Timestamp OTS')}`) : undefined,
  } : undefined

  return {
    id: `pleroma-${status.id}`,
    title,
    description: descriptionLines.join('\n'),
    authors: [{ id: status.account.id, name: status.account.display_name || status.account.username, platform }],
    publishedAt: publishedAt.slice(0, 10),
    publishedAtTime: publishedAt,
    language: 'pt-BR', area: metadata.get('Área') || '', type: metadata.get('Tipo') || 'Outro', license: metadata.get('Licença') || '', tags,
    fileName: attachment.filename || fileNameFromUrl(attachment.url) || 'arquivo',
    fileSize: 0, sourcePlatform: platform, originalUrl: status.url || status.uri || normalizeInstanceUrl(instanceUrl),
    verification: {
      overall: ipfs?.cid && ipfs.sha256 && metadata.get('Manifesto') && metadata.get('Assinatura') ? (ipfs.timestampUrl ? 'verified' : 'pending') : 'pending',
      integrity: Boolean(ipfs?.sha256),
      signature: Boolean(metadata.get('Assinatura')),
      authorship: true,
      timestamp: Boolean(ipfs?.timestampUrl),
      details: ipfs ? ['Recurso identificado por CID no IPFS.', 'SHA-256 e evidências criptográficas foram publicados no status federado.'] : ['Recurso carregado diretamente da postagem do Pleroma.'],
    },
    evidence: ipfs ? [
      { type: 'hash', name: 'SHA-256', status: ipfs.sha256 ? 'valid' : 'pending', value: ipfs.sha256 },
      ...(ipfs.manifestUrl ? [{ type: 'manifest' as const, name: 'manifest.json', status: 'valid' as const, downloadUrl: ipfs.manifestUrl }] : []),
      ...(ipfs.signatureUrl ? [{ type: 'signature' as const, name: 'assinatura.sig', status: 'valid' as const, downloadUrl: ipfs.signatureUrl }] : []),
      ...(ipfs.timestampUrl ? [{ type: 'ots' as const, name: 'prova.ots', status: 'valid' as const, downloadUrl: ipfs.timestampUrl }] : []),
    ] : [],
    ipfs,
    downloads: 0,
  }
}

async function fetchPleromaStatusesPage(config: ReturnType<typeof loadPleromaConfig>, accountId: string, maxId?: string) {
  const params = new URLSearchParams({ limit: '40', exclude_reblogs: 'true' })
  if (maxId) params.set('max_id', maxId)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(
      `${normalizeInstanceUrl(config.instanceUrl)}/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Pleroma respondeu HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}.`)
    }
    return await response.json() as PleromaStatus[]
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('A consulta ao Pleroma demorou mais de 15 segundos. Verifique a conexão, a URL da instância e o CORS.')
    }
    if (error instanceof TypeError) {
      throw new Error('Não foi possível consultar as publicações do Pleroma. Verifique a conexão e se a instância permite CORS.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export interface LocalResourcePageInfo {
  page: number
  hasMore: boolean
  nextMaxId?: string
}

export interface ListLocalPleromaResourcesOptions {
  /** Called after each timeline page is parsed, so the UI can render immediately. */
  onPage?: (resources: Resource[], info: LocalResourcePageInfo) => void
  /** Safety limit for pagination. */
  maxPages?: number
  /** Cursor from the last page already rendered by the caller. */
  startMaxId?: string
  /** Page number used in progress callbacks. */
  startPage?: number
  /** Abort an individual HTTP request after this many milliseconds. */
  timeoutMs?: number
}

async function fetchLocalPleromaResourcePage(
  config: ReturnType<typeof loadPleromaConfig>,
  maxId: string | undefined,
  timeoutMs: number,
): Promise<{ statuses: PleromaStatus[]; nextMaxId?: string }> {
  const params = new URLSearchParams({
    limit: '40',
    local: 'true',
    exclude_reblogs: 'true',
  })
  if (maxId) params.set('max_id', maxId)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `${normalizeInstanceUrl(config.instanceUrl)}/api/v1/timelines/public?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.accessToken}`,
        },
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Pleroma respondeu HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}.`)
    }

    const statuses = await response.json() as PleromaStatus[]
    return {
      statuses,
      nextMaxId: statuses[statuses.length - 1]?.id,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`A consulta ao Pleroma demorou mais de ${Math.round(timeoutMs / 1000)} segundos.`)
    }
    if (error instanceof TypeError) {
      throw new Error('Não foi possível consultar as publicações locais do Pleroma. Verifique a conexão e o CORS.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function listLocalPleromaResources(
  query = '',
  options: ListLocalPleromaResourcesOptions = {},
): Promise<Resource[]> {
  const config = loadPleromaConfig()
  if (!config.instanceUrl || !config.accessToken) return []

  const resources: Resource[] = []
  let maxId: string | undefined = options.startMaxId
  const seen = new Set<string>()
  const seenCursors = new Set<string>()
  const search = query.trim().toLowerCase()
  const maxPages = Math.max(1, options.maxPages ?? 250)
  const timeoutMs = Math.max(5000, options.timeoutMs ?? 10000)

  const firstPage = options.startPage ?? 1
  for (let offset = 0; offset < maxPages; offset += 1) {
    const page = firstPage + offset
    const { statuses, nextMaxId } = await fetchLocalPleromaResourcePage(config, maxId, timeoutMs)
    if (!statuses.length) {
      options.onPage?.([], { page, hasMore: false, nextMaxId: undefined })
      break
    }

    const pageResources: Resource[] = []

    for (const status of statuses) {
      if (seen.has(status.id)) continue
      seen.add(status.id)
      const resource = parseResourceStatus(status, config.instanceUrl)
      if (!resource) continue

      if (!search || [
        resource.title,
        resource.description,
        resource.area,
        resource.type,
        resource.license,
        resource.fileName,
        ...resource.tags,
        ...resource.authors.map(author => author.name),
      ].join(' ').toLowerCase().includes(search)) {
        resources.push(resource)
        pageResources.push(resource)
      }
    }

    const hasMore = Boolean(nextMaxId && nextMaxId !== maxId && !seenCursors.has(nextMaxId) && statuses.length >= 40)
    if (nextMaxId) seenCursors.add(nextMaxId)

    options.onPage?.(pageResources, { page, hasMore, nextMaxId: hasMore ? nextMaxId : undefined })

    if (!hasMore) break
    maxId = nextMaxId
  }

  return resources.sort((a, b) =>
    (b.publishedAtTime || b.publishedAt).localeCompare(a.publishedAtTime || a.publishedAt),
  )
}

export async function listMyPleromaResources(): Promise<Resource[]> {
  const config = loadPleromaConfig()
  if (!config.instanceUrl || !config.accessToken) return []
  const { account } = await verifyPleromaConnection(config)
  const resources: Resource[] = []
  let maxId: string | undefined
  const seen = new Set<string>()
  const seenPageCursors = new Set<string>()

  // Pleroma/Mastodon APIs are paginated. Continue until the server returns
  // an empty page or stops advancing the cursor. The high safety limit avoids
  // an infinite loop if a non-standard instance returns the same page.
  for (let page = 0; page < 250; page += 1) {
    const statuses = await fetchPleromaStatusesPage(config, account.id, maxId)
    if (!statuses.length) break

    for (const status of statuses) {
      if (seen.has(status.id)) continue
      seen.add(status.id)
      const resource = parseResourceStatus(status, config.instanceUrl)
      if (resource) resources.push(resource)
    }

    const nextMaxId = statuses[statuses.length - 1]?.id
    if (!nextMaxId || nextMaxId === maxId || seenPageCursors.has(nextMaxId)) break
    seenPageCursors.add(nextMaxId)
    maxId = nextMaxId
    if (statuses.length < 40) break
  }

  return resources.sort((a, b) => (b.publishedAtTime || b.publishedAt).localeCompare(a.publishedAtTime || a.publishedAt))
}
