import { config } from '@vue/test-utils'
import { afterEach, beforeEach } from 'vitest'
import { i18n, setLocale } from '../src/i18n'

config.global.plugins = [i18n]

beforeEach(() => setLocale('pt-BR'))

afterEach(() => {
  localStorage.clear()
})
