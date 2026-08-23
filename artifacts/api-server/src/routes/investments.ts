import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  categoriesTable,
  investmentAccountsTable,
  investmentGoalsTable,
  investmentHoldingsTable,
  investmentSecuritiesTable,
  investmentSetupTable,
  investmentTargetAllocationsTable,
  investmentTransactionsTable,
  planLinesTable,
  transactionsTable,
} from "@workspace/db";
import {
  CreateInvestmentAccountBody,
  CreateInvestmentAccountResponse,
  CreateInvestmentGoalBody,
  CreateInvestmentGoalResponse,
  CreateInvestmentHoldingBody,
  CreateInvestmentHoldingResponse,
  CreateInvestmentTargetAllocationBody,
  CreateInvestmentTargetAllocationResponse,
  CreateInvestmentTransactionBody,
  CreateInvestmentTransactionResponse,
  DeleteInvestmentAccountParams,
  DeleteInvestmentGoalParams,
  DeleteInvestmentHoldingParams,
  DeleteInvestmentTargetAllocationParams,
  DeleteInvestmentTransactionParams,
  GetInvestmentOverviewResponse,
  UpdateInvestmentAccountBody,
  UpdateInvestmentAccountParams,
  UpdateInvestmentAccountResponse,
  UpdateInvestmentGoalBody,
  UpdateInvestmentGoalParams,
  UpdateInvestmentGoalResponse,
  UpdateInvestmentHoldingBody,
  UpdateInvestmentHoldingParams,
  UpdateInvestmentHoldingResponse,
  UpdateInvestmentTargetAllocationBody,
  UpdateInvestmentTargetAllocationParams,
  UpdateInvestmentTargetAllocationResponse,
  UpdateInvestmentTransactionBody,
  UpdateInvestmentTransactionParams,
  UpdateInvestmentTransactionResponse,
} from "@workspace/api-zod";
import { budgetMonth, nextMonthLabel } from "../lib/budget";
import { currentUserId } from "../middlewares/requireUser";
import { getOrCreateSettings } from "./budget";

const router: IRouter = Router();
const INITIAL_SECURITIES = [
  ["MSFT", "Microsoft Corporation", 80],
  ["GOOGL", "Alphabet Inc.", 70],
  ["AMZN", "Amazon.com, Inc.", 60],
  ["VTI", "Vanguard Total Stock Market ETF", 50],
  ["BRK.B", "Berkshire Hathaway Inc. Class B", 25],
  ["NVDA", "NVIDIA Corporation", 15],
] as const;

type InvestmentTransactionKind =
  | "deposit"
  | "withdrawal"
  | "buy"
  | "sell"
  | "dividend"
  | "dividend_reinvestment"
  | "fee";

function goalTargetDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 5);
  return date.toISOString().slice(0, 10);
}

async function accountOwnedBy(userId: string, accountId: number): Promise<boolean> {
  const [account] = await db
    .select({ id: investmentAccountsTable.id })
    .from(investmentAccountsTable)
    .where(and(eq(investmentAccountsTable.id, accountId), eq(investmentAccountsTable.userId, userId)))
    .limit(1);
  return Boolean(account);
}

async function securityOwnedBy(userId: string, securityId: number): Promise<boolean> {
  const [security] = await db
    .select({ id: investmentSecuritiesTable.id })
    .from(investmentSecuritiesTable)
    .where(and(eq(investmentSecuritiesTable.id, securityId), eq(investmentSecuritiesTable.userId, userId)))
    .limit(1);
  return Boolean(security);
}

async function getOrCreateSecurity(userId: string, ticker: string, securityName: string) {
  const normalizedTicker = ticker.trim().toUpperCase();
  const [existing] = await db
    .select()
    .from(investmentSecuritiesTable)
    .where(and(eq(investmentSecuritiesTable.userId, userId), eq(investmentSecuritiesTable.ticker, normalizedTicker)))
    .limit(1);
  if (existing) {
    if (securityName.trim() && existing.securityName !== securityName.trim()) {
      const [updated] = await db
        .update(investmentSecuritiesTable)
        .set({ securityName: securityName.trim() })
        .where(eq(investmentSecuritiesTable.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }
  const [created] = await db
    .insert(investmentSecuritiesTable)
    .values({
      userId,
      ticker: normalizedTicker,
      securityName: securityName.trim() || normalizedTicker,
      source: "manual",
    })
    .returning();
  return created;
}

/**
 * Seed a private, manual-first workspace on first visit. Seeding is scoped to
 * the signed-in user and never overwrites the values they later edit.
 */
export async function ensureInvestmentWorkspace(userId: string): Promise<void> {
  const [existingAccount] = await db
    .select()
    .from(investmentAccountsTable)
    .where(eq(investmentAccountsTable.userId, userId))
    .limit(1);
  if (existingAccount) {
    await db
      .insert(investmentSetupTable)
      .values({ userId })
      .onConflictDoNothing();
    return;
  }
  const [setup] = await db
    .insert(investmentSetupTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (!setup) return;
  const [account] = await db
    .insert(investmentAccountsTable)
    .values({
      userId,
      name: "Charles Schwab taxable brokerage",
      institution: "Charles Schwab",
      accountType: "Taxable brokerage",
      cashBalance: 0,
      source: "manual",
    })
    .returning();

  for (const [ticker, securityName, monthlyAmount] of INITIAL_SECURITIES) {
    const security = await getOrCreateSecurity(userId, ticker, securityName);
    await db.insert(investmentHoldingsTable).values({
      userId,
      accountId: account.id,
      securityId: security.id,
      shares: 0,
      averageCost: 0,
      currentPrice: 0,
      source: "manual",
    });
    await db.insert(investmentTargetAllocationsTable).values({
      userId,
      accountId: account.id,
      securityId: security.id,
      monthlyAmount,
    });
  }

  await db.insert(investmentGoalsTable).values({
    userId,
    accountId: account.id,
    name: "$25K Investment Goal",
    targetAmount: 25_000,
    monthlyPlannedContribution: 300,
    targetDate: goalTargetDate(),
  });
}

function contributionAmount(type: string, amount: number): number {
  if (type === "deposit") return amount;
  if (type === "withdrawal") return -amount;
  return 0;
}

function cashImpact(type: string, amount: number): number {
  if (type === "deposit" || type === "sell" || type === "dividend") return amount;
  if (type === "withdrawal" || type === "buy" || type === "fee") return -amount;
  return 0;
}

async function adjustCashBalance(accountId: number, delta: number): Promise<void> {
  if (delta === 0) return;
  await db
    .update(investmentAccountsTable)
    .set({ cashBalance: sql`${investmentAccountsTable.cashBalance} + ${delta}` })
    .where(eq(investmentAccountsTable.id, accountId));
}

function isHouseholdContribution(type: string): boolean {
  return type === "deposit" || type === "withdrawal";
}

function householdContributionAmount(type: string, amount: number): number {
  return type === "deposit" ? -amount : amount;
}

async function removeHouseholdContribution(
  userId: string,
  transaction: typeof investmentTransactionsTable.$inferSelect,
): Promise<void> {
  if (!transaction.linkedHouseholdTransactionId) return;
  const [linked] = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.id, transaction.linkedHouseholdTransactionId),
        eq(transactionsTable.userId, userId),
      ),
    )
    .limit(1);
  if (linked?.source === "investment") {
    await db.delete(transactionsTable).where(eq(transactionsTable.id, linked.id));
  }
}

async function syncHouseholdContribution(
  userId: string,
  transaction: typeof investmentTransactionsTable.$inferSelect,
): Promise<void> {
  const [linked] = transaction.linkedHouseholdTransactionId
    ? await db
        .select()
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.id, transaction.linkedHouseholdTransactionId),
            eq(transactionsTable.userId, userId),
          ),
        )
        .limit(1)
    : [];
  if (!isHouseholdContribution(transaction.transactionType)) {
    await removeHouseholdContribution(userId, transaction);
    if (transaction.linkedHouseholdTransactionId) {
      await db
        .update(investmentTransactionsTable)
        .set({ linkedHouseholdTransactionId: null })
        .where(eq(investmentTransactionsTable.id, transaction.id));
    }
    return;
  }

  await ensureInvestmentCategory(userId);
  const amount = householdContributionAmount(transaction.transactionType, transaction.amount);
  const householdFields = {
    date: transaction.date,
    description:
      transaction.transactionType === "deposit"
        ? "Brokerage contribution"
        : "Brokerage withdrawal",
    amount,
    month: transaction.month,
    category: "Investments",
    subcategory: "Brokerage Contribution",
    note: "Linked investment contribution",
  };
  if (linked?.source === "investment") {
    await db.update(transactionsTable).set(householdFields).where(eq(transactionsTable.id, linked.id));
    return;
  }
  if (linked) {
    await db
      .update(investmentTransactionsTable)
      .set({ linkedHouseholdTransactionId: null })
      .where(eq(investmentTransactionsTable.id, transaction.id));
  }
  const [householdTransaction] = await db
    .insert(transactionsTable)
    .values({
      userId,
      ...householdFields,
      status: "Posted",
      account: "Investments",
      source: "investment",
      include: true,
      needsReview: false,
    })
    .returning();
  await db
    .update(investmentTransactionsTable)
    .set({ linkedHouseholdTransactionId: householdTransaction.id })
    .where(eq(investmentTransactionsTable.id, transaction.id));
}

async function ensureInvestmentCategory(userId: string): Promise<void> {
  const [category] = await db
    .select()
    .from(categoriesTable)
    .where(and(eq(categoriesTable.userId, userId), eq(categoriesTable.name, "Investments")))
    .limit(1);
  if (!category) {
    await db
      .insert(categoriesTable)
      .values({
        userId,
        name: "Investments",
        subcategories: ["Brokerage Contribution"],
        sortOrder: 999,
      })
      .onConflictDoNothing();
    return;
  }
  if (!category.subcategories.includes("Brokerage Contribution")) {
    await db
      .update(categoriesTable)
      .set({ subcategories: [...category.subcategories, "Brokerage Contribution"] })
      .where(eq(categoriesTable.id, category.id));
  }
}

export async function syncInvestmentContributionPlanForUser(userId: string) {
  const [{ overview }, settings] = await Promise.all([
    getInvestmentOverviewForUser(userId),
    getOrCreateSettings(userId),
  ]);
  await ensureInvestmentCategory(userId);
  const planned = overview.summary.monthlyContribution;
  for (const month of [settings.selectedMonth, nextMonthLabel(settings.selectedMonth)]) {
    const [line] = await db
      .select()
      .from(planLinesTable)
      .where(
        and(
          eq(planLinesTable.userId, userId),
          eq(planLinesTable.month, month),
          eq(planLinesTable.category, "Investments"),
          eq(planLinesTable.subcategory, "Brokerage Contribution"),
        ),
      )
      .limit(1);
    if (line) {
      await db
        .update(planLinesTable)
        .set({ planned, notes: "Synced from investment allocation plan" })
        .where(eq(planLinesTable.id, line.id));
    } else {
      await db.insert(planLinesTable).values({
        userId,
        month,
        category: "Investments",
        subcategory: "Brokerage Contribution",
        planned,
        priority: "Medium",
        fixedVariable: "Variable",
        notes: "Synced from investment allocation plan",
      });
    }
  }
  return { planned, months: [settings.selectedMonth, nextMonthLabel(settings.selectedMonth)] };
}

export async function getInvestmentOverviewForUser(userId: string, selectedMonth?: string) {
  await ensureInvestmentWorkspace(userId);
  const settings = await getOrCreateSettings(userId);
  const month = selectedMonth ?? settings.selectedMonth;
  const [accounts, securities, rawHoldings, rawTransactions, rawGoals, rawAllocations] = await Promise.all([
    db.select().from(investmentAccountsTable).where(eq(investmentAccountsTable.userId, userId)).orderBy(asc(investmentAccountsTable.id)),
    db.select().from(investmentSecuritiesTable).where(eq(investmentSecuritiesTable.userId, userId)),
    db.select().from(investmentHoldingsTable).where(eq(investmentHoldingsTable.userId, userId)).orderBy(asc(investmentHoldingsTable.id)),
    db.select().from(investmentTransactionsTable).where(eq(investmentTransactionsTable.userId, userId)).orderBy(desc(investmentTransactionsTable.date), desc(investmentTransactionsTable.id)),
    db.select().from(investmentGoalsTable).where(eq(investmentGoalsTable.userId, userId)).orderBy(asc(investmentGoalsTable.id)),
    db.select().from(investmentTargetAllocationsTable).where(eq(investmentTargetAllocationsTable.userId, userId)).orderBy(asc(investmentTargetAllocationsTable.id)),
  ]);
  const securityById = new Map(securities.map((security) => [security.id, security]));
  const holdingValues = rawHoldings.map((holding) => ({
    holding,
    currentMarketValue: holding.shares * holding.currentPrice,
  }));
  const holdingsValue = holdingValues.reduce((sum, row) => sum + row.currentMarketValue, 0);
  const accountsValue = accounts.reduce((sum, account) => sum + account.cashBalance, 0);
  const portfolioValue = accountsValue + holdingsValue;
  const netContributions = rawTransactions.reduce(
    (sum, transaction) => sum + contributionAmount(transaction.transactionType, transaction.amount),
    0,
  );
  const currentMonthContributions = rawTransactions
    .filter((transaction) => transaction.month === month)
    .reduce((sum, transaction) => sum + contributionAmount(transaction.transactionType, transaction.amount), 0);
  const monthlyContribution = rawAllocations.reduce((sum, allocation) => sum + allocation.monthlyAmount, 0);
  const investmentGrowth = portfolioValue - netContributions;

  const holdings = holdingValues.map(({ holding, currentMarketValue }) => {
    const security = securityById.get(holding.securityId);
    const costBasis = holding.shares * holding.averageCost;
    const unrealizedGainLoss = currentMarketValue - costBasis;
    return {
      id: holding.id,
      accountId: holding.accountId,
      securityId: holding.securityId,
      ticker: security?.ticker ?? "Unknown",
      securityName: security?.securityName ?? "Unknown security",
      shares: holding.shares,
      averageCost: holding.averageCost,
      costBasis,
      currentPrice: holding.currentPrice,
      currentMarketValue,
      unrealizedGainLoss,
      unrealizedGainLossPercent: costBasis === 0 ? 0 : (unrealizedGainLoss / costBasis) * 100,
      portfolioAllocationPercent: holdingsValue === 0 ? 0 : (currentMarketValue / holdingsValue) * 100,
    };
  });
  const transactions = rawTransactions.map((transaction) => ({
    id: transaction.id,
    accountId: transaction.accountId,
    securityId: transaction.securityId,
    ticker: transaction.securityId ? securityById.get(transaction.securityId)?.ticker ?? null : null,
    date: transaction.date,
    month: transaction.month,
    transactionType: transaction.transactionType as InvestmentTransactionKind,
    amount: transaction.amount,
    shares: transaction.shares,
    price: transaction.price,
    notes: transaction.notes,
  }));
  const allocations = rawAllocations.map((allocation) => {
    const security = securityById.get(allocation.securityId);
    return {
      id: allocation.id,
      accountId: allocation.accountId,
      securityId: allocation.securityId,
      ticker: security?.ticker ?? "Unknown",
      securityName: security?.securityName ?? "Unknown security",
      monthlyAmount: allocation.monthlyAmount,
    };
  });
  const goals = rawGoals.map((goal) => {
    const accountIds = goal.accountId == null ? accounts.map((account) => account.id) : [goal.accountId];
    const value = accounts
      .filter((account) => accountIds.includes(account.id))
      .reduce((sum, account) => sum + account.cashBalance, 0) +
      holdingValues
        .filter(({ holding }) => accountIds.includes(holding.accountId))
        .reduce((sum, row) => sum + row.currentMarketValue, 0);
    const contributions = rawTransactions
      .filter((transaction) => accountIds.includes(transaction.accountId))
      .reduce((sum, transaction) => sum + contributionAmount(transaction.transactionType, transaction.amount), 0);
    const currentMonth = rawTransactions
      .filter((transaction) => transaction.month === month && accountIds.includes(transaction.accountId))
      .reduce((sum, transaction) => sum + contributionAmount(transaction.transactionType, transaction.amount), 0);
    return {
      id: goal.id,
      accountId: goal.accountId,
      name: goal.name,
      targetAmount: goal.targetAmount,
      monthlyPlannedContribution: goal.monthlyPlannedContribution,
      targetDate: goal.targetDate,
      currentPortfolioValue: value,
      contributionsToDate: contributions,
      investmentGrowth: value - contributions,
      remainingAmount: Math.max(0, goal.targetAmount - value),
      percentComplete: goal.targetAmount === 0 ? 0 : Math.min(100, (value / goal.targetAmount) * 100),
      monthlyContributionProgress:
        goal.monthlyPlannedContribution === 0
          ? 0
          : Math.max(0, (currentMonth / goal.monthlyPlannedContribution) * 100),
    };
  });
  const primaryGoal = goals[0];
  const overview = {
    summary: {
      portfolioValue,
      monthlyContribution,
      netContributions,
      investmentGrowth,
      goalProgress: primaryGoal?.percentComplete ?? 0,
    },
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      institution: account.institution,
      accountType: account.accountType,
      cashBalance: account.cashBalance,
      source: account.source,
    })),
    holdings,
    transactions,
    goals,
    allocations,
  };
  return { overview, month };
}

async function overviewHolding(userId: string, id: number) {
  const { overview } = await getInvestmentOverviewForUser(userId);
  return overview.holdings.find((holding) => holding.id === id);
}

async function overviewGoal(userId: string, id: number) {
  const { overview } = await getInvestmentOverviewForUser(userId);
  return overview.goals.find((goal) => goal.id === id);
}

async function overviewAllocation(userId: string, id: number) {
  const { overview } = await getInvestmentOverviewForUser(userId);
  return overview.allocations.find((allocation) => allocation.id === id);
}

router.get("/investments", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const { overview } = await getInvestmentOverviewForUser(userId);
  res.json(GetInvestmentOverviewResponse.parse(overview));
});

router.post("/investment/plan", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const result = await syncInvestmentContributionPlanForUser(userId);
  res.json({
    message: `Synced ${result.planned.toFixed(2)} to ${result.months.join(" and ")}`,
  });
});

router.post("/investment/accounts", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const parsed = CreateInvestmentAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [account] = await db
    .insert(investmentAccountsTable)
    .values({ ...parsed.data, userId, source: "manual" })
    .returning();
  res.status(201).json(CreateInvestmentAccountResponse.parse(account));
});

router.patch("/investment/accounts/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = UpdateInvestmentAccountParams.safeParse(req.params);
  const parsed = UpdateInvestmentAccountBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid investment account update" });
    return;
  }
  const [account] = await db
    .update(investmentAccountsTable)
    .set(parsed.data)
    .where(and(eq(investmentAccountsTable.id, params.data.id), eq(investmentAccountsTable.userId, userId)))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Investment account not found" });
    return;
  }
  res.json(CreateInvestmentAccountResponse.parse(account));
});

router.delete("/investment/accounts/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = DeleteInvestmentAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [account] = await db
    .delete(investmentAccountsTable)
    .where(and(eq(investmentAccountsTable.id, params.data.id), eq(investmentAccountsTable.userId, userId)))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Investment account not found" });
    return;
  }
  const accountTransactions = await db
    .select()
    .from(investmentTransactionsTable)
    .where(
      and(
        eq(investmentTransactionsTable.userId, userId),
        eq(investmentTransactionsTable.accountId, account.id),
      ),
    );
  await Promise.all(
    accountTransactions.map((transaction) => removeHouseholdContribution(userId, transaction)),
  );
  await Promise.all([
    db.delete(investmentHoldingsTable).where(and(eq(investmentHoldingsTable.userId, userId), eq(investmentHoldingsTable.accountId, account.id))),
    db.delete(investmentTransactionsTable).where(and(eq(investmentTransactionsTable.userId, userId), eq(investmentTransactionsTable.accountId, account.id))),
    db.delete(investmentTargetAllocationsTable).where(and(eq(investmentTargetAllocationsTable.userId, userId), eq(investmentTargetAllocationsTable.accountId, account.id))),
    db.delete(investmentGoalsTable).where(and(eq(investmentGoalsTable.userId, userId), eq(investmentGoalsTable.accountId, account.id))),
  ]);
  res.sendStatus(204);
});

router.post("/investment/holdings", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const parsed = CreateInvestmentHoldingBody.safeParse(req.body);
  if (!parsed.success || !(await accountOwnedBy(userId, parsed.success ? parsed.data.accountId : -1))) {
    res.status(400).json({ error: "Invalid investment holding" });
    return;
  }
  const security = await getOrCreateSecurity(userId, parsed.data.ticker, parsed.data.securityName);
  const [holding] = await db
    .insert(investmentHoldingsTable)
    .values({
      userId,
      accountId: parsed.data.accountId,
      securityId: security.id,
      shares: parsed.data.shares,
      averageCost: parsed.data.averageCost,
      currentPrice: parsed.data.currentPrice,
      source: "manual",
    })
    .returning();
  res.status(201).json(CreateInvestmentHoldingResponse.parse(await overviewHolding(userId, holding.id)));
});

router.patch("/investment/holdings/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = UpdateInvestmentHoldingParams.safeParse(req.params);
  const parsed = UpdateInvestmentHoldingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid investment holding update" });
    return;
  }
  const [existing] = await db
    .select()
    .from(investmentHoldingsTable)
    .where(and(eq(investmentHoldingsTable.id, params.data.id), eq(investmentHoldingsTable.userId, userId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Investment holding not found" });
    return;
  }
  const [security] = await db
    .select()
    .from(investmentSecuritiesTable)
    .where(and(eq(investmentSecuritiesTable.id, existing.securityId), eq(investmentSecuritiesTable.userId, userId)))
    .limit(1);
  if (security && (parsed.data.ticker || parsed.data.securityName)) {
    await db
      .update(investmentSecuritiesTable)
      .set({
        ...(parsed.data.ticker ? { ticker: parsed.data.ticker.trim().toUpperCase() } : {}),
        ...(parsed.data.securityName ? { securityName: parsed.data.securityName.trim() } : {}),
      })
      .where(eq(investmentSecuritiesTable.id, security.id));
  }
  await db
    .update(investmentHoldingsTable)
    .set({
      ...(parsed.data.shares === undefined ? {} : { shares: parsed.data.shares }),
      ...(parsed.data.averageCost === undefined ? {} : { averageCost: parsed.data.averageCost }),
      ...(parsed.data.currentPrice === undefined ? {} : { currentPrice: parsed.data.currentPrice }),
      updatedAt: new Date(),
    })
    .where(eq(investmentHoldingsTable.id, existing.id));
  res.json(UpdateInvestmentHoldingResponse.parse(await overviewHolding(userId, existing.id)));
});

router.delete("/investment/holdings/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = DeleteInvestmentHoldingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [holding] = await db
    .delete(investmentHoldingsTable)
    .where(and(eq(investmentHoldingsTable.id, params.data.id), eq(investmentHoldingsTable.userId, userId)))
    .returning();
  if (!holding) {
    res.status(404).json({ error: "Investment holding not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/investment/transactions", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const parsed = CreateInvestmentTransactionBody.safeParse(req.body);
  if (!parsed.success || !(await accountOwnedBy(userId, parsed.success ? parsed.data.accountId : -1))) {
    res.status(400).json({ error: "Invalid investment transaction" });
    return;
  }
  if (parsed.data.securityId != null && !(await securityOwnedBy(userId, parsed.data.securityId))) {
    res.status(400).json({ error: "Security not found" });
    return;
  }
  const settings = await getOrCreateSettings(userId);
  const [transaction] = await db
    .insert(investmentTransactionsTable)
    .values({
      userId,
      accountId: parsed.data.accountId,
      securityId: parsed.data.securityId ?? null,
      date: parsed.data.date,
      month: budgetMonth(parsed.data.date, settings.monthStartDay),
      transactionType: parsed.data.transactionType,
      amount: parsed.data.amount,
      shares: parsed.data.shares ?? null,
      price: parsed.data.price ?? null,
      notes: parsed.data.notes ?? null,
      source: "manual",
    })
    .returning();
  await adjustCashBalance(
    transaction.accountId,
    cashImpact(transaction.transactionType, transaction.amount),
  );
  await syncHouseholdContribution(userId, transaction);
  const { overview } = await getInvestmentOverviewForUser(userId);
  res.status(201).json(CreateInvestmentTransactionResponse.parse(overview.transactions.find((row) => row.id === transaction.id)));
});

router.patch("/investment/transactions/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = UpdateInvestmentTransactionParams.safeParse(req.params);
  const parsed = UpdateInvestmentTransactionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid investment transaction update" });
    return;
  }
  if (parsed.data.accountId != null && !(await accountOwnedBy(userId, parsed.data.accountId))) {
    res.status(400).json({ error: "Investment account not found" });
    return;
  }
  if (parsed.data.securityId != null && !(await securityOwnedBy(userId, parsed.data.securityId))) {
    res.status(400).json({ error: "Security not found" });
    return;
  }
  const [existing] = await db
    .select()
    .from(investmentTransactionsTable)
    .where(and(eq(investmentTransactionsTable.id, params.data.id), eq(investmentTransactionsTable.userId, userId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Investment transaction not found" });
    return;
  }
  const date = parsed.data.date ?? existing.date;
  const nextAccountId = parsed.data.accountId ?? existing.accountId;
  const nextType = parsed.data.transactionType ?? existing.transactionType;
  const nextAmount = parsed.data.amount ?? existing.amount;
  const settings = await getOrCreateSettings(userId);
  const [updated] = await db
    .update(investmentTransactionsTable)
    .set({ ...parsed.data, month: budgetMonth(date, settings.monthStartDay) })
    .where(eq(investmentTransactionsTable.id, existing.id))
    .returning();
  await adjustCashBalance(existing.accountId, -cashImpact(existing.transactionType, existing.amount));
  await adjustCashBalance(nextAccountId, cashImpact(nextType, nextAmount));
  await syncHouseholdContribution(userId, updated);
  const { overview } = await getInvestmentOverviewForUser(userId);
  res.json(UpdateInvestmentTransactionResponse.parse(overview.transactions.find((row) => row.id === existing.id)));
});

router.delete("/investment/transactions/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = DeleteInvestmentTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [transaction] = await db
    .select()
    .from(investmentTransactionsTable)
    .where(and(eq(investmentTransactionsTable.id, params.data.id), eq(investmentTransactionsTable.userId, userId)))
    .limit(1);
  if (!transaction) {
    res.status(404).json({ error: "Investment transaction not found" });
    return;
  }
  await removeHouseholdContribution(userId, transaction);
  await db.delete(investmentTransactionsTable).where(eq(investmentTransactionsTable.id, transaction.id));
  await adjustCashBalance(
    transaction.accountId,
    -cashImpact(transaction.transactionType, transaction.amount),
  );
  res.sendStatus(204);
});

router.post("/investment/goals", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const parsed = CreateInvestmentGoalBody.safeParse(req.body);
  if (!parsed.success || (parsed.success && parsed.data.accountId != null && !(await accountOwnedBy(userId, parsed.data.accountId)))) {
    res.status(400).json({ error: "Invalid investment goal" });
    return;
  }
  const [goal] = await db.insert(investmentGoalsTable).values({ ...parsed.data, userId }).returning();
  res.status(201).json(CreateInvestmentGoalResponse.parse(await overviewGoal(userId, goal.id)));
});

router.patch("/investment/goals/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = UpdateInvestmentGoalParams.safeParse(req.params);
  const parsed = UpdateInvestmentGoalBody.safeParse(req.body);
  if (!params.success || !parsed.success || (parsed.data.accountId != null && !(await accountOwnedBy(userId, parsed.data.accountId)))) {
    res.status(400).json({ error: "Invalid investment goal update" });
    return;
  }
  const [goal] = await db
    .update(investmentGoalsTable)
    .set(parsed.data)
    .where(and(eq(investmentGoalsTable.id, params.data.id), eq(investmentGoalsTable.userId, userId)))
    .returning();
  if (!goal) {
    res.status(404).json({ error: "Investment goal not found" });
    return;
  }
  res.json(UpdateInvestmentGoalResponse.parse(await overviewGoal(userId, goal.id)));
});

router.delete("/investment/goals/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = DeleteInvestmentGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [goal] = await db
    .delete(investmentGoalsTable)
    .where(and(eq(investmentGoalsTable.id, params.data.id), eq(investmentGoalsTable.userId, userId)))
    .returning();
  if (!goal) {
    res.status(404).json({ error: "Investment goal not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/investment/allocations", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const parsed = CreateInvestmentTargetAllocationBody.safeParse(req.body);
  if (!parsed.success || !(await accountOwnedBy(userId, parsed.success ? parsed.data.accountId : -1))) {
    res.status(400).json({ error: "Invalid target allocation" });
    return;
  }
  const security = await getOrCreateSecurity(userId, parsed.data.ticker, parsed.data.securityName);
  const [allocation] = await db
    .insert(investmentTargetAllocationsTable)
    .values({ userId, accountId: parsed.data.accountId, securityId: security.id, monthlyAmount: parsed.data.monthlyAmount })
    .returning();
  res.status(201).json(CreateInvestmentTargetAllocationResponse.parse(await overviewAllocation(userId, allocation.id)));
});

router.patch("/investment/allocations/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = UpdateInvestmentTargetAllocationParams.safeParse(req.params);
  const parsed = UpdateInvestmentTargetAllocationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid target allocation update" });
    return;
  }
  const [allocation] = await db
    .update(investmentTargetAllocationsTable)
    .set(parsed.data)
    .where(and(eq(investmentTargetAllocationsTable.id, params.data.id), eq(investmentTargetAllocationsTable.userId, userId)))
    .returning();
  if (!allocation) {
    res.status(404).json({ error: "Target allocation not found" });
    return;
  }
  res.json(UpdateInvestmentTargetAllocationResponse.parse(await overviewAllocation(userId, allocation.id)));
});

router.delete("/investment/allocations/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = DeleteInvestmentTargetAllocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [allocation] = await db
    .delete(investmentTargetAllocationsTable)
    .where(and(eq(investmentTargetAllocationsTable.id, params.data.id), eq(investmentTargetAllocationsTable.userId, userId)))
    .returning();
  if (!allocation) {
    res.status(404).json({ error: "Target allocation not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;