import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Mirrors tsconfig.json's "@/*" -> "./src/*" path alias, which Next.js
// resolves itself but Vitest doesn't pick up automatically.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
