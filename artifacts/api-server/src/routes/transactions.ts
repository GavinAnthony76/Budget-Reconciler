import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { db, transactionsTable, rulesTable } from "@workspace/db";
import {
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  CreateTransactionBody,
  CreateTransactionResponse,
  UpdateTransactionParams,
  UpdateTransactionBody,
  UpdateTransactionResponse,
  DeleteTransactionParams,
  ImportCsvBody,
  ImportCsvResponse,
} from "@workspace/api-zod";
import {
  budgetMonth,
  categorizeWith,
  daysBetween,
  fingerprintOf,
  loadRules,
  money,
  norm,
  parseDateString,
  applyRuleRetroactively,
} from "../lib/budget";
import { getOrCreateSettings } from "./budget";

const router: IRouter = Router();

router.get("/transactions", async (req, res): Promise<void> => {
  const q = ListTransactionsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const conds = [];
  if (q.data.month) conds.push(eq(transactionsTable.month, q.data.month));
  if (q.data.needsReview !== undefined)
    conds.push(eq(transactionsTable.needsReview, q.data.needsReview));
  if (q.data.source) conds.push(eq(transactionsTable.source, q.data.source));
  const rows = await db
    .select()
    .from(transactionsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(transactionsTable.date), asc(transactionsTable.id));
  res.json(ListTransactionsResponse.parse(rows));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await getOrCreateSettings();
  const data = parsed.data;
  const month = budgetMonth(data.date, settings.monthStartDay);
  const [row] = await db
    .insert(transactionsTable)
    .values({
      date: data.date,
      description: data.description,
      amount: data.amount,
      status: "Posted",
      account: data.account ?? "Cash",
      source: "manual",
      category: data.category ?? "Miscellaneous",
      subcategory: data.subcategory ?? "Uncategorized",
      include: true,
      month,
      note: data.note ?? null,
      needsReview: !data.category,
    })
    .returning();
  res.status(201).json(CreateTransactionResponse.parse(row));
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const params = UpdateTransactionParams.safeParse(req.params);
  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { saveRule, rulePattern, ...fields } = parsed.data;
  const update: Record<string, unknown> = { ...fields };
  if (fields.category) update.needsReview = false;
  // Excluding a transaction resolves its review — the user made a decision.
  if (fields.include === false) update.needsReview = false;
  const [row] = await db
    .update(transactionsTable)
    .set(update)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  // Keep the bank row and its manual mirror in sync — dashboard actuals come
  // from manual rows, reconciliation from bank rows; they must agree.
  const propagate: Record<string, unknown> = {};
  if (fields.category !== undefined) propagate.category = fields.category;
  if (fields.subcategory !== undefined) propagate.subcategory = fields.subcategory;
  if (fields.include !== undefined) propagate.include = fields.include;
  if (fields.category || fields.include === false) propagate.needsReview = false;
  if (Object.keys(propagate).length) {
    if (row.source === "bank") {
      await db
        .update(transactionsTable)
        .set(propagate)
        .where(eq(transactionsTable.linkedBankId, row.id));
    } else if (row.linkedBankId != null) {
      await db
        .update(transactionsTable)
        .set(propagate)
        .where(eq(transactionsTable.id, row.linkedBankId));
    }
  }
  if (saveRule && fields.category && fields.subcategory) {
    const pattern =
      rulePattern && rulePattern.trim() !== ""
        ? rulePattern.trim()
        : row.description;
    await db.insert(rulesTable).values({
      pattern,
      matchType: "description",
      category: fields.category,
      subcategory: fields.subcategory,
    });
    await applyRuleRetroactively({
      pattern,
      category: fields.category,
      subcategory: fields.subcategory,
    });
  }
  res.json(UpdateTransactionResponse.parse(row));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(transactionsTable)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  // Remove the linked counterpart too — a half-deleted pair would silently
  // skew dashboard totals against reconciliation.
  if (row.source === "bank") {
    await db
      .delete(transactionsTable)
      .where(eq(transactionsTable.linkedBankId, row.id));
  } else if (row.linkedBankId != null) {
    await db
      .delete(transactionsTable)
      .where(eq(transactionsTable.id, row.linkedBankId));
  }
  res.sendStatus(204);
});

// ---- CSV import ----
router.post("/import", async (req, res): Promise<void> => {
  const parsed = ImportCsvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await getOrCreateSettings();
  const startDay = settings.monthStartDay;
  const rules = await loadRules();

  const csv = Papa.parse<Record<string, string>>(parsed.data.csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  const fatal = csv.errors.filter((e) => e.type !== "FieldMismatch");
  if (fatal.length) {
    res.status(400).json({
      error: `CSV parse error: ${fatal[0].message} (row ${fatal[0].row ?? "?"})`,
    });
    return;
  }
  if (!csv.data.length || !("Date" in (csv.data[0] ?? {}))) {
    res.status(400).json({
      error:
        "Unrecognized CSV format. Expected bank download columns: Date, Description, Original Description, Category, Amount, Status.",
    });
    return;
  }

  type Incoming = {
    date: string;
    desc: string;
    orig: string;
    bankCat: string;
    amount: number;
    status: string;
  };
  let incoming: Incoming[];
  try {
    incoming = csv.data.map((row) => ({
      date: parseDateString(row["Date"] ?? ""),
      desc: (row["Description"] ?? "").trim(),
      orig: (row["Original Description"] ?? "").trim(),
      bankCat: (row["Category"] ?? "").trim(),
      amount: money(row["Amount"]),
      status: (row["Status"] ?? "Posted").trim(),
    }));
  } catch (e) {
    res.status(400).json({ error: String(e instanceof Error ? e.message : e) });
    return;
  }

  const existingBank = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.source, "bank"));

  // Dedupe with multiplicity on fingerprint
  const counts = new Map<string, number>();
  for (const t of existingBank) {
    const k = t.fingerprint ?? fingerprintOf(t.date, t.description, t.amount);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  let added = 0;
  let duplicates = 0;
  let pendingReplaced = 0;
  let autoCategorized = 0;
  let needsReviewCount = 0;

  for (const t of incoming) {
    const k = fingerprintOf(t.date, t.desc, t.amount);
    const have = counts.get(k) ?? 0;
    if (have > 0) {
      counts.set(k, have - 1);
      duplicates++;
      // Upgrade Pending -> Posted if the CSV now says Posted
      if (norm(t.status) === "POSTED") {
        const match = existingBank.find(
          (e) =>
            (e.fingerprint ?? fingerprintOf(e.date, e.description, e.amount)) === k &&
            norm(e.status) === "PENDING",
        );
        if (match) {
          await db
            .update(transactionsTable)
            .set({ status: "Posted", include: computeInclude(match.category, match.bankCategory, "Posted") })
            .where(eq(transactionsTable.id, match.id));
          match.status = "Posted";
          // A newly-posted expense now counts — make sure it has a manual mirror
          if (
            match.amount < 0 &&
            match.category !== "Transfers" &&
            match.category !== "Income" &&
            computeInclude(match.category, match.bankCategory, "Posted")
          ) {
            await ensureManualMirror(match.id, {
              date: match.date,
              desc: match.description,
              orig: match.originalDescription ?? "",
              bankCat: match.bankCategory ?? "",
              amount: match.amount,
              month: match.month,
              category: match.category ?? "Miscellaneous",
              subcategory: match.subcategory ?? "Uncategorized",
              matched: !match.needsReview,
            });
          }
        }
      }
      continue;
    }

    const isPending = norm(t.status) === "PENDING";

    // Posted row superseding an existing Pending row (banks re-describe pending rows)
    if (!isPending) {
      const pending = existingBank.find(
        (e) =>
          norm(e.status) === "PENDING" &&
          Math.abs(e.amount - t.amount) < 0.005 &&
          daysBetween(e.date, t.date) <= 7 &&
          (norm(e.originalDescription ?? "").slice(0, 12) === norm(t.orig).slice(0, 12) ||
            norm(e.description).slice(0, 12) === norm(t.desc).slice(0, 12)),
      );
      if (pending) {
        await db
          .delete(transactionsTable)
          .where(eq(transactionsTable.id, pending.id));
        pending.status = "__REPLACED__";
        pendingReplaced++;
      }
    }

    const { category, subcategory, matched } = categorizeWith(
      rules,
      t.desc,
      t.orig,
      t.bankCat,
    );
    const include = computeInclude(category, t.bankCat, t.status);
    const month = budgetMonth(t.date, startDay);
    const needsReview = !isPending && !matched;
    if (matched) autoCategorized++;
    if (needsReview) needsReviewCount++;

    const [bankRow] = await db
      .insert(transactionsTable)
      .values({
        date: t.date,
        description: t.desc,
        originalDescription: t.orig || null,
        bankCategory: t.bankCat || null,
        amount: t.amount,
        status: isPending ? "Pending" : "Posted",
        account: "Checking",
        source: "bank",
        category,
        subcategory,
        include,
        month,
        note: isPending ? "Pending - not counted until posted" : null,
        needsReview,
        fingerprint: k,
      })
      .returning();
    added++;
    existingBank.push(bankRow);
    counts.set(k, 0);

    // Mirror the workbook: included bank expenses become manual (spending) rows
    // unless an existing manual entry already covers them (±$0.25, ±4 days).
    if (
      !isPending &&
      include &&
      t.amount < 0 &&
      category !== "Transfers" &&
      category !== "Income"
    ) {
      await ensureManualMirror(bankRow.id, {
        date: t.date,
        desc: t.desc,
        orig: t.orig,
        bankCat: t.bankCat,
        amount: t.amount,
        month,
        category,
        subcategory,
        matched,
      });
    }
  }

  res.json(
    ImportCsvResponse.parse({
      totalRows: incoming.length,
      added,
      duplicates,
      pendingReplaced,
      autoCategorized,
      needsReview: needsReviewCount,
    }),
  );
});

/**
 * Ensure an included bank expense has exactly one manual (spending) mirror.
 * Skips when a mirror is already linked to this bank row, or when an existing
 * manual entry fuzzy-covers it (±$0.25, ±4 days — the workbook's verified rule).
 */
async function ensureManualMirror(
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
    account: "Checking",
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
function descSimilar(
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

function computeInclude(
  category: string | null,
  bankCat: string | null,
  status: string,
): boolean {
  if (norm(status) === "PENDING") return false;
  if (category === "Transfers" || category === "Income") return false;
  const bc = norm(bankCat ?? "");
  if (bc === "TRANSFER" || bc === "TRANSFERS") return false;
  return true;
}

export default router;
