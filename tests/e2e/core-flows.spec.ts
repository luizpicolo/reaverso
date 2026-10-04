import { expect, test } from '@playwright/test'

const account = { id: 'user1', username: 'ada', acct: 'ada', display_name: 'Ada Lovelace', url: 'http://pleroma.test/users/ada' }
const ipfsResult = {
  success: true,
  resource: { fileName: 'aula.txt', fileSize: 4, sha256: 'abc', cid: 'QmFile', url: 'ipfs://QmFile' },
  manifest: { title: 'Aula aberta', author: 'Ada Lovelace', cid: 'QmManifest', url: 'ipfs://QmManifest', sha256: 'abc', version: '1.0.0', createdAt: '2026-01-01T00:00:00Z' },
  signature: { cid: 'QmSignature', url: 'ipfs://QmSignature' }, publicKey: { cid: 'QmKey', url: 'ipfs://QmKey' },
  timestamp: { cid: 'QmOts', url: 'ipfs://QmOts' }, timestampStatus: 'created', verificationUrl: '/api/resources/verify',
}

test.beforeEach(async ({ page }) => {
  await page.route('http://pleroma.test/**', async route => {
    const url = route.request().url()
    if (url.endsWith('/api/v1/instance')) return route.fulfill({ json: { title: 'Pleroma local' } })
    if (url.endsWith('/api/v1/apps')) return route.fulfill({ json: { client_id: 'client', client_secret: 'secret' } })
    if (url.endsWith('/oauth/token')) return route.fulfill({ json: { access_token: 'token', refresh_token: 'refresh' } })
    if (url.endsWith('/api/v1/accounts/verify_credentials')) return route.fulfill({ json: account })
    if (url.endsWith('/api/v1/media')) return route.fulfill({ json: { id: 'media1', url: 'http://files.test/aula.txt' } })
    if (url.endsWith('/api/v1/statuses') && route.request().method() === 'POST') return route.fulfill({ json: { id: 'status1', url: 'http://pleroma.test/status1', created_at: '2026-01-01T00:00:00Z', account } })
    return route.fulfill({ json: [] })
  })
  await page.route('**/api/resources/**', async route => {
    const url = route.request().url()
    if (url.endsWith('/keys')) return route.fulfill({ body: 'PUBLIC KEY' })
    if (url.endsWith('/upload')) return route.fulfill({ json: ipfsResult })
    if (url.endsWith('/verify')) return route.fulfill({ json: { overall: 'verified', integrity: true, signature: true, authorship: true, timestamp: true, details: ['Tudo válido'] } })
    return route.fulfill({ status: 404, json: { error: 'mock não encontrado' } })
  })
})

test('login, navegação, publicação e verificação usam apenas serviços locais simulados', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuário').fill('@ada@pleroma.test')
  await page.getByLabel('Senha').fill('senha')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/feed/)
  await expect(page.getByText('Ada Lovelace').first()).toBeVisible()

  await page.getByRole('link', { name: /Publicar/ }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'aula.txt', mimeType: 'text/plain', buffer: Buffer.from('aula') })
  await page.getByPlaceholder('Título do recurso').fill('Aula aberta')
  await page.getByRole('button', { name: /Registrar no IPFS e publicar/ }).click()
  await expect(page.getByText('Recurso registrado e publicado')).toBeVisible()
  await expect(page.getByText('QmFile')).toBeVisible()

  await page.getByRole('link', { name: /Verificar/ }).click()
  for (const id of ['verify-original-file', 'verify-manifest-file', 'verify-signature-file', 'verify-ots-file']) {
    await page.locator(`#${id}`).setInputFiles({ name: `${id}.dat`, mimeType: 'application/octet-stream', buffer: Buffer.from('evidência') })
  }
  await page.getByRole('button', { name: /Verificar autoria e integridade/ }).click()
  await expect(page.getByText('Arquivo autêntico')).toBeVisible()
})
