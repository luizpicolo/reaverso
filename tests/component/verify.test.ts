import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import VerifyView from '../../src/views/VerifyView.vue'

const verify = vi.hoisted(() => vi.fn())
vi.mock('../../src/api/ipfs', () => ({ verifyResourceWithIpfsApi: verify }))

describe('VerifyView', () => {
  it('só habilita a verificação com as quatro evidências e exibe o resultado', async () => {
    verify.mockResolvedValue({ overall: 'verified', integrity: true, signature: true, authorship: true, timestamp: true, details: ['Tudo válido'] })
    const wrapper = mount(VerifyView)
    const inputs = wrapper.findAll('input[type="file"]')
    for (const [index, input] of inputs.entries()) {
      Object.defineProperty(input.element, 'files', { value: [new File(['x'], `arquivo-${index}`)] })
      await input.trigger('change')
    }
    const button = wrapper.get('.verify-button')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()
    expect(verify).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Arquivo autêntico')
    expect(wrapper.text()).toContain('✓ Confirmada')
  })
})
