import { provisionUserKeys } from './ipfs'
import type { FederationPlatform, Resource } from '../types'
import { REA_STATUS_MARKER } from './rea'

export interface PleromaConfig {
  instanceUrl: string
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

interface OAuthApp {
  client_id: string
  client_secret: string
  name?: string
  redirect_uri?: string
}

interface OAuthTokenResponse {
  access_token: string
  token_type: string
  scope?: string
  created_at?: number
  expires_in?: number
  refresh_token?: string
}

export interface PleromaAccount {
  id: string
  username: string
  acct: string
  display_name: string
  url: string
  avatar?: string
  followers_count?: number
  following_count?: number
  note?: string
  locked?: boolean
  bot?: boolean
  fields?: Array<{ name: string; value: string; verified_at?: string | null }>
}

export interface PleromaRelationship {
  id: string
  following: boolean
  followed_by: boolean
  requested?: boolean
  blocking?: boolean
  muting?: boolean
  notifying?: boolean
  show_reblogs?: boolean
  endorsed?: boolean
}

export interface PleromaTimelineStatus extends PleromaStatus {
  reblog?: PleromaStatus | null
  in_reply_to_id?: string | null
  reblogged?: boolean
  favourited?: boolean
  bookmarked?: boolean
}

export interface PleromaInstance {
  uri?: string
  title?: string
  description?: string
  version?: string
}

export interface PleromaStatus {
  id: string
  url?: string
  uri?: string
  created_at: string
  content?: string
  visibility?: string
  account: PleromaAccount
  media_attachments?: Array<{
    id: string
    type: string
    url?: string
    preview_url?: string
    description?: string
    filename?: string
  }>
}

export function normalizeInstanceUrl(value: string) {
  let url = value.trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url.replace(/\/+$/, '')
}

const STORAGE_KEY = 'rea-fed-pleroma-config'
const OAUTH_APP_KEY = 'rea-fed-pleroma-oauth-app'
const OAUTH_STATE_KEY = 'rea-fed-pleroma-oauth-state'
const DEFAULT_INSTANCE_URL = normalizeInstanceUrl(import.meta.env.VITE_PLEROMA_INSTANCE_URL || '')

export function getConfiguredInstanceUrl() {
  if (!DEFAULT_INSTANCE_URL) {
    throw new Error('VITE_PLEROMA_INSTANCE_URL não foi configurada no arquivo .env.')
  }
  return DEFAULT_INSTANCE_URL
}

export function loadPleromaConfig(): PleromaConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { instanceUrl: DEFAULT_INSTANCE_URL, accessToken: '' }
    const parsed = JSON.parse(raw)
    const storedInstanceUrl = normalizeInstanceUrl(String(parsed.instanceUrl || ''))
    // The instance is deployment configuration, not a user-selectable setting.
    // If .env changes, discard tokens/app credentials from the previous instance.
    if (DEFAULT_INSTANCE_URL && storedInstanceUrl && storedInstanceUrl !== DEFAULT_INSTANCE_URL) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(OAUTH_APP_KEY)
      localStorage.removeItem(OAUTH_STATE_KEY)
      return { instanceUrl: DEFAULT_INSTANCE_URL, accessToken: '' }
    }
    return {
      instanceUrl: DEFAULT_INSTANCE_URL || storedInstanceUrl,
      accessToken: String(parsed.accessToken || ''),
      refreshToken: parsed.refreshToken ? String(parsed.refreshToken) : undefined,
      expiresAt: Number.isFinite(Number(parsed.expiresAt)) ? Number(parsed.expiresAt) : undefined,
    }
  } catch {
    return { instanceUrl: DEFAULT_INSTANCE_URL, accessToken: '' }
  }
}

export function savePleromaConfig(config: PleromaConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    instanceUrl: normalizeInstanceUrl(config.instanceUrl),
    accessToken: config.accessToken.trim(),
    refreshToken: config.refreshToken?.trim() || undefined,
    expiresAt: config.expiresAt,
  }))
}

export function clearPleromaConfig() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(OAUTH_APP_KEY)
  localStorage.removeItem(OAUTH_STATE_KEY)
}

function randomString(length = 48) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, length)
}

function callbackUrl() {
  return `${window.location.origin}/oauth/callback`
}

async function readError(response: Response) {
  const text = await response.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Some proxies/Pleroma versions return plain text or HTML.
  }

  const details: string[] = []
  if (body && typeof body === 'object') {
    for (const key of ['error', 'error_description', 'message', 'detail', 'error_code']) {
      const value = body[key]
      if (value !== undefined && value !== null && String(value).trim()) {
        details.push(`${key}: ${String(value)}`)
      }
    }
    if (body.errors && typeof body.errors === 'object') {
      details.push(`errors: ${JSON.stringify(body.errors)}`)
    }
  }

  const bodyText = text.trim()
  if (!details.length && bodyText) {
    details.push(bodyText.slice(0, 1000))
  }

  const status = `${response.status} ${response.statusText || ''}`.trim()
  return details.length
    ? `${status} — ${details.join(' | ')}`
    : status
}


async function discoverInstance() {
  const instanceUrl = getConfiguredInstanceUrl()
  if (!instanceUrl) throw new Error('Informe a URL da instância Pleroma.')
  try {
    const response = await fetch(`${instanceUrl}/api/v1/instance`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return { instanceUrl, instance: await response.json() as PleromaInstance }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('HTTP ')) {
      throw new Error(`A URL informada não respondeu como uma instância Pleroma (${error.message}).`)
    }
    throw new Error('Não foi possível acessar a instância. Verifique a URL e o CORS.')
  }
}

async function registerOAuthApp(instanceUrl: string) {
  const cachedRaw = localStorage.getItem(OAUTH_APP_KEY)
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw)
      if (cached.instanceUrl === instanceUrl && cached.clientId && cached.clientSecret) return cached
    } catch {
      // ignore stale local state
    }
  }

  const redirectUri = callbackUrl()
  const response = await fetch(`${instanceUrl}/api/v1/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'REA.fed',
      redirect_uris: redirectUri,
      scopes: 'read write follow',
      website: window.location.origin,
    }),
  })

  if (!response.ok) throw new Error(`A instância não permitiu registrar o aplicativo: ${await readError(response)}`)
  const app = await response.json() as OAuthApp
  if (!app.client_id || !app.client_secret) throw new Error('A instância não retornou as credenciais OAuth necessárias.')

  const stored = { instanceUrl, clientId: app.client_id, clientSecret: app.client_secret, redirectUri }
  localStorage.setItem(OAUTH_APP_KEY, JSON.stringify(stored))
  return stored
}

function storeToken(instanceUrl: string, token: OAuthTokenResponse) {
  savePleromaConfig({
    instanceUrl,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
  })
  return loadPleromaConfig()
}

/**
 * Direct login: credentials are sent from the browser to the deployment-configured
 * Pleroma instance over HTTPS. REA.fed does not store the password.
 */
function normalizeLoginUsername(value: string, instanceUrl: string) {
  let username = value.trim()
  // Pleroma's password grant expects the local nickname. Accept common
  // Fediverse forms such as @user and @user@instance as a convenience.
  username = username.replace(/^@/, '')
  try {
    const host = new URL(instanceUrl).hostname.toLowerCase()
    const at = username.lastIndexOf('@')
    if (at > 0 && username.slice(at + 1).toLowerCase() === host) {
      username = username.slice(0, at)
    }
  } catch {
    // Keep the entered value if the instance URL cannot be parsed.
  }
  return username
}

export async function loginWithPleromaPassword(username: string, password: string) {
  const { instanceUrl } = await discoverInstance()
  const app = await registerOAuthApp(instanceUrl)
  const normalizedUsername = normalizeLoginUsername(username, instanceUrl)

  const body = new URLSearchParams({
    grant_type: 'password',
    username: normalizedUsername,
    password,
    client_id: app.clientId,
    client_secret: app.clientSecret,
    scope: 'read write follow',
  })

  const response = await fetch(`${instanceUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const message = await readError(response)
    throw new Error(`Falha no login em ${instanceUrl}/oauth/token: ${message}. A senha não foi armazenada pelo REA.fed.`)
  }

  const token = await response.json() as OAuthTokenResponse
  if (!token.access_token) throw new Error('A instância não retornou um token de acesso.')
  const config = storeToken(instanceUrl, token)
  // Provisiona a identidade criptográfica do usuário no backend após o login.
  await provisionUserKeys(config)
  return config
}

export interface PleromaCaptcha {
  type: string
  token?: string
  url?: string
  answer_data?: string
  seconds_valid?: number
  [key: string]: unknown
}

export async function getPleromaCaptcha() {
  const { instanceUrl } = await discoverInstance()
  const response = await fetch(`${instanceUrl}/api/v1/pleroma/captcha`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Não foi possível carregar o CAPTCHA: ${await readError(response)}`)
  }
  const captcha = await response.json() as PleromaCaptcha
  if (captcha.error) {
    throw new Error(`A instância não conseguiu gerar o CAPTCHA: ${String(captcha.error)}`)
  }
  return { instanceUrl, captcha }
}

export interface RegisterPleromaInput {
  username: string
  email: string
  password: string
  fullname?: string
  bio?: string
  captchaSolution?: string
  captchaToken?: string
  captchaAnswerData?: string
}

export async function registerPleromaAccount(input: RegisterPleromaInput) {
  const { instanceUrl } = await discoverInstance()
  const app = await registerOAuthApp(instanceUrl)

  // Pleroma's /api/v1/accounts endpoint is an application registration
  // endpoint: it expects an app OAuth token. Calling it anonymously results
  // in HTTP 403 "Invalid credentials", even when public registration is open.
  const appTokenBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: app.clientId,
    client_secret: app.clientSecret,
  })

  const appTokenResponse = await fetch(`${instanceUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: appTokenBody,
  })

  if (!appTokenResponse.ok) {
    const message = await readError(appTokenResponse)
    throw new Error(`A instância não autorizou o aplicativo para cadastro: ${message}`)
  }

  const appToken = await appTokenResponse.json() as OAuthTokenResponse
  if (!appToken.access_token) {
    throw new Error('A instância não retornou um token de aplicativo para o cadastro.')
  }

  const response = await fetch(`${instanceUrl}/api/v1/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${appToken.access_token}`,
    },
    body: JSON.stringify({
      agreement: true,
      username: input.username.trim().replace(/^@/, ''),
      email: input.email.trim(),
      password: input.password,
      fullname: input.fullname?.trim() || undefined,
      bio: input.bio?.trim() || undefined,
      captcha_solution: input.captchaSolution?.trim() || undefined,
      captcha_token: input.captchaToken?.trim() || undefined,
      captcha_answer_data: input.captchaAnswerData?.trim() || undefined,
    }),
  })

  if (!response.ok) {
    const message = await readError(response)
    throw new Error(`Falha no cadastro em ${instanceUrl}/api/v1/accounts: ${message}`)
  }

  const token = await response.json() as OAuthTokenResponse
  if (!token.access_token) {
    throw new Error('A conta foi criada, mas a instância não retornou um token. Verifique o e-mail de confirmação e entre novamente.')
  }
  return storeToken(instanceUrl, token)
}

export async function refreshPleromaToken(config: PleromaConfig) {
  if (!config.refreshToken) throw new Error('Sessão expirada. Entre novamente.')
  const app = await registerOAuthApp(config.instanceUrl)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
    client_id: app.clientId,
    client_secret: app.clientSecret,
  })
  const response = await fetch(`${normalizeInstanceUrl(config.instanceUrl)}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    clearPleromaConfig()
    throw new Error('Sua sessão expirou. Entre novamente.')
  }
  return storeToken(normalizeInstanceUrl(config.instanceUrl), await response.json() as OAuthTokenResponse)
}

/** Legacy OAuth flow kept for compatibility with existing callback route. */
export async function beginPleromaLogin() {
  const { instanceUrl } = await discoverInstance()
  const app = await registerOAuthApp(instanceUrl)
  const state = randomString(32)
  localStorage.setItem(OAUTH_STATE_KEY, state)
  const authorize = new URL(`${instanceUrl}/oauth/authorize`)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', app.clientId)
  authorize.searchParams.set('redirect_uri', app.redirectUri)
  authorize.searchParams.set('scope', 'read write follow')
  authorize.searchParams.set('state', state)
  window.location.assign(authorize.toString())
}

export async function finishPleromaLogin(code: string, state: string) {
  const expectedState = localStorage.getItem(OAUTH_STATE_KEY)
  if (!expectedState || state !== expectedState) throw new Error('A validação de segurança da autenticação falhou. Tente entrar novamente.')
  const rawApp = localStorage.getItem(OAUTH_APP_KEY)
  if (!rawApp) throw new Error('A sessão de autenticação expirou. Tente entrar novamente.')
  const app = JSON.parse(rawApp) as { instanceUrl: string; clientId: string; clientSecret: string; redirectUri: string }
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: app.redirectUri, client_id: app.clientId, client_secret: app.clientSecret })
  const response = await fetch(`${app.instanceUrl}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!response.ok) throw new Error(`Não foi possível concluir a autenticação: ${await readError(response)}`)
  const token = await response.json() as OAuthTokenResponse
  if (!token.access_token) throw new Error('A instância não retornou um token de acesso.')
  const config = storeToken(app.instanceUrl, token)
  localStorage.removeItem(OAUTH_STATE_KEY)
  localStorage.removeItem(OAUTH_APP_KEY)
  return config
}

function assertConfig(config: PleromaConfig) {
  const instanceUrl = normalizeInstanceUrl(config.instanceUrl)
  if (!instanceUrl) throw new Error('Nenhuma instância Pleroma está conectada.')
  if (!config.accessToken.trim()) throw new Error('Nenhum token OAuth está disponível. Entre novamente.')
  return { instanceUrl, accessToken: config.accessToken.trim() }
}

async function apiFetch<T>(config: PleromaConfig, path: string, init: RequestInit = {}): Promise<T> {
  let current = loadPleromaConfig()
  const auth = assertConfig(current)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${auth.accessToken}`)
  if (init.body && !headers.has('Content-Type')) {
    if (init.body instanceof FormData) {
      // browser sets multipart boundary
    } else if (init.body instanceof URLSearchParams) {
      headers.set('Content-Type', 'application/x-www-form-urlencoded')
    } else {
      headers.set('Content-Type', 'application/json')
    }
  }

  let response: Response
  try {
    response = await fetch(`${auth.instanceUrl}${path}`, { ...init, headers })
  } catch {
    throw new Error('Não foi possível conectar à instância. Verifique a URL e o CORS.')
  }

  if (response.status === 401 && current.refreshToken) {
    current = await refreshPleromaToken(current)
    const retryHeaders = new Headers(init.headers)
    retryHeaders.set('Authorization', `Bearer ${current.accessToken}`)
    if (init.body && !retryHeaders.has('Content-Type')) {
      if (init.body instanceof URLSearchParams) retryHeaders.set('Content-Type', 'application/x-www-form-urlencoded')
      else if (!(init.body instanceof FormData)) retryHeaders.set('Content-Type', 'application/json')
    }
    response = await fetch(`${current.instanceUrl}${path}`, { ...init, headers: retryHeaders })
  }

  if (!response.ok) throw new Error(await readError(response))
  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

export async function verifyPleromaConnection(config: PleromaConfig) {
  const [account, instance] = await Promise.all([
    apiFetch<PleromaAccount>(config, '/api/v1/accounts/verify_credentials'),
    apiFetch<PleromaInstance>(config, '/api/v1/instance'),
  ])
  return { account, instance }
}

export async function uploadPleromaMedia(config: PleromaConfig, file: File, description?: string) {
  const form = new FormData()
  form.append('file', file, file.name)
  if (description?.trim()) form.append('description', description.trim())
  return apiFetch<{ id: string; type: string; url?: string; preview_url?: string; description?: string; filename?: string }>(config, '/api/v1/media', {
    method: 'POST',
    body: form,
  })
}

export async function createPleromaStatus(config: PleromaConfig, payload: { status: string; mediaId?: string; visibility?: 'public' | 'unlisted' | 'private' | 'direct' }) {
  const body = new URLSearchParams()
  body.set('status', payload.status)
  body.set('visibility', payload.visibility || 'public')
  if (payload.mediaId) body.append('media_ids[]', payload.mediaId)
  return apiFetch<PleromaStatus>(config, '/api/v1/statuses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

function platformFromPleroma(config: PleromaConfig, account: PleromaAccount): FederationPlatform {
  const instanceUrl = normalizeInstanceUrl(config.instanceUrl)
  const host = new URL(instanceUrl).host
  return { id: host, name: host, handle: `@${account.acct}`, url: instanceUrl, description: 'Instância Pleroma conectada ao REA.fed.', status: 'online', followersCount: 0, resourcesCount: 0, isFollowing: true }
}

export interface ResourceIpfsEvidence {
  resource: { cid: string; url: string; sha256: string }
  manifest: { cid: string; url: string; sha256: string; version: string; createdAt: string }
  signature: { cid: string; url: string }
  publicKey: { cid: string; url: string }
  timestamp: { cid: string; url: string } | null
  timestampStatus: 'created' | 'pending'
}

export async function publishResourceToPleroma(config: PleromaConfig, payload: { file: File; title: string; description: string; area: string; type: string; license: string; tags: string[]; visibility: 'public' | 'unlisted' | 'private' | 'direct'; ipfs?: ResourceIpfsEvidence }): Promise<Resource & { status: PleromaStatus }> {
  const { account } = await verifyPleromaConnection(config)
  const media = await uploadPleromaMedia(config, payload.file, payload.description)
  const resourceTags = payload.tags.some(tag => tag.replace(/^#/, '').toLowerCase() === 'rea') ? payload.tags : [...payload.tags, 'REA']
  const hashtagText = resourceTags.filter(Boolean).map(tag => `#${tag.replace(/^#/, '').replace(/\s+/g, '_')}`).join(' ')
  const ipfsLines = payload.ipfs ? [
    `IPFS: ${payload.ipfs.resource.cid}`,
    `SHA-256: ${payload.ipfs.resource.sha256}`,
    `Manifesto: ${payload.ipfs.manifest.cid}`,
    `Assinatura: ${payload.ipfs.signature.cid}`,
    `Chave pública: ${payload.ipfs.publicKey.cid}`,
    payload.ipfs.timestamp?.cid ? `Timestamp OTS: ${payload.ipfs.timestamp.cid}` : 'Timestamp OTS: pendente',
  ] : []
  const lines = [
    REA_STATUS_MARKER,
    `📚 ${payload.title}`,
    payload.description.trim(),
    payload.area.trim() ? `Área: ${payload.area.trim()}` : '',
    payload.type.trim() ? `Tipo: ${payload.type.trim()}` : '',
    payload.license.trim() ? `Licença: ${payload.license.trim()}` : '',
    ...ipfsLines,
    hashtagText,
  ].filter(Boolean)
  const status = await createPleromaStatus(config, { status: lines.join('\n'), mediaId: media.id, visibility: payload.visibility })
  const platform = platformFromPleroma(config, account)
  const now = status.created_at || new Date().toISOString()
  return {
    id: `pleroma-${status.id}`, title: payload.title, description: payload.description,
    authors: [{ id: account.id, name: account.display_name || account.username }],
    publishedAt: now.slice(0, 10), publishedAtTime: now, language: 'pt-BR', area: payload.area,
    type: payload.type, license: payload.license, tags: payload.tags, fileName: payload.file.name,
    fileSize: payload.file.size, sourcePlatform: platform, originalUrl: status.url || status.uri || normalizeInstanceUrl(config.instanceUrl),
    verification: {
      overall: payload.ipfs?.timestampStatus === 'created' ? 'verified' : 'pending',
      integrity: Boolean(payload.ipfs),
      signature: Boolean(payload.ipfs),
      authorship: true,
      timestamp: payload.ipfs?.timestampStatus === 'created',
      details: payload.ipfs
        ? ['Arquivo registrado no IPFS com SHA-256.', 'Manifesto assinado com Ed25519.', payload.ipfs.timestamp ? 'Prova OpenTimestamps criada.' : 'Prova OpenTimestamps pendente.']
        : ['Arquivo enviado como anexo ao status do Pleroma.'],
    },
    evidence: payload.ipfs ? [
      { type: 'manifest', name: 'manifest.json', status: 'valid', value: payload.ipfs.manifest.cid, downloadUrl: payload.ipfs.manifest.url },
      { type: 'signature', name: 'assinatura.sig', status: 'valid', value: payload.ipfs.signature.cid, downloadUrl: payload.ipfs.signature.url },
      ...(payload.ipfs.timestamp ? [{ type: 'ots' as const, name: 'prova.ots', status: 'valid' as const, value: payload.ipfs.timestamp.cid, downloadUrl: payload.ipfs.timestamp.url }] : []),
      { type: 'hash', name: 'SHA-256', status: 'valid', value: payload.ipfs.resource.sha256 },
    ] : [],
    downloads: 0, status,
  }
}

export async function publishPleromaStatus(config: PleromaConfig, status: string, media?: File, visibility = 'public') {
  let mediaId: string | undefined
  if (media) {
    const form = new FormData()
    form.append('file', media)
    const uploaded = await apiFetch<{ id: string }>(config, '/api/v1/media', { method: 'POST', body: form })
    mediaId = uploaded.id
  }
  const form = new URLSearchParams()
  form.set('status', status)
  form.set('visibility', visibility)
  if (mediaId) form.append('media_ids[]', mediaId)
  return apiFetch<PleromaStatus>(config, '/api/v1/statuses', { method: 'POST', body: form })
}

export async function listPleromaAccountStatuses(config: PleromaConfig, accountId: string) {
  const all: PleromaStatus[] = []
  let maxId = ''
  const seen = new Set<string>()
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ limit: '40', exclude_reblogs: 'true' })
    if (maxId) query.set('max_id', maxId)
    const batch = await apiFetch<PleromaStatus[]>(config, `/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?${query}`)
    if (!batch.length) break
    const fresh = batch.filter(status => !seen.has(status.id))
    fresh.forEach(status => { seen.add(status.id); all.push(status) })
    const next = batch[batch.length - 1]?.id
    if (!next || next === maxId || fresh.length === 0) break
    maxId = next
    if (batch.length < 40) break
  }
  return all
}


/** Real Pleroma account discovery/following API used by the social feed. */
export async function searchPleromaAccounts(query: string, limit = 20) {
  const q = query.trim()
  if (!q) return [] as PleromaAccount[]
  const params = new URLSearchParams({ q, limit: String(Math.min(limit, 40)), resolve: 'true' })
  return apiFetch<PleromaAccount[]>(loadPleromaConfig(), `/api/v1/accounts/search?${params.toString()}`)
}

export async function getPleromaFollowingAccounts(limit = 80) {
  const config = loadPleromaConfig()
  const { account } = await verifyPleromaConnection(config)
  const params = new URLSearchParams({ limit: String(Math.min(limit, 80)) })
  return apiFetch<PleromaAccount[]>(config, `/api/v1/accounts/${encodeURIComponent(account.id)}/following?${params.toString()}`)
}

export async function getPleromaFollowersAccounts(limit = 80) {
  const config = loadPleromaConfig()
  const { account } = await verifyPleromaConnection(config)
  const params = new URLSearchParams({ limit: String(Math.min(limit, 80)) })
  return apiFetch<PleromaAccount[]>(config, `/api/v1/accounts/${encodeURIComponent(account.id)}/followers?${params.toString()}`)
}

export async function getPleromaRelationships(ids: string[]) {
  if (!ids.length) return [] as PleromaRelationship[]
  const config = loadPleromaConfig()
  const params = new URLSearchParams()
  ids.forEach(id => params.append('id[]', id))
  return apiFetch<PleromaRelationship[]>(config, `/api/v1/accounts/relationships?${params.toString()}`)
}

export async function getPleromaRelationship(accountId: string) {
  const relationships = await getPleromaRelationships([accountId])
  return relationships[0] || null
}

export async function followPleromaAccount(accountId: string) {
  const config = loadPleromaConfig()
  const relationship = await apiFetch<PleromaRelationship>(config, `/api/v1/accounts/${encodeURIComponent(accountId)}/follow`, { method: 'POST' })
  // Pleroma returns the local relationship immediately. For a remote account,
  // ActivityPub delivery can still be asynchronous, so `requested` is also a
  // valid successful state for locked/approval-based accounts.
  if (!relationship.following && !relationship.requested) {
    const confirmed = await getPleromaRelationship(accountId)
    if (!confirmed?.following && !confirmed?.requested) {
      throw new Error('A instância não confirmou o seguimento desta conta. O pedido não foi registrado como following/requested.')
    }
    return confirmed
  }
  return relationship
}

export async function unfollowPleromaAccount(accountId: string) {
  const config = loadPleromaConfig()
  return apiFetch<PleromaRelationship>(config, `/api/v1/accounts/${encodeURIComponent(accountId)}/unfollow`, { method: 'POST' })
}

export async function getPleromaHomeTimeline(limit = 40) {
  const config = loadPleromaConfig()
  const params = new URLSearchParams({ limit: String(Math.min(limit, 80)), exclude_reblogs: 'false' })
  return apiFetch<PleromaTimelineStatus[]>(config, `/api/v1/timelines/home?${params.toString()}`)
}

export async function getPleromaLocalTimeline(limit = 40) {
  const config = loadPleromaConfig()
  const params = new URLSearchParams({ limit: String(Math.min(limit, 80)), local: 'true', exclude_reblogs: 'false' })
  return apiFetch<PleromaTimelineStatus[]>(config, `/api/v1/timelines/public?${params.toString()}`)
}

export async function getPleromaGlobalTimeline(limit = 40) {
  const config = loadPleromaConfig()
  const params = new URLSearchParams({ limit: String(Math.min(limit, 80)), exclude_reblogs: 'false' })
  return apiFetch<PleromaTimelineStatus[]>(config, `/api/v1/timelines/public?${params.toString()}`)
}

export async function getRemoteInstanceTimeline(instanceUrl: string, local: boolean, limit = 20) {
  const base = normalizeInstanceUrl(instanceUrl)
  const params = new URLSearchParams({ limit: String(Math.min(limit, 40)), exclude_reblogs: 'false' })
  if (local) params.set('local', 'true')
  const response = await fetch(`${base}/api/v1/timelines/public?${params.toString()}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(await readError(response))
  return await response.json() as PleromaTimelineStatus[]
}

/**
 * Pleroma may return a media URL through its /proxy endpoint. When that
 * proxy cannot fetch a remote attachment, decode the original URL embedded
 * in the proxy path and let the browser request the remote image directly.
 */
export function resolvePleromaMediaUrl(url?: string) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const proxyIndex = parts.indexOf('proxy')
    if (proxyIndex >= 0 && parts[proxyIndex + 2]) {
      const encoded = decodeURIComponent(parts[proxyIndex + 2])
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
      const decoded = window.atob(padded)
      if (/^https?:\/\//i.test(decoded)) return decoded
    }
  } catch {
    // Keep the original URL as a fallback for non-browser or non-standard URLs.
  }
  return url
}

export function accountHost(account: PleromaAccount, fallbackInstanceUrl = getConfiguredInstanceUrl()) {
  const acct = account.acct || account.username
  const at = acct.lastIndexOf('@')
  if (at > 0 && acct.slice(at + 1)) return acct.slice(at + 1)
  try { return new URL(fallbackInstanceUrl).hostname } catch { return '' }
}

export function accountInstanceUrl(account: PleromaAccount, fallbackInstanceUrl = getConfiguredInstanceUrl()) {
  if (account.url) {
    try { return new URL(account.url).origin } catch { /* fallback */ }
  }
  const host = accountHost(account, fallbackInstanceUrl)
  return host ? `https://${host}` : normalizeInstanceUrl(fallbackInstanceUrl)
}
