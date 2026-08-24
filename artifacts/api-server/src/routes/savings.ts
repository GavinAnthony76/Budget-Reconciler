import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  incomeSourcesTable,
  planLinesTable,
  savingsContributionsTable,
  savingsGoalsTable,
} from "@workspace/db";
import {
  CreateSavingsContributionBody,
  CreateSavingsContributionParams,
  CreateSavingsContributionResponse,
  CreateSavingsGoalBody,
  CreateSavingsGoalResponse,
  DeleteSavingsContributionParams,
  DeleteSavingsGoalParams,
  GetSavingsGoalParams,
  GetSavingsGoalResponse,
  GetSavingsOverviewResponse,
  ListSavingsContributionsParams,
  ListSavingsContributionsResponse,
  UpdateSavingsContributionBody,
  UpdateSavingsContributionParams,
  UpdateSavingsContributionResponse,
  UpdateSavingsGoalBody,
  UpdateSavingsGoalParams,
  UpdateSavingsGoalResponse,
} from "@workspace/api-zod";
import { currentUserId } from "../middlewares/requireUser";
import {
  calculateSavingsGoal,
  fromCents,
  sortGoalsForRecommendation,
  toCents,
  type SavingsContributionRecord,
  type SavingsGoalRecord,
} from "../lib/savings";
import { getOrCreateSettings } from "./budget";

const router: IRouter = Router();

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function contributionResponse(entry: typeof savingsContributionsTable.$inferSelect) {
  return {
    id: entry.id,
    goalId: entry.goalId,
    amount: fromCents(entry.amountCents),
    contributionDate: entry.contributionDate,
    entryType: entry.entryType as "contribution" | "adjustment",
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  };
}

function hasValidRange(startDate: string, targetDate: string): boolean {
  return new Date(`${targetDate}T00:00:00.000Z`) > new Date(`${startDate}T00:00:00.000Z`);
}

function isFutureDate(value: Date): boolean {
  const today = new Date();
  const currentDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return value.getTime() > currentDay;
}

async function ownedGoal(userId: string, id: number) {
  const [goal] = await db
    .select()
    .from(savingsGoalsTable)
    .where(and(eq(savingsGoalsTable.id, id), eq(savingsGoalsTable.userId, userId)))
    .limit(1);
  return goal;
}

async function goalView(userId: string, id: number) {
  const goal = await ownedGoal(userId, id);
  if (!goal) return null;
  const contributions = await db
    .select()
    .from(savingsContributionsTable)
    .where(and(eq(savingsContributionsTable.goalId, id), eq(savingsContributionsTable.userId, userId)))
    .orderBy(desc(savingsContributionsTable.contributionDate), desc(savingsContributionsTable.id));
  const calculation = calculateSavingsGoal(goal as SavingsGoalRecord, contributions as SavingsContributionRecord[]);
  return {
    ...calculation,
    contributions: contributions.map(contributionResponse),
  };
}

export async function getSavingsOverviewForUser(
  userId: string,
  configuredSurplus?: number | null,
) {
  const [goals, contributions, settings] = await Promise.all([
    db.select().from(savingsGoalsTable).where(eq(savingsGoalsTable.userId, userId)),
    db
      .select()
      .from(savingsContributionsTable)
      .where(eq(savingsContributionsTable.userId, userId))
      .orderBy(desc(savingsContributionsTable.contributionDate), desc(savingsContributionsTable.id)),
    getOrCreateSettings(userId),
  ]);
  const contributionsByGoal = new Map<number, SavingsContributionRecord[]>();
  for (const contribution of contributions) {
    const group = contributionsByGoal.get(contribution.goalId) ?? [];
    group.push(contribution as SavingsContributionRecord);
    contributionsByGoal.set(contribution.goalId, group);
  }
  const calculatedGoals = goals.map((goal) => ({
    ...calculateSavingsGoal(goal as SavingsGoalRecord, contributionsByGoal.get(goal.id) ?? []),
    contributions: (contributionsByGoal.get(goal.id) ?? []).map((entry) => contributionResponse(entry as typeof savingsContributionsTable.$inferSelect)),
  }));
  const active = calculatedGoals.filter((goal) => goal.status === "active");
  const ranked = sortGoalsForRecommendation(active);
  let projectedMonthlySurplus = configuredSurplus;
  if (projectedMonthlySurplus === undefined) {
    const [incomes, planLines] = await Promise.all([
      db.select().from(incomeSourcesTable).where(eq(incomeSourcesTable.userId, userId)),
      db
        .select()
        .from(planLinesTable)
        .where(and(eq(planLinesTable.userId, userId), eq(planLinesTable.month, settings.selectedMonth))),
    ]);
    projectedMonthlySurplus = incomes.length
      ? incomes.reduce((total, income) => total + income.monthlyEquivalent, 0) - planLines.reduce((total, line) => total + line.planned, 0)
      : null;
  }
  const combinedMonthlyNeed = active.reduce((total, goal) => total + goal.requiredMonthlyContribution, 0);
  const affordabilityStatus = projectedMonthlySurplus == null
    ? "No budget data"
    : projectedMonthlySurplus >= combinedMonthlyNeed
      ? "Within budget"
      : "Over budget";
  return {
    goals: calculatedGoals,
    summary: {
      activeGoalCount: active.length,
      totalCurrentBalance: active.reduce((total, goal) => total + goal.currentBalance, 0),
      totalTargetAmount: active.reduce((total, goal) => total + goal.targetAmount, 0),
      combinedMonthlyNeed,
      affordabilityStatus,
      projectedMonthlySurplus,
      primaryGoal: ranked[0] ?? null,
    },
  };
}

router.get("/savings", async (req, res): Promise<void> => {
  const overview = await getSavingsOverviewForUser(currentUserId(req));
  res.json(GetSavingsOverviewResponse.parse(overview));
});

router.post("/savings/goals", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const parsed = CreateSavingsGoalBody.safeParse(req.body);
  if (!parsed.success || !hasValidRange(dateOnly(parsed.data.startDate), dateOnly(parsed.data.targetDate))) {
    res.status(400).json({ error: "Enter a target date after the goal start date." });
    return;
  }
  const [goal] = await db
    .insert(savingsGoalsTable)
    .values({
      userId,
      name: parsed.data.name.trim(),
      targetAmountCents: toCents(parsed.data.targetAmount),
      startingBalanceCents: toCents(parsed.data.startingBalance),
      monthlyPlannedCents: parsed.data.monthlyPlannedContribution == null ? null : toCents(parsed.data.monthlyPlannedContribution),
      startDate: dateOnly(parsed.data.startDate),
      targetDate: dateOnly(parsed.data.targetDate),
      priority: parsed.data.priority,
      notes: parsed.data.notes?.trim() || null,
    })
    .returning();
  const view = await goalView(userId, goal.id);
  res.status(201).json(CreateSavingsGoalResponse.parse(view));
});

router.get("/savings/goals/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = GetSavingsGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid savings goal." });
    return;
  }
  const view = await goalView(userId, params.data.id);
  if (!view) {
    res.status(404).json({ error: "Savings goal not found." });
    return;
  }
  res.json(GetSavingsGoalResponse.parse(view));
});

router.patch("/savings/goals/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = UpdateSavingsGoalParams.safeParse(req.params);
  const parsed = UpdateSavingsGoalBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(req.body ?? {}).length === 0) {
    res.status(400).json({ error: "Invalid savings goal update." });
    return;
  }
  const existing = await ownedGoal(userId, params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Savings goal not found." });
    return;
  }
  const startDate = parsed.data.startDate ? dateOnly(parsed.data.startDate) : existing.startDate;
  const targetDate = parsed.data.targetDate ? dateOnly(parsed.data.targetDate) : existing.targetDate;
  if (!hasValidRange(startDate, targetDate)) {
    res.status(400).json({ error: "Enter a target date after the goal start date." });
    return;
  }
  const update: Partial<typeof savingsGoalsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name.trim();
  if (parsed.data.targetAmount !== undefined) update.targetAmountCents = toCents(parsed.data.targetAmount);
  if (parsed.data.startingBalance !== undefined) update.startingBalanceCents = toCents(parsed.data.startingBalance);
  if (Object.prototype.hasOwnProperty.call(parsed.data, "monthlyPlannedContribution")) {
    update.monthlyPlannedCents = parsed.data.monthlyPlannedContribution == null ? null : toCents(parsed.data.monthlyPlannedContribution);
  }
  if (parsed.data.startDate !== undefined) update.startDate = startDate;
  if (parsed.data.targetDate !== undefined) update.targetDate = targetDate;
  if (parsed.data.priority !== undefined) update.priority = parsed.data.priority;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (Object.prototype.hasOwnProperty.call(parsed.data, "notes")) update.notes = parsed.data.notes?.trim() || null;
  await db.update(savingsGoalsTable).set(update).where(eq(savingsGoalsTable.id, existing.id));
  const view = await goalView(userId, existing.id);
  res.json(UpdateSavingsGoalResponse.parse(view));
});

router.delete("/savings/goals/:id", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = DeleteSavingsGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid savings goal." });
    return;
  }
  const [deleted] = await db
    .delete(savingsGoalsTable)
    .where(and(eq(savingsGoalsTable.id, params.data.id), eq(savingsGoalsTable.userId, userId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Savings goal not found." });
    return;
  }
  res.sendStatus(204);
});

router.get("/savings/goals/:id/contributions", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = ListSavingsContributionsParams.safeParse(req.params);
  if (!params.success || !(await ownedGoal(userId, params.success ? params.data.id : -1))) {
    res.status(404).json({ error: "Savings goal not found." });
    return;
  }
  const contributions = await db
    .select()
    .from(savingsContributionsTable)
    .where(and(eq(savingsContributionsTable.goalId, params.data.id), eq(savingsContributionsTable.userId, userId)))
    .orderBy(desc(savingsContributionsTable.contributionDate), desc(savingsContributionsTable.id));
  res.json(ListSavingsContributionsResponse.parse(contributions.map(contributionResponse)));
});

router.post("/savings/goals/:id/contributions", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = CreateSavingsContributionParams.safeParse(req.params);
  const parsed = CreateSavingsContributionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid contribution." });
    return;
  }
  if (toCents(parsed.data.amount) === 0) {
    res.status(400).json({ error: "Enter a non-zero contribution amount." });
    return;
  }
  if (isFutureDate(parsed.data.contributionDate)) {
    res.status(400).json({ error: "Future contribution dates cannot be saved." });
    return;
  }
  if (!(await ownedGoal(userId, params.data.id))) {
    res.status(404).json({ error: "Savings goal not found." });
    return;
  }
  const [contribution] = await db
    .insert(savingsContributionsTable)
    .values({
      goalId: params.data.id,
      userId,
      amountCents: toCents(parsed.data.amount),
      contributionDate: dateOnly(parsed.data.contributionDate),
      entryType: parsed.data.entryType ?? "contribution",
      note: parsed.data.note?.trim() || null,
    })
    .returning();
  res.status(201).json(CreateSavingsContributionResponse.parse(contributionResponse(contribution)));
});

router.patch("/savings/goals/:id/contributions/:contributionId", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = UpdateSavingsContributionParams.safeParse(req.params);
  const parsed = UpdateSavingsContributionBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(req.body ?? {}).length === 0) {
    res.status(400).json({ error: "Invalid contribution update." });
    return;
  }
  if (parsed.data.amount !== undefined && toCents(parsed.data.amount) === 0) {
    res.status(400).json({ error: "Enter a non-zero contribution amount." });
    return;
  }
  if (parsed.data.contributionDate !== undefined && isFutureDate(parsed.data.contributionDate)) {
    res.status(400).json({ error: "Future contribution dates cannot be saved." });
    return;
  }
  const [existing] = await db
    .select()
    .from(savingsContributionsTable)
    .where(and(
      eq(savingsContributionsTable.id, params.data.contributionId),
      eq(savingsContributionsTable.goalId, params.data.id),
      eq(savingsContributionsTable.userId, userId),
    ))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Savings contribution not found." });
    return;
  }
  const update: Partial<typeof savingsContributionsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.amount !== undefined) update.amountCents = toCents(parsed.data.amount);
  if (parsed.data.contributionDate !== undefined) update.contributionDate = dateOnly(parsed.data.contributionDate);
  if (parsed.data.entryType !== undefined) update.entryType = parsed.data.entryType;
  if (Object.prototype.hasOwnProperty.call(parsed.data, "note")) update.note = parsed.data.note?.trim() || null;
  const [updated] = await db
    .update(savingsContributionsTable)
    .set(update)
    .where(eq(savingsContributionsTable.id, existing.id))
    .returning();
  res.json(UpdateSavingsContributionResponse.parse(contributionResponse(updated)));
});

router.delete("/savings/goals/:id/contributions/:contributionId", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const params = DeleteSavingsContributionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid contribution." });
    return;
  }
  const [deleted] = await db
    .delete(savingsContributionsTable)
    .where(and(
      eq(savingsContributionsTable.id, params.data.contributionId),
      eq(savingsContributionsTable.goalId, params.data.id),
      eq(savingsContributionsTable.userId, userId),
    ))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Savings contribution not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;