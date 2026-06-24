## Current Architecture Direction

The project is currently structured around a clean separation between the database layer, API layer, engine logic, and frontend UI. The goal is to keep the system deterministic, testable, and maintainable as the platform grows.

The stack currently uses:
- Next.js App Router
- TypeScript
- Prisma ORM
- PostgreSQL

The database schema and migrations live inside `prisma/`. Prisma migrations are already being used properly, meaning schema changes should always happen through `schema.prisma` followed by `npx prisma migrate dev`. Direct manual DB editing should generally be avoided unless coordinated.

The most important architectural rule right now is:

`src/engine/` must remain completely isolated from:
- Prisma
- database queries
- fetch/API calls
- React/frontend code

The engine should only contain pure TypeScript functions. Given inputs, it returns outputs with no side effects. This is intentional because it allows:
- isolated testing
- easier debugging
- deterministic behavior
- future replacement or extension of engine layers
- simpler backend integration

The API routes inside `src/app/api/` act as the orchestration layer. Their job is to:
1. validate requests,
2. load data from Prisma/Postgres,
3. convert Prisma data into plain JS values,
4. call the engine,
5. save results back into the database,
6. return JSON responses.

The engine itself is intentionally being written in TypeScript instead of Python. The current Layers 1–5 are mostly arithmetic, thresholds, scoring logic, and economic calculations. Using TypeScript keeps the frontend, backend, API routes, and engine inside one runtime and one deployment target. This significantly reduces operational complexity during development and deployment.

A major issue everyone must understand early: Prisma Decimal values are NOT normal JavaScript numbers. Financial and measurement fields using `@db.Decimal(...)` return `Prisma.Decimal` objects. These must be converted using `Number(...)` inside API routes before being passed into the engine. The engine should never directly receive Prisma.Decimal objects.

Example:
const laborRate = Number(config.refurbLaborRatePerKg)
NOT: const laborRate = config.refurbLaborRatePerKg * value

Another important schema decision: pathway decisions now require persistent economic breakdowns. The frontend quote breakdown screens cannot be built using only a single costsTotal field. The schema therefore includes JSON-based breakdown structures such as:

- costBreakdown
- revenueBreakdown

These are intentionally stored as JSON instead of fully normalized tables because the breakdown structure may evolve over time. However, the JSON keys themselves should remain consistent across the project for analytics and frontend reliability.
Example of preferred structure:
{
  "refurbLabor": 2700,
  "cellReplacement": 1200,
  "testing": 750
}

The project also uses seed data through prisma/seed.ts. This is necessary because the engine depends on at least one active PathwayFactor configuration existing in the database before decisions can be computed. The seed script provides reproducible baseline operational data for development and testing.

Seed data should remain enabled during:

local development,
demos,
testing,
onboarding new contributors.

Later, in production deployment, automatic seeding should usually be disabled or carefully controlled to avoid overwriting or duplicating operational configuration data.

The current direction prioritizes:

- stable architecture,
- deterministic engine behavior,
- clean separation of concerns,
- easier debugging,
- and minimizing unnecessary complexity during the MVP phase.

The focus now should shift toward implementing engine layers, API routes, and end-to-end workflow integration rather than repeatedly redesigning architecture.
