import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from '../../src/views/LoginView.vue'

const mocks = vi.hoisted(() => ({
  login: vi.fn(), verify: vi.fn(), replace: vi.fn(),
}))

vi.mock('../../src/api/pleroma', async importOriginal => ({
  ...(await importOriginal<typeof import('../../src/api/pleroma')>()),
  loginWithPleromaPassword: mocks.login,
  verifyPleromaConnection: mocks.verify,
}))
vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ replace: mocks.replace }),
}))

describe('LoginView', () => {
  beforeEach(() => { setActivePinia(createPinia()); mocks.login.mockReset(); mocks.verify.mockReset(); mocks.replace.mockReset() })

  it('autentica, atualiza a sessão e navega ao feed', async () => {
    mocks.login.mockResolvedValue({ instanceUrl: 'http://pleroma.test', accessToken: 'token' })
    mocks.verify.mockResolvedValue({ account: { id: '1', username: 'ada', acct: 'ada', display_name: 'Ada' } })
    const wrapper = mount(LoginView, { global: { stubs: { RouterLink: true } } })
    await wrapper.get('input[type="text"]').setValue('ada')
    await wrapper.get('input[type="password"]').setValue('senha')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.login).toHaveBeenCalledWith('ada', 'senha')
    expect(mocks.replace).toHaveBeenCalledWith('/feed')
  })

  it('mostra erro retornado pela autenticação', async () => {
    mocks.login.mockRejectedValue(new Error('Credenciais inválidas'))
    const wrapper = mount(LoginView, { global: { stubs: { RouterLink: true } } })
    await wrapper.get('input[type="text"]').setValue('ada')
    await wrapper.get('input[type="password"]').setValue('ruim')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Credenciais inválidas')
  })
})
