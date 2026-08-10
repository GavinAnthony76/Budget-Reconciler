# Household Budget Automation

Automates a personal Excel budget workbook: imports bank CSV downloads, auto-categorizes transactions via merchant rules, and reconciles the workbook (a companion web app is planned).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `scripts/src/import-bank-csv.ts` — bank CSV → workbook importer (run: `pnpm --filter @workspace/scripts run import-bank -- --csv <csv> --in <xlsx> --out <xlsx>`; paths resolve from `scripts/`)
- `attached_assets/` — user's original workbook + bank CSV downloads
- `exports/KJA_Budget_Fixed.xlsx` — latest fixed/imported workbook output

## Workbook conventions (source of truth for budget logic)

- Budget month runs on a pay cycle: transactions on/after the "Budget Month Start Day" (Setup!B9, default 29) belong to the NEXT month
- "Rules" sheet: merchant substring → Budget Category/Subcategory; takes precedence over the Setup!E14:G79 bank-category mapping table
- Pending bank rows are excluded from totals; a matching Posted row replaces its Pending twin on import
- Manual Actuals is the actuals source ("Manual (Live)" mode); the importer appends bank expenses not already entered manually (match: amount ±$0.25, date ±4 days)

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
