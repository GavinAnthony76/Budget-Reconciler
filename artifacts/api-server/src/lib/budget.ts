import { db, rulesTable, transactionsTable, type Rule } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const norm = (s: unknown): string =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

export const money = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Parse "YYYY-MM-DD" or "M/D/YYYY" into a YYYY-MM-DD string. */
export function parseDateString(v: string): string {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return `${y}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
  }
  throw new Error(`Unparseable date: ${v}`);
}

/**
 * USAA early end-of-month deposit dates for 2026 (soonest funds are
 * available). Each date is the first day of the NEXT budget month — e.g.
 * the Jul 31 EOM pay arrives Jul 29, so "August 2026" runs Jul 29–Aug 27.
 * Source: published 2026 USAA military pay deposit schedule.
 */
export const USAA_CYCLE_STARTS: ReadonlyArray<readonly [string, string]> = [
  ["2026-01-28", "February 2026"],
  ["2026-02-25", "March 2026"],
  ["2026-03-30", "April 2026"],
  ["2026-04-29", "May 2026"],
  ["2026-05-27", "June 2026"],
  ["2026-06-29", "July 2026"],
  ["2026-07-29", "August 2026"],
  ["2026-08-28", "September 2026"],
  ["2026-09-29", "October 2026"],
  ["2026-10-28", "November 2026"],
  ["2026-11-27", "December 2026"],
  ["2026-12-29", "January 2027"],
];

/**
 * Pay-cycle budget month. Inside the published USAA schedule, a date belongs
 * to the cycle opened by the most recent early EOM deposit date. Outside the
 * schedule, falls back to the fixed rule: day >= startDay → NEXT month.
 */
export function budgetMonth(isoDate: string, startDay: number): string {
  const first = USAA_CYCLE_STARTS[0][0];
  const last = USAA_CYCLE_STARTS[USAA_CYCLE_STARTS.length - 1][0];
  if (isoDate >= first && isoDate < nextCycleEndExclusive(last)) {
    let label = "";
    for (const [start, cycleLabel] of USAA_CYCLE_STARTS) {
      if (isoDate >= start) label = cycleLabel;
      else break;
    }
    if (label) return label;
  }
  const [y, mo, d] = isoDate.split("-").map(Number);
  let year = y;
  let monthIdx = mo - 1;
  if (d >= startDay) {
    monthIdx += 1;
    if (monthIdx > 11) {
      monthIdx = 0;
      year += 1;
    }
  }
  return `${MONTHS[monthIdx]} ${year}`;
}

/** The last table entry covers roughly one month past its start date. */
function nextCycleEndExclusive(lastStart: string): string {
  const d = new Date(lastStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 33);
  return d.toISOString().slice(0, 10);
}

/** Next month label after e.g. "August 2026" → "September 2026". */
export function nextMonthLabel(label: string): string {
  const [name, yearStr] = label.split(" ");
  let idx = MONTHS.indexOf(name);
  let year = Number(yearStr) || 0;
  idx += 1;
  if (idx > 11) {
    idx = 0;
    year += 1;
  }
  return `${MONTHS[idx]} ${year}`;
}

/** Sortable key for "August 2026" style month labels. */
export function monthSortKey(label: string): number {
  const [name, yearStr] = label.split(" ");
  const idx = MONTHS.indexOf(name);
  return (Number(yearStr) || 0) * 12 + (idx >= 0 ? idx : 0);
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(
    (Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000,
  );
}

export function fingerprintOf(
  isoDate: string,
  description: string,
  amount: number,
): string {
  return `${isoDate}|${norm(description)}|${amount.toFixed(2)}`;
}

/** Remove null-valued keys so inserts/updates fall back to column defaults. */
export function stripNulls<T extends Record<string, unknown>>(
  obj: T,
  keepNullFor: string[] = [],
): { [K in keyof T]?: Exclude<T[K], null> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null && !keepNullFor.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as { [K in keyof T]?: Exclude<T[K], null> };
}

export interface CategorizeResult {
  category: string;
  subcategory: string;
  matched: boolean;
}

/** Description rules first (substring), then bank-category mapping rules. */
export function categorizeWith(
  rules: Rule[],
  desc: string,
  origDesc: string,
  bankCat: string,
): CategorizeResult {
  const d = norm(desc);
  const od = norm(origDesc);
  for (const r of rules) {
    if (r.matchType !== "description") continue;
    const pat = norm(r.pattern);
    if (pat && (d.includes(pat) || od.includes(pat))) {
      return { category: r.category, subcategory: r.subcategory, matched: true };
    }
  }
  const bc = norm(bankCat);
  if (bc && bc !== "CATEGORY PENDING" && bc !== "UNCATEGORIZED") {
    for (const r of rules) {
      if (r.matchType !== "bankCategory") continue;
      if (norm(r.pattern) === bc) {
        return {
          category: r.category,
          subcategory: r.subcategory,
          matched: true,
        };
      }
    }
  }
  return { category: "Miscellaneous", subcategory: "Uncategorized", matched: false };
}

export async function loadRules(): Promise<Rule[]> {
  return db.select().from(rulesTable);
}

/**
 * Retroactively apply a description rule to transactions still needing review.
 * Returns the number of transactions updated.
 */
export async function applyRuleRetroactively(rule: {
  pattern: string;
  category: string;
  subcategory: string;
}): Promise<number> {
  const pat = norm(rule.pattern);
  if (!pat) return 0;
  const candidates = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.needsReview, true)));
  const fields = {
    category: rule.category,
    subcategory: rule.subcategory,
    needsReview: false,
  };
  let updated = 0;
  for (const t of candidates) {
    if (
      norm(t.description).includes(pat) ||
      norm(t.originalDescription ?? "").includes(pat)
    ) {
      await db
        .update(transactionsTable)
        .set(fields)
        .where(eq(transactionsTable.id, t.id));
      // Propagate to the linked counterpart even if it was already reviewed —
      // a linked pair must never end up with diverging categories.
      if (t.source === "bank") {
        await db
          .update(transactionsTable)
          .set(fields)
          .where(eq(transactionsTable.linkedBankId, t.id));
      } else if (t.linkedBankId != null) {
        await db
          .update(transactionsTable)
          .set(fields)
          .where(eq(transactionsTable.id, t.linkedBankId));
      }
      updated++;
    }
  }
  return updated;
}
