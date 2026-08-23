import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
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
import { currentUserId } from "../middlewares/requireUser";
import { getInvestmentOverviewForUser } from "./investments";

const router: IRouter = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const q = GetDashboardQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const settings = await getOrCreateSettings(userId);
  const month = q.data.month ?? settings.selectedMonth;

  const [txns, planLines, incomes] = await Promise.all([
    db.select().from(transactionsTable).where(and(eq(transactionsTable.month, month), eq(transactionsTable.userId, userId))),
    db.select().from(planLinesTable).where(and(eq(planLinesTable.month, month), eq(planLinesTable.userId, userId))),
    db.select().from(incomeSourcesTable).where(eq(incomeSourcesTable.userId, userId)),
  ]);
  const investmentOverview = await getInvestmentOverviewForUser(userId, month);

  const plannedFromSources = incomes.reduce(
    (s, i) => s + i.monthlyEquivalent,
    0,
  );
  // Income counts from bank rows AND manually entered income (e.g. cash,
  // side gigs). Manual rows linked to a bank row are mirrors — skip them so
  // nothing is double-counted.
  const incomeActual = txns
    .filter(
      (t) =>
        norm(t.status) === "POSTED" &&
        t.category === "Income" &&
        t.amount > 0 &&
        (t.source === "bank" ||
          (t.source === "manual" && t.linkedBankId == null)),
    )
    .reduce((s, t) => s + t.amount, 0);

  // Contributions create exactly one linked household transaction. Reporting
  // counts every actual ledger row; it never guesses that two equal transfers
  // are duplicates, because same-day equal contributions can both be real.
  const spending = txns.filter(
    (t) =>
      (t.source === "manual" || t.source === "investment") &&
      t.include &&
      t.amount < 0,
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

  // If no income sources were entered, fall back to the income actually
  // reflected in the imported/entered data so the dashboard stays meaningful.
  const incomePlanned =
    incomes.length === 0 ? incomeActual : plannedFromSources;

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
      investment: investmentOverview.overview.summary,
    }),
  );
});

router.get("/reconciliation", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const q = GetReconciliationQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const settings = await getOrCreateSettings(userId);
  const month = q.data.month ?? settings.selectedMonth;
  const [txns, planLines] = await Promise.all([
    db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.month, month), eq(transactionsTable.userId, userId))),
    db
      .select()
      .from(planLinesTable)
      .where(and(eq(planLinesTable.month, month), eq(planLinesTable.userId, userId))),
  ]);

  const manual = new Map<string, number>();
  const bank = new Map<string, number>();
  for (const t of txns) {
    if (!t.include || t.amount >= 0) continue;
    const c = t.category ?? "Miscellaneous";
    if (t.source === "manual" || t.source === "investment") {
      manual.set(c, (manual.get(c) ?? 0) + -t.amount);
    } else if (norm(t.status) === "POSTED") {
      bank.set(c, (bank.get(c) ?? 0) + -t.amount);
    }
  }
  const cats = [...new Set([...manual.keys(), ...bank.keys()])].sort();
  const plannedByCategory = new Map<string, number>();
  for (const line of planLines) {
    plannedByCategory.set(
      line.category,
      (plannedByCategory.get(line.category) ?? 0) + line.planned,
    );
  }
  const categories = [...new Set([...cats, ...plannedByCategory.keys()])].sort();
  const rows = categories.map((category) => {
    const manualTotal = manual.get(category) ?? 0;
    const bankTotal = bank.get(category) ?? 0;
    const difference = manualTotal - bankTotal;
    const planned = plannedByCategory.get(category) ?? 0;
    const budgetVariance = manualTotal - planned;
    return {
      category,
      manualTotal,
      bankTotal,
      difference,
      planned,
      budgetVariance,
      budgetStatus:
        budgetVariance > 0.01
          ? "Over budget"
          : planned === 0
            ? "No plan"
            : "On track",
      status: Math.abs(difference) < 0.01 ? "Matched" : "Investigate",
    };
  });
  res.json(GetReconciliationResponse.parse(rows));
});

export default router;
