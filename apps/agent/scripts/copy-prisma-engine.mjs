/**
 * Copy Prisma's query engine binary into apps/agent/src/generated/client
 * before `next build`.
 *
 * Why: the engine is a native binary Prisma loads at runtime by a path it
 * computes itself — not a static require, so no bundler follows it. Because
 * @clbipp/database is in `transpilePackages`, the generated client gets
 * compiled into .next/server/chunks/ssr/, which moves Prisma's __dirname away
 * from packages/database. The only location it then still searches is
 * `<cwd>/src/generated/client` — on Vercel, /var/task/apps/agent/src/generated/client.
 *
 * Shipping the engine to its real path (packages/database/…) via
 * `outputFileTracingIncludes` is not enough: the file lands in the deployment
 * but Prisma never looks there, and every query fails with
 * PrismaClientInitializationError while the build stays green. Confirmed from
 * Vercel runtime logs, 2026-08-15.
 *
 * Runs as npm's `prebuild`, so it fires after turbo's `^db:generate` has
 * produced the engines and before next build traces the output.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '../../../packages/database/src/generated/client')
const dest = join(here, '../src/generated/client')

if (!existsSync(src)) {
  console.error(
    `[copy-prisma-engine] no generated client at ${src}\n` +
      `  Run \`npm run db:generate\` from the repo root, or build via ` +
      `\`npx turbo run build --filter=agent\` so ^db:generate runs first.`,
  )
  process.exit(1)
}

// Only the native binaries are read from disk at runtime — everything else in
// the generated client is bundled. schema.prisma rides along as cheap insurance.
const wanted = readdirSync(src).filter(
  (f) => f.startsWith('libquery_engine-') || f === 'schema.prisma',
)

// Fail loudly. A silent skip here reproduces exactly the bug this script fixes,
// and it only surfaces as a 500 in production.
if (!wanted.some((f) => f.startsWith('libquery_engine-'))) {
  console.error(
    `[copy-prisma-engine] no query engine binary in ${src}\n` +
      `  Check \`binaryTargets\` in packages/database/prisma/schema.prisma — ` +
      `Vercel's runtime needs "rhel-openssl-3.0.x".`,
  )
  process.exit(1)
}

mkdirSync(dest, { recursive: true })
for (const file of wanted) copyFileSync(join(src, file), join(dest, file))

console.log(
  `[copy-prisma-engine] copied ${wanted.length} file(s) → src/generated/client ` +
    `(${wanted.filter((f) => f.startsWith('libquery_engine-')).join(', ')})`,
)
