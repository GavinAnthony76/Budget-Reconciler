import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  transactionsTable,
  planLinesTable,
  incomeSourcesTable,
} from "@workspace/db";
import {
  GetDashboardQueryParams,
  GetDashboardResponse,
  GetReconciliationQueryParams,
  GetReconciliationResponse,
} from "@workspace/api-zod";
import { norm } from "../lib/budget";
import { getOrCreateSettings } from "./budget";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const q = GetDashboardQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const settings = await getOrCreateSettings();
  const month = q.data.month ?? settings.selectedMonth;

  const [txns, planLines, incomes] = await Promise.all([
    db.select().from(transactionsTable).where(eq(transactionsTable.month, month)),
    db.select().from(planLinesTable),
    db.select().from(incomeSourcesTable),
  ]);

  const incomePlanned = incomes.reduce((s, i) => s + i.monthlyEquivalent, 0);
  const incomeActual = txns
    .filter(
      (t) =>
        t.source === "bank" &&
        norm(t.status) === "POSTED" &&
        t.category === "Income" &&
        t.amount > 0,
    )
    .reduce((s, t) => s + t.amount, 0);

  // Actual spending comes from manual (live) rows — the workbook's source of truth
  const spending = txns.filter(
    (t) => t.source === "manual" && t.include && t.amount < 0,
  );
  const actualExpenses = spending.reduce((s, t) => s + -t.amount, 0);

  const plannedByCat = new Map<string, number>();
  for (const p of planLines) {
    plannedByCat.set(p.category, (plannedByCat.get(p.category) ?? 0) + p.planned);
  }
  const actualByCat = new Map<string, number>();
  for (const t of spending) {
    const c = t.category ?? "Miscellaneous";
    actualByCat.set(c, (actualByCat.get(c) ?? 0) + -t.amount);
  }
  const cats = [...new Set([...plannedByCat.keys(), ...actualByCat.keys()])];
  const byCategory = cats
    .map((category) => {
      const planned = plannedByCat.get(category) ?? 0;
      const actual = actualByCat.get(category) ?? 0;
      return { category, planned, actual, remaining: planned - actual };
    })
    .sort((a, b) => b.actual - a.actual);

  const plannedExpenses = planLines.reduce((s, p) => s + p.planned, 0);
  const reviewCount = txns.filter((t) => t.needsReview).length;
  const pendingCount = txns.filter((t) => norm(t.status) === "PENDING").length;

  res.json(
    GetDashboardResponse.parse({
      month,
      incomePlanned,
      incomeActual,
      plannedExpenses,
      actualExpenses,
      remaining: plannedExpenses - actualExpenses,
      cashFlow: incomeActual - actualExpenses,
      reviewCount,
      pendingCount,
      byCategory,
    }),
  );
});

router.get("/reconciliation", async (req, res): Promise<void> => {
  const q = GetReconciliationQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const settings = await getOrCreateSettings();
  const month = q.data.month ?? settings.selectedMonth;
  const txns = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.month, month));

  const manual = new Map<string, number>();
  const bank = new Map<string, number>();
  for (const t of txns) {
    if (!t.include || t.amount >= 0) continue;
    const c = t.category ?? "Miscellaneous";
    if (t.source === "manual") manual.set(c, (manual.get(c) ?? 0) + -t.amount);
    else if (norm(t.status) === "POSTED")
      bank.set(c, (bank.get(c) ?? 0) + -t.amount);
  }
  const cats = [...new Set([...manual.keys(), ...bank.keys()])].sort();
  const rows = cats.map((category) => {
    const manualTotal = manual.get(category) ?? 0;
    const bankTotal = bank.get(category) ?? 0;
    const difference = manualTotal - bankTotal;
    return {
      category,
      manualTotal,
      bankTotal,
      difference,
      status: Math.abs(difference) < 0.01 ? "Matched" : "Investigate",
    };
  });
  res.json(GetReconciliationResponse.parse(rows));
});

export default router;
