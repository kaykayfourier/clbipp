import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Loads the customer app's .env.local into process.env for standalone scripts.
 * The service-role key lives there (not in packages/database/.env, which only
 * carries DATABASE_URL/DIRECT_URL).
 *
 * Tolerates whitespace around "=" and surrounding quotes — this repo's file has
 * both ("KEY =value", quoted service-role key). Next's dotenv handles these; a
 * naive split does not.
 */
export function loadAppEnv() {
  const envPath = resolve(__dirname, "../../../apps/customer/.env.local")
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
    }
  }
}
