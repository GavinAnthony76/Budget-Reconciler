/**
 * Idempotent startup bootstrap:
 *  1. Ensure the schema exists (CREATE TABLE IF NOT EXISTS, mirrors lib/db/src/schema/budget.ts).
 *  2. Seed the database from the shipped workbook template if it is empty.
 *
 * Runs on every API server start, so a fresh database (development or a new
 * production deployment) comes up migrated and populated with no manual steps.
 */
import path from "node:path";
import fs from "node:fs";
// @ts-expect-error - xlsx-populate has no bundled types
import XlsxPopulate from "xlsx-populate";
import { sql, eq } from "drizzle-orm";
import { ensureManualMirror } from "./mirror";
import { budgetMonth } from "./budget";
import {
  db,
  settingsTable,
  incomeSourcesTable,
  categoriesTable,
  planLinesTable,
  rulesTable,
  transactionsTable,
} from "@workspace/db";
import { logger } from "./logger";

const TEMPLATE_CANDIDATES = [
  path.resolve(process.cwd(), "templates/budget-template.xlsx"),
  path.resolve(process.cwd(), "artifacts/api-server/templates/budget-template.xlsx"),
];

export function templatePath(): string {
  const p = TEMPLATE_CANDIDATES.find((c) => fs.existsSync(c));
  if (!p) throw new Error("budget-template.xlsx not found");
  return p;
}

async function ensureSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "settings" (
      "id" serial PRIMARY KEY,
      "selected_month" text NOT NULL DEFAULT 'August 2026',
      "month_start_day" integer NOT NULL DEFAULT 29,
      "checking_buffer" double precision NOT NULL DEFAULT 500,
      "debt_strategy" text NOT NULL DEFAULT 'Avalanche'
    );
    CREATE TABLE IF NOT EXISTS "income_sources" (
      "id" serial PRIMARY KEY,
      "name" text NOT NULL,
      "owner" text NOT NULL DEFAULT 'Household',
      "frequency" text NOT NULL DEFAULT 'Monthly',
      "net_amount" double precision NOT NULL DEFAULT 0,
      "monthly_equivalent" double precision NOT NULL DEFAULT 0,
      "notes" text
    );
    CREATE TABLE IF NOT EXISTS "categories" (
      "id" serial PRIMARY KEY,
      "name" text NOT NULL UNIQUE,
      "subcategories" text[] NOT NULL DEFAULT '{}',
      "sort_order" integer NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS "plan_lines" (
      "id" serial PRIMARY KEY,
      "month" text NOT NULL DEFAULT '',
      "category" text NOT NULL,
      "subcategory" text NOT NULL,
      "planned" double precision NOT NULL DEFAULT 0,
      "priority" text NOT NULL DEFAULT 'Medium',
      "fixed_variable" text NOT NULL DEFAULT 'Variable',
      "due_day" integer,
      "notes" text
    );
    CREATE TABLE IF NOT EXISTS "transactions" (
      "id" serial PRIMARY KEY,
      "date" date NOT NULL,
      "description" text NOT NULL,
      "original_description" text,
      "bank_category" text,
      "amount" double precision NOT NULL,
      "status" text NOT NULL DEFAULT 'Posted',
      "account" text,
      "source" text NOT NULL DEFAULT 'bank',
      "category" text,
      "subcategory" text,
      "include" boolean NOT NULL DEFAULT true,
      "month" text NOT NULL,
      "note" text,
      "needs_review" boolean NOT NULL DEFAULT false,
      "fingerprint" text,
      "linked_bank_id" integer,
      "import_id" integer,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "import_id" integer;
    CREATE TABLE IF NOT EXISTS "imports" (
      "id" serial PRIMARY KEY,
      "file_name" text,
      "account" text NOT NULL DEFAULT 'Checking',
      "total_rows" integer NOT NULL DEFAULT 0,
      "added" integer NOT NULL DEFAULT 0,
      "duplicates" integer NOT NULL DEFAULT 0,
      "imported_at" timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS "rules" (
      "id" serial PRIMARY KEY,
      "pattern" text NOT NULL,
      "match_type" text NOT NULL DEFAULT 'description',
      "category" text NOT NULL,
      "subcategory" text NOT NULL
    );
  `);
}

const EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;
const isoFromSerial = (s: number): string =>
  new Date(EPOCH + Math.round(s) * DAY_MS).toISOString().slice(0, 10);
const str = (v: unknown): string => String(v ?? "").trim();
const num = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * One-time migration: plan lines created before per-month plans have
 * month = ''. Duplicate them into every month that has transactions (plus
 * the currently selected month) so historical views keep their targets,
 * then remove the un-monthed originals.
 */
async function migratePlanLineMonths(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE plan_lines ADD COLUMN IF NOT EXISTS "month" text NOT NULL DEFAULT ''
  `);
  // Atomic + serialized across replicas: advisory xact lock, re-check inside
  // the transaction, and insert+delete commit (or roll back) together.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('plan_lines_month_migration'))`);
    const result = await tx.execute(sql`
      SELECT count(*)::int AS n FROM plan_lines WHERE month = ''
    `);
    const n = Number((result.rows?.[0] as { n?: number } | undefined)?.n ?? 0);
    if (n === 0) return;
    await tx.execute(sql`
      INSERT INTO plan_lines (month, category, subcategory, planned, priority, fixed_variable, due_day, notes)
      SELECT m.month, p.category, p.subcategory, p.planned, p.priority, p.fixed_variable, p.due_day, p.notes
      FROM plan_lines p
      CROSS JOIN (
        SELECT DISTINCT month FROM transactions
        UNION
        SELECT selected_month FROM settings
      ) m
      WHERE p.month = ''
    `);
    await tx.execute(sql`DELETE FROM plan_lines WHERE month = ''`);
    logger.info({ unmonthedLines: n }, "migrated plan lines to per-month plans");
  });
}

/**
 * Recompute every transaction's budget month with the current rules (USAA
 * deposit-date cycle boundaries, falling back to monthStartDay). Idempotent:
 * only rows whose label changed are updated.
 */
async function realignBudgetMonths(): Promise<void> {
  const [s] = await db.select().from(settingsTable).limit(1);
  if (!s) return;
  const all = await db
    .select({
      id: transactionsTable.id,
      date: transactionsTable.date,
      month: transactionsTable.month,
    })
    .from(transactionsTable);
  let changed = 0;
  for (const t of all) {
    const month = budgetMonth(t.date, s.monthStartDay);
    if (month !== t.month) {
      await db
        .update(transactionsTable)
        .set({ month })
        .where(eq(transactionsTable.id, t.id));
      changed++;
    }
  }
  if (changed > 0)
    logger.info({ changed }, "realigned transaction budget months to USAA pay cycle");
}

async function seedFromWorkbook(): Promise<void> {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return;

  const wb = await XlsxPopulate.fromFileAsync(templatePath());
  const setup = wb.sheet("Setup");
  const bk = wb.sheet("bk_download");
  const manual = wb.sheet("Manual Actuals");
  const plan = wb.sheet("Budget Plan");
  const rulesSheet = wb.sheet("Rules");

  const startDay = num(setup.cell("B9").value()) || 29;
  const seedMonth = str(setup.cell("B4").value()) || "August 2026";
  await db.insert(settingsTable).values({
    selectedMonth: seedMonth,
    checkingBuffer: num(setup.cell("B5").value()),
    debtStrategy: str(setup.cell("B6").value()) || "Avalanche",
    monthStartDay: startDay,
  });

  // Income sources (Setup D4:H10)
  for (let r = 4; r <= 10; r++) {
    const name = str(setup.cell(`D${r}`).value());
    if (!name || name === "Total Monthly Income") continue;
    const net = num(setup.cell(`G${r}`).value());
    const monthlyRaw = num(setup.cell(`H${r}`).value());
    await db.insert(incomeSourcesTable).values({
      name,
      owner: str(setup.cell(`E${r}`).value()) || "Household",
      frequency: str(setup.cell(`F${r}`).value()) || "Monthly",
      netAmount: net,
      monthlyEquivalent: monthlyRaw || net,
    });
  }

  // Plan lines (Budget Plan rows 4..55)
  const subsByCat = new Map<string, string[]>();
  const catOrder: string[] = [];
  for (let r = 4; r <= 55; r++) {
    const category = str(plan.cell(`A${r}`).value());
    const subcategory = str(plan.cell(`B${r}`).value());
    if (!category || !subcategory) continue;
    const dueDayRaw = plan.cell(`I${r}`).value();
    await db.insert(planLinesTable).values({
      month: seedMonth,
      category,
      subcategory,
      planned: num(plan.cell(`C${r}`).value()),
      priority: str(plan.cell(`G${r}`).value()) || "Medium",
      fixedVariable: str(plan.cell(`H${r}`).value()) || "Variable",
      dueDay: dueDayRaw == null || str(dueDayRaw) === "" ? null : num(dueDayRaw),
      notes: str(plan.cell(`J${r}`).value()) || null,
    });
    if (!subsByCat.has(category)) {
      subsByCat.set(category, []);
      catOrder.push(category);
    }
    const subs = subsByCat.get(category)!;
    if (!subs.includes(subcategory)) subs.push(subcategory);
  }

  // Categories from Setup A11:C29, subcategories enriched from plan lines
  let sortOrder = 0;
  const seededCats = new Set<string>();
  for (let r = 11; r <= 29; r++) {
    const name = str(setup.cell(`A${r}`).value());
    if (!name) continue;
    const defaultSub = str(setup.cell(`B${r}`).value());
    const subs = subsByCat.get(name) ?? (defaultSub ? [defaultSub] : []);
    if (defaultSub && !subs.includes(defaultSub)) subs.push(defaultSub);
    await db
      .insert(categoriesTable)
      .values({ name, subcategories: subs, sortOrder: sortOrder++ })
      .onConflictDoNothing();
    seededCats.add(name);
  }
  for (const name of catOrder) {
    if (seededCats.has(name)) continue;
    await db
      .insert(categoriesTable)
      .values({ name, subcategories: subsByCat.get(name) ?? [], sortOrder: sortOrder++ })
      .onConflictDoNothing();
    seededCats.add(name);
  }

  // Rules: description rules from Rules sheet, bank-category mappings from Setup E15:G79
  let ruleCount = 0;
  if (rulesSheet) {
    for (let r = 2; r <= 500; r++) {
      const pattern = str(rulesSheet.cell(`A${r}`).value());
      if (!pattern) continue;
      await db.insert(rulesTable).values({
        pattern,
        matchType: "description",
        category: str(rulesSheet.cell(`B${r}`).value()) || "Miscellaneous",
        subcategory: str(rulesSheet.cell(`C${r}`).value()) || "Uncategorized",
      });
      ruleCount++;
    }
  }
  for (let r = 15; r <= 79; r++) {
    const pattern = str(setup.cell(`E${r}`).value());
    if (!pattern) continue;
    await db.insert(rulesTable).values({
      pattern,
      matchType: "bankCategory",
      category: str(setup.cell(`F${r}`).value()) || "Miscellaneous",
      subcategory: str(setup.cell(`G${r}`).value()) || "Uncategorized",
    });
    ruleCount++;
  }

  // Bank transactions (bk_download)
  let bankCount = 0;
  for (let r = 2; r <= 5000; r++) {
    const a = bk.cell(`A${r}`).value();
    if (typeof a !== "number") continue;
    const date = isoFromSerial(a);
    const description = str(bk.cell(`B${r}`).value());
    const amount = num(bk.cell(`E${r}`).value());
    const note = str(bk.cell(`N${r}`).value());
    await db.insert(transactionsTable).values({
      date,
      description,
      originalDescription: str(bk.cell(`C${r}`).value()) || null,
      bankCategory: str(bk.cell(`D${r}`).value()) || null,
      amount,
      status: str(bk.cell(`F${r}`).value()) || "Posted",
      account: str(bk.cell(`G${r}`).value()) || "Checking",
      source: "bank",
      category: str(bk.cell(`H${r}`).value()) || "Miscellaneous",
      subcategory: str(bk.cell(`I${r}`).value()) || "Uncategorized",
      include: str(bk.cell(`J${r}`).value()) === "Yes",
      month: str(bk.cell(`K${r}`).value()),
      note: note || null,
      needsReview: note.toLowerCase().includes("needs categorization"),
      fingerprint: `${date}|${description.replace(/\s+/g, " ").trim().toUpperCase()}|${amount.toFixed(2)}`,
    });
    bankCount++;
  }

  // Manual transactions (expenses stored as negative amounts)
  let manualCount = 0;
  for (let r = 2; r <= 5000; r++) {
    const a = manual.cell(`A${r}`).value();
    if (typeof a !== "number") continue;
    const note = str(manual.cell(`I${r}`).value());
    const amt = num(manual.cell(`C${r}`).value());
    await db.insert(transactionsTable).values({
      date: isoFromSerial(a),
      description: str(manual.cell(`B${r}`).value()),
      amount: -Math.abs(amt),
      status: "Posted",
      account: str(manual.cell(`F${r}`).value()) || "Checking",
      source: "manual",
      category: str(manual.cell(`D${r}`).value()) || "Miscellaneous",
      subcategory: str(manual.cell(`E${r}`).value()) || "Uncategorized",
      include: str(manual.cell(`G${r}`).value()) !== "No",
      month: str(manual.cell(`H${r}`).value()),
      note: note || null,
      needsReview: note.toLowerCase().includes("needs categorization"),
    });
    manualCount++;
  }

  logger.info({ bankCount, manualCount, ruleCount }, "Database seeded from workbook");
}

/**
 * Deterministically link manual mirror rows (created by imports or the seed)
 * to their bank counterparts so categorization updates propagate. Idempotent.
 */
async function backfillMirrorLinks(): Promise<void> {
  const result = await db.execute(sql`
    UPDATE "transactions" m
    SET "linked_bank_id" = b.id
    FROM "transactions" b
    WHERE m."source" = 'manual'
      AND m."linked_bank_id" IS NULL
      AND b."source" = 'bank'
      AND b."status" = 'Posted'
      AND b."date" = m."date"
      AND b."amount" = m."amount"
      AND b."description" = m."description"
      AND NOT EXISTS (
        SELECT 1 FROM "transactions" m2 WHERE m2."linked_bank_id" = b.id
      )
      AND (
        SELECT COUNT(*) FROM "transactions" b2
        WHERE b2."source" = 'bank' AND b2."date" = m."date"
          AND b2."amount" = m."amount" AND b2."description" = m."description"
      ) = 1
  `);
  const linked = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  if (linked > 0) logger.info({ linked }, "Backfilled manual mirror links");
}

/**
 * Enforce the invariant that every included, posted bank expense has exactly
 * one manual mirror. Repairs two seed-time artifacts, idempotently:
 * 1. Identical transactions (same fingerprint) where several manual rows got
 *    linked to the SAME bank row while its twin has none — rebalance links.
 * 2. Bank expenses with no mirror at all — link a fuzzy-matching unlinked
 *    manual entry or create a mirror, same rule as CSV import.
 */
async function ensureMirrorsForBankExpenses(): Promise<void> {
  const all = await db.select().from(transactionsTable);
  const bank = all.filter(
    (t) =>
      t.source === "bank" && t.include && t.status === "Posted" && t.amount < 0,
  );
  const mirrorsByBank = new Map<number, number[]>();
  for (const t of all) {
    if (t.source === "manual" && t.linkedBankId != null) {
      const list = mirrorsByBank.get(t.linkedBankId) ?? [];
      list.push(t.id);
      mirrorsByBank.set(t.linkedBankId, list);
    }
  }
  // 1. Rebalance over-linked identical pairs
  let rebalanced = 0;
  for (const b of bank) {
    const mirrors = mirrorsByBank.get(b.id) ?? [];
    if (mirrors.length <= 1) continue;
    const twins = bank.filter(
      (o) =>
        o.id !== b.id &&
        o.fingerprint === b.fingerprint &&
        (mirrorsByBank.get(o.id) ?? []).length === 0,
    );
    while (mirrors.length > 1 && twins.length) {
      const twin = twins.shift()!;
      const moved = mirrors.pop()!;
      await db
        .update(transactionsTable)
        .set({ linkedBankId: twin.id })
        .where(eq(transactionsTable.id, moved));
      mirrorsByBank.set(twin.id, [moved]);
      rebalanced++;
    }
    mirrorsByBank.set(b.id, mirrors);
  }
  // 2. Create/link mirrors for bank expenses that have none
  let repaired = 0;
  for (const b of bank) {
    if ((mirrorsByBank.get(b.id) ?? []).length > 0) continue;
    await ensureManualMirror(b.id, {
      date: b.date,
      desc: b.description,
      orig: b.originalDescription ?? "",
      bankCat: b.bankCategory ?? "",
      amount: b.amount,
      month: b.month,
      category: b.category ?? "Miscellaneous",
      subcategory: b.subcategory ?? "Uncategorized",
      matched: !b.needsReview,
      account: b.account ?? "Checking",
    });
    mirrorsByBank.set(b.id, [-1]); // keep the in-memory snapshot accurate
    repaired++;
  }
  if (rebalanced || repaired)
    logger.info({ rebalanced, repaired }, "Repaired manual mirror invariant");
}

export async function bootstrap(): Promise<void> {
  await ensureSchema();
  await seedFromWorkbook();
  await migratePlanLineMonths();
  await realignBudgetMonths();
  await backfillMirrorLinks();
  await ensureMirrorsForBankExpenses();
}
