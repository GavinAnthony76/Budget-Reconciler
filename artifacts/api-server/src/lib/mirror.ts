import { and, eq } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { daysBetween, norm } from "./budget";

/**
 * Ensure an included bank expense has exactly one manual (spending) mirror.
 * Skips when a mirror is already linked to this bank row, or when an existing
 * manual entry fuzzy-covers it (±$0.25, ±4 days — the workbook's verified rule).
 * Used by CSV import and by the startup repair pass so the invariant holds:
 * every included posted bank expense has exactly one manual mirror.
 */
export async function ensureManualMirror(
  bankId: number,
  t: {
    date: string;
    desc: string;
    orig: string;
    bankCat: string;
    amount: number;
    month: string;
    category: string;
    subcategory: string;
    matched: boolean;
    account?: string;
  },
): Promise<void> {
  const linked = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(eq(transactionsTable.linkedBankId, bankId));
  if (linked.length) return;
  const manualRows = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.source, "manual"),
        eq(transactionsTable.month, t.month),
      ),
    );
  // If an existing manual entry covers this bank expense, link the closest
  // unlinked one instead of duplicating, so categorization/exclusion edits
  // propagate between the pair. A match must be identity-safe: within the
  // workbook's ±$0.25/±4-day window AND either an (almost) exact amount or a
  // recognizably similar description — never link unrelated purchases that
  // merely share a price.
  const candidates = manualRows
    .filter(
      (m) =>
        m.linkedBankId == null &&
        // only spending rows can mirror a bank expense — never link income
        m.amount < 0 &&
        daysBetween(m.date, t.date) <= 4 &&
        // exact amount on the same day, or similar merchant within ±$0.25/±4d
        ((Math.abs(Math.abs(m.amount) - Math.abs(t.amount)) < 0.005 &&
          daysBetween(m.date, t.date) === 0) ||
          (Math.abs(Math.abs(m.amount) - Math.abs(t.amount)) <= 0.25 &&
            descSimilar(m.description, m.originalDescription ?? "", t.desc, t.orig))),
    )
    .sort(
      (a, b) =>
        daysBetween(a.date, t.date) - daysBetween(b.date, t.date) ||
        Math.abs(Math.abs(a.amount) - Math.abs(t.amount)) -
          Math.abs(Math.abs(b.amount) - Math.abs(t.amount)),
    );
  if (candidates.length) {
    await db
      .update(transactionsTable)
      .set({ linkedBankId: bankId })
      .where(eq(transactionsTable.id, candidates[0].id));
    return;
  }
  await db.insert(transactionsTable).values({
    date: t.date,
    description: t.desc,
    originalDescription: t.orig || null,
    bankCategory: t.bankCat || null,
    amount: t.amount,
    status: "Posted",
    account: t.account ?? "Checking",
    source: "manual",
    category: t.category,
    subcategory: t.subcategory,
    include: true, // real spending counts even before categorization
    month: t.month,
    note: t.matched
      ? "Imported from bank"
      : "Imported from bank - needs categorization",
    needsReview: !t.matched,
    linkedBankId: bankId,
  });
}

/** True when two transactions' descriptions plausibly refer to the same merchant. */
export function descSimilar(
  aDesc: string,
  aOrig: string,
  bDesc: string,
  bOrig: string,
): boolean {
  const as = [norm(aDesc), norm(aOrig)].filter(Boolean);
  const bs = [norm(bDesc), norm(bOrig)].filter(Boolean);
  for (const a of as) {
    for (const b of bs) {
      if (a.slice(0, 8) === b.slice(0, 8)) return true;
      if (a.includes(b) || b.includes(a)) return true;
      const tokensA = a.split(/[^A-Z0-9]+/).filter((w) => w.length >= 4);
      const tokensB = new Set(b.split(/[^A-Z0-9]+/).filter((w) => w.length >= 4));
      if (tokensA.some((w) => tokensB.has(w))) return true;
    }
  }
  return false;
}
