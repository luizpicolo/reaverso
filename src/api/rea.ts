import type { PleromaStatus } from './pleroma'

/** Stable, language-independent marker emitted by REA.fed publications. */
export const REA_STATUS_MARKER = '[REA.fed:v1]'

function htmlToText(html = '') {
  const normalized = html
    .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, '\n')
  if (typeof document === 'undefined') return normalized.replace(/<[^>]+>/g, ' ')
  const doc = new DOMParser().parseFromString(normalized, 'text/html')
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ')
}

function statusLines(status: PleromaStatus) {
  return htmlToText(status.content || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function metadataFrom(lines: string[]) {
  const metadata = new Map<string, string>()
  for (const line of lines) {
    const separator = line.indexOf(':')
    if (separator > 0) metadata.set(line.slice(0, separator), line.slice(separator + 1).trim())
  }
  return metadata
}

function isOpenLicense(value = '') {
  return /^(CC0|CC\s+BY(?:-SA|-NC|-NC-SA)?)(?:\s|$)/i.test(value.trim())
}

/**
 * Recognizes REA.fed resources without trusting a hashtag alone. New posts use
 * a versioned marker; legacy REA.fed posts remain valid when they contain the
 * complete attachment, open-license and cryptographic-evidence structure.
 */
export function isOpenEducationalResourceStatus(status: PleromaStatus): boolean {
  const candidate = ((status as PleromaStatus & { reblog?: PleromaStatus | null }).reblog || status)
  const lines = statusLines(candidate)
  const metadata = metadataFrom(lines)
  const hasResourceTitle = lines.some(line => line.startsWith('📚 '))
  const hasKnownFormat = lines.includes(REA_STATUS_MARKER) || hasResourceTitle

  return Boolean(
    candidate.media_attachments?.length &&
    hasKnownFormat &&
    hasResourceTitle &&
    isOpenLicense(metadata.get('Licença')) &&
    metadata.get('IPFS') &&
    metadata.get('SHA-256') &&
    metadata.get('Manifesto') &&
    metadata.get('Assinatura'),
  )
}
