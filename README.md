# CLBIPP — Closed-Loop Battery Intelligence & Pricing Platform

A platform for recovering end-of-life batteries and proving EPR (Extended
Producer Responsibility) compliance. A vendor books a pickup, a field agent
inspects and prices the batteries on site, and the office tracks every battery
from collection through recycling to a downloadable EPR certificate.

## Live apps

| App | For | URL |
|---|---|---|
| **Vendor app** | Businesses and individuals handing over batteries (mobile, installable PWA) | https://clbipp-customer.vercel.app |
| **Field agent app** | Agents who inspect, price and collect (mobile, installable PWA) | https://clbipp-agent.vercel.app |
| **Admin console** | Office and hub staff (desktop) | https://clbipp-admin.vercel.app |

Demo accounts and a step-by-step walkthrough of each app are in the
[User Guide](docs/USER_GUIDE.md).

## How it works

Every pickup moves through nine fixed stages:

```
requested → scheduled → arrived → offered → collected → tested → processed → recovered → certified
```

1. **Vendor books** a pickup — battery lines, a photo of each, address and date.
2. **Office dispatches** it to an agent, picked from a ranked list (availability,
   workload, then distance), or groups several pickups into a same-day run.
3. **Agent arrives**, completes a safety checklist, and records each battery's
   chemistry, weight, condition and photos.
4. **The decision engine** recommends a recovery pathway (second life or
   recycling) and a price. For the pilot it is recommendation-only — the office
   can set a different price, and the agent presents it.
5. **Vendor accepts** the offer; the agent tags each battery, collects it and
   the vendor is paid by UPI or bank transfer, with a receipt and invoice.
6. **Office tracks the load** through hub check-in, dispatch manifests to
   recyclers or refurbishers, and the recycler's measured recovery.
7. **Office certifies** the pickup and the vendor downloads an EPR certificate
   listing the materials recovered.

## Tech stack

- **[Next.js](https://nextjs.org) 16** (App Router) + **React 19** + **TypeScript** (strict)
- **[Supabase](https://supabase.com)** — Postgres, Auth, Realtime, Storage
- **[Prisma](https://www.prisma.io)** for schema, migrations and queries
- **[Tailwind CSS](https://tailwindcss.com)** + shadcn/ui
- **[Turborepo](https://turbo.build)** monorepo · **[Vitest](https://vitest.dev)** · deployed on **[Vercel](https://vercel.com)**

## Repository layout

```
apps/
  customer/          Vendor app            (port 3000)
  agent/             Field agent app       (port 3001)
  admin/             Admin console         (port 3002)
packages/
  core/              Shared business logic: validation, pricing, payments,
                     dispatch ranking, tags, negotiation, formatting
  decision-engine/   Pathway and pricing engine (Layers 0–5)
  database/          Prisma schema, migrations, seed and demo scripts
  auth/              Supabase clients, session helpers, auth middleware
  ui/                Shared mobile UI components and design tokens
  pdf/               EPR certificate, receipt and invoice templates
  tsconfig/ eslint-config/
supabase/            Row-level security policies, grants, storage and realtime SQL
scripts/             Logged-in smoke test across all three apps
docs/                Plans, task sheets, user guide and demo runbooks
```

Packages ship raw TypeScript and are compiled by each app — there is no
per-package build step.

## Getting started

**Prerequisites:** Node.js 20+, npm 10, and access to a Supabase project.

```bash
git clone https://github.com/kaykayfourier/clbipp.git
cd clbipp
npm install
```

Create the environment files from their examples and fill in your Supabase
credentials:

```bash
cp apps/customer/.env.example    apps/customer/.env.local
cp apps/agent/.env.example       apps/agent/.env.local
cp apps/admin/.env.example       apps/admin/.env.local
cp packages/database/.env.example packages/database/.env
```

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes |
| `DATABASE_URL`, `DIRECT_URL` | Prisma (pooled and direct connections) |
| `NEXT_PUBLIC_OFFICE_PHONE` | Optional — enables the "call the office" buttons |

All three apps read the same Supabase project; they are separated by user role.

Generate the Prisma client and seed demo data:

```bash
npm run db:generate
npm run reset-demo      # ⚠ wipes and reseeds — announce first on a shared database
npm run verify-seed
```

Then start an app:

```bash
npm run dev             # vendor app      → http://localhost:3000
npm run dev:agent       # field agent app → http://localhost:3001
npm run dev:admin       # admin console   → http://localhost:3002
```

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | Build every app and package |
| `npm run lint` | ESLint across the workspace |
| `npm run test` | All unit tests (Vitest) |
| `npm run smoke` | Logs in and renders every route (`-- --app=agent` / `--app=admin` for the others) |
| `npm run reset-demo` | Wipe and reseed the demo data |
| `npm run verify-seed` | Check the seeded fixtures are intact |
| `npm run demo-stage` | Show every pickup's stage and what is blocking it |
| `npm run assign-job` | CLI fallback for dispatching a pickup to an agent |

To run the smoke test against production instead of localhost:

```bash
SMOKE_BASE_URL=https://clbipp-customer.vercel.app npm run smoke
SMOKE_BASE_URL=https://clbipp-agent.vercel.app    npm run smoke -- --app=agent
SMOKE_BASE_URL=https://clbipp-admin.vercel.app    npm run smoke -- --app=admin
```

## Deployment

All three apps deploy to Vercel automatically on every push to `main`. There is
no CI, so run `npm run build` and the relevant `npm run smoke` **before**
pushing — see [Before you push](docs/BEFORE_YOU_PUSH.md).

## Documentation

| Doc | Read it for |
|---|---|
| [User Guide](docs/USER_GUIDE.md) | Using the three apps, demo accounts, where every price comes from |
| [Before you push](docs/BEFORE_YOU_PUSH.md) | Pre-push checklist and known traps |
| [Feedback plan](docs/PLAN_FEEDBACK_V2.md) | Current work: the company's feedback rounds and decisions |
| [Demo runbook](docs/DEMO_RUNBOOK.md) | Click path for presenting the platform |
| [Admin plan](docs/PLAN_ADMIN_APP.md) · [Field agent plan](docs/PLAN_FIELD_AGENT_APP.md) · [Vendor plan](docs/PLAN_V2_CUSTOMER_APP.md) | Design decisions behind each app |
| [Native app handover](docs/NATIVE_APP_HANDOVER.md) | Why PWAs, and what a native rebuild would reuse |
| [CLAUDE.md](CLAUDE.md) | Detailed engineering notes and conventions |

## Team

Built as a three-person internship project by **Aamir** (auth, security and
lifecycle workflows), **Khalid** (database, decision engine, PDFs and
deployment) and **Ali** (UI component kit and read screens).
