import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { db, transactionsTable, rulesTable, importsTable } from "@workspace/db";
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
  ListImportsResponse,
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
import { ensureManualMirror } from "../lib/mirror";

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

  // Each import is tied to an account: users may upload several CSV files
  // from several bank accounts, and files from the same account often
  // overlap in date range. Dedupe only against rows from the SAME account —
  // identical-looking transactions on different accounts are both real.
  //
  // The account label is detected automatically: if the file shares rows
  // with an existing account, it's another download from that account;
  // otherwise it gets the next free "Account N" label. An explicit account
  // in the request overrides detection (used by tests/scripts).
  const allBank = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.source, "bank"));
  let account = (parsed.data.account ?? "").trim();
  if (!account) {
    const incomingKeys = new Set(
      incoming.map((t) => fingerprintOf(t.date, t.desc, t.amount)),
    );
    const overlapByAccount = new Map<string, number>();
    for (const t of allBank) {
      const k = t.fingerprint ?? fingerprintOf(t.date, t.description, t.amount);
      if (incomingKeys.has(k)) {
        const a = (t.account ?? "").trim() || "Account 1";
        overlapByAccount.set(a, (overlapByAccount.get(a) ?? 0) + 1);
      }
    }
    let best = "";
    let bestN = 0;
    for (const [a, n] of overlapByAccount) {
      if (n > bestN) {
        best = a;
        bestN = n;
      }
    }
    if (best) {
      account = best;
    } else {
      const labels = new Set(
        allBank.map((t) => (t.account ?? "").trim()).filter(Boolean),
      );
      let n = 1;
      while (labels.has(`Account ${n}`)) n++;
      account = `Account ${n}`;
    }
  }
  const existingBank = allBank.filter(
    (t) => ((t.account ?? "").trim() || "Account 1") === account,
  );

  const [batch] = await db
    .insert(importsTable)
    .values({
      fileName: parsed.data.fileName ?? null,
      account,
      totalRows: 0,
    })
    .returning();

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

  try {
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
              account: match.account ?? account,
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
        account,
        source: "bank",
        category,
        subcategory,
        include,
        month,
        note: isPending ? "Pending - not counted until posted" : null,
        needsReview,
        fingerprint: k,
        importId: batch.id,
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
        account,
      });
    }
  }
  } catch (err) {
    // Don't leave a zombie batch behind if the import failed mid-way and
    // added no rows; batches with rows stay so the partial import is visible.
    if (added === 0) {
      await db.delete(importsTable).where(eq(importsTable.id, batch.id));
    } else {
      await db
        .update(importsTable)
        .set({ totalRows: incoming.length, added, duplicates })
        .where(eq(importsTable.id, batch.id));
    }
    throw err;
  }

  await db
    .update(importsTable)
    .set({ totalRows: incoming.length, added, duplicates })
    .where(eq(importsTable.id, batch.id));

  res.json(
    ImportCsvResponse.parse({
      totalRows: incoming.length,
      added,
      duplicates,
      pendingReplaced,
      autoCategorized,
      needsReview: needsReviewCount,
      importId: batch.id,
      account,
    }),
  );
});

// Delete an import record, but never orphan data: only allowed once none of
// its transactions remain (used to tidy up empty/test imports).
router.delete("/imports/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [batch] = await db
    .select()
    .from(importsTable)
    .where(eq(importsTable.id, id));
  if (!batch) {
    res.status(404).json({ error: "Import not found" });
    return;
  }
  const remaining = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(eq(transactionsTable.importId, id))
    .limit(1);
  if (remaining.length) {
    res.status(409).json({ error: "Import still has transactions" });
    return;
  }
  await db.delete(importsTable).where(eq(importsTable.id, id));
  res.sendStatus(204);
});

// ---- Import history: which files/accounts the data came from ----
router.get("/imports", async (_req, res): Promise<void> => {
  const batches = await db
    .select()
    .from(importsTable)
    .orderBy(desc(importsTable.importedAt), desc(importsTable.id));
  const txns = await db
    .select({
      importId: transactionsTable.importId,
      month: transactionsTable.month,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.source, "bank"));
  const monthsByImport = new Map<number, Set<string>>();
  for (const t of txns) {
    if (t.importId == null) continue;
    if (!monthsByImport.has(t.importId)) monthsByImport.set(t.importId, new Set());
    monthsByImport.get(t.importId)!.add(t.month);
  }
  res.json(
    ListImportsResponse.parse(
      batches.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        account: b.account,
        totalRows: b.totalRows,
        added: b.added,
        duplicates: b.duplicates,
        importedAt: b.importedAt.toISOString(),
        months: [...(monthsByImport.get(b.id) ?? [])].sort(),
      })),
    ),
  );
});

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
