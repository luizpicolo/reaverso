import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PublishView from '../../src/views/PublishView.vue'
import { useAuthStore } from '../../src/stores/auth'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), publish: vi.fn() }))
vi.mock('../../src/api/ipfs', () => ({ uploadResourceToIpfs: mocks.upload }))
vi.mock('../../src/api/pleroma', () => ({
  loadPleromaConfig: () => ({ instanceUrl: 'http://pleroma.test', accessToken: 'token' }),
  publishResourceToPleroma: mocks.publish,
}))

const ipfs = {
  success: true,
  resource: { fileName: 'aula.pdf', fileSize: 4, sha256: 'abc', cid: 'QmFile', url: 'ipfs://QmFile' },
  manifest: { title: 'Aula', author: 'Ada', cid: 'QmManifest', url: 'ipfs://QmManifest', sha256: 'abc', version: '1', createdAt: 'now' },
  signature: { cid: 'QmSig', url: 'ipfs://QmSig' }, publicKey: { cid: 'QmKey', url: 'ipfs://QmKey' },
  timestamp: null, timestampStatus: 'pending' as const, verificationUrl: '/verify',
}

describe('PublishView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().setAuthenticatedAccount({ id: '1', username: 'ada', acct: 'ada', display_name: 'Ada' }, 'http://pleroma.test')
    mocks.upload.mockReset(); mocks.publish.mockReset()
  })

  it('registra no IPFS antes de publicar no Pleroma', async () => {
    mocks.upload.mockResolvedValue(ipfs)
    mocks.publish.mockResolvedValue({ fileName: 'aula.pdf', status: { id: 's1', url: 'http://pleroma.test/s1' } })
    const wrapper = mount(PublishView, { global: { stubs: { RouterLink: true } } })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['aula'], 'aula.pdf')] })
    await input.trigger('change')
    await wrapper.get('input[placeholder="Título do recurso"]').setValue('Aula aberta')
    await wrapper.get('button.btn.primary').trigger('click')
    await flushPromises()
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'token' }), expect.objectContaining({ title: 'Aula aberta', author: 'Ada' }))
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ipfs }))
    expect(wrapper.text()).toContain('Recurso registrado e publicado')
  })
})
