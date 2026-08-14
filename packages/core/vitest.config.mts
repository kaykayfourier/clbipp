import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // booking.ts tests land in Batch 3; until then the package has no tests.
    passWithNoTests: true,
  },
})
