import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ResourcesView from '../../src/views/ResourcesView.vue'

const list = vi.hoisted(() => vi.fn())
vi.mock('../../src/api/resources', () => ({ listLocalPleromaResources: list }))

describe('catálogo de recursos', () => {
  it('carrega a primeira página e refaz a busca pela URL', async () => {
    const resource = { id: 'r1', title: 'Física aberta', description: 'Material', area: 'Física', license: 'CC BY', authors: [{ name: 'Ada' }], sourcePlatform: { name: 'Local' }, publishedAt: '2026-01-01' }
    list.mockImplementation(async (_query, options) => { options.onPage([resource], { page: 1, hasMore: false }); return [resource] })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/resources', component: ResourcesView }, { path: '/resources/:id', component: { template: '<div />' } }] })
    await router.push('/resources'); await router.isReady()
    const wrapper = mount(ResourcesView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Física aberta')
    await wrapper.get('input[type="search"]').setValue('física')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('física')
    expect(list).toHaveBeenLastCalledWith('física', expect.anything())
  })
})
