import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_PLEROMA_INSTANCE_URL': JSON.stringify('http://pleroma.test'),
    'import.meta.env.VITE_REA_IPFS_API_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_IPFS_GATEWAY_URL': JSON.stringify('http://ipfs.test'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/api/**/*.ts', 'src/stores/**/*.ts', 'src/views/**/*.vue'],
      exclude: ['src/api/mock.ts'],
    },
  },
})
