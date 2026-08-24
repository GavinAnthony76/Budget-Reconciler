export type SavingsGoalRecord = {
  id: number;
  name: string;
  targetAmountCents: number;
  startingBalanceCents: number;
  monthlyPlannedCents: number | null;
  startDate: string;
  targetDate: string;
  priority: string;
  status: string;
  notes: string | null;
};

export type SavingsContributionRecord = {
  id: number;
  goalId: number;
  amountCents: number;
  contributionDate: string;
  entryType: string;
  note: string | null;
  createdAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_WEIGHT: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

function asUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(amount: number): number {
  return amount / 100;
}

export function monthsBetween(startDate: string, endDate: string): number {
  const start = asUtcDate(startDate);
  const end = asUtcDate(endDate);
  return Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth());
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(date.getUTCDate(), maxDay));
  return next;
}

function statusFor(
  goal: SavingsGoalRecord,
  balanceCents: number,
  expectedBalanceCents: number,
  hasHistory: boolean,
  today: Date,
): string {
  if (balanceCents >= goal.targetAmountCents) return "Completed";
  if (today > asUtcDate(goal.targetDate)) return "Overdue";
  if (!hasHistory && today >= asUtcDate(goal.startDate)) return "Insufficient history";
  const tolerance = Math.max(100, Math.round(goal.targetAmountCents * 0.05));
  const variance = balanceCents - expectedBalanceCents;
  if (variance > tolerance) return "Ahead";
  if (variance >= -tolerance) return "On track";
  if (variance >= -(tolerance * 3)) return "Slightly behind";
  return "Behind";
}

export function calculateSavingsGoal(
  goal: SavingsGoalRecord,
  contributions: SavingsContributionRecord[],
  today = new Date(),
) {
  const contributionCents = contributions.reduce((total, entry) => total + entry.amountCents, 0);
  const currentBalanceCents = goal.startingBalanceCents + contributionCents;
  const target = Math.max(goal.targetAmountCents, 1);
  const start = asUtcDate(goal.startDate);
  const end = asUtcDate(goal.targetDate);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.round((today.getTime() - start.getTime()) / DAY_MS)));
  const timeProgressPercent = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  const expectedBalanceCents = Math.min(
    goal.targetAmountCents,
    Math.round(goal.startingBalanceCents + (goal.targetAmountCents - goal.startingBalanceCents) * (elapsedDays / totalDays)),
  );
  const remainingCents = Math.max(0, goal.targetAmountCents - currentBalanceCents);
  const totalMonths = monthsBetween(goal.startDate, goal.targetDate);
  const elapsedMonths = Math.min(totalMonths, Math.max(0, Math.ceil((elapsedDays / totalDays) * totalMonths)));
  const monthsRemaining = currentBalanceCents >= goal.targetAmountCents ? 0 : Math.max(1, totalMonths - elapsedMonths);
  const requiredMonthlyCents = monthsRemaining ? Math.ceil(remainingCents / monthsRemaining) : remainingCents;
  const activeMonths = Math.max(1, elapsedMonths);
  const averageMonthlyContributionCents = contributionCents > 0 ? Math.round(contributionCents / activeMonths) : 0;
  const projectionRateCents = goal.monthlyPlannedCents ?? averageMonthlyContributionCents;
  const projectedCompletionDate = currentBalanceCents >= goal.targetAmountCents
    ? isoDate(today)
    : projectionRateCents > 0
      ? isoDate(addMonths(today, Math.ceil(remainingCents / projectionRateCents)))
      : null;
  const projectedBalanceCents = Math.min(goal.targetAmountCents, currentBalanceCents + projectionRateCents * monthsRemaining);
  const trajectory = [{ date: goal.startDate, expected: fromCents(goal.startingBalanceCents), actual: fromCents(goal.startingBalanceCents) }];
  for (let index = 1; index <= totalMonths; index += 1) {
    const pointDate = index === totalMonths ? end : addMonths(start, index);
    const fraction = Math.min(1, index / totalMonths);
    const expected = Math.round(goal.startingBalanceCents + (goal.targetAmountCents - goal.startingBalanceCents) * fraction);
    const actual = goal.startingBalanceCents + contributions
      .filter((entry) => asUtcDate(entry.contributionDate) <= pointDate)
      .reduce((total, entry) => total + entry.amountCents, 0);
    trajectory.push({ date: isoDate(pointDate), expected: fromCents(expected), actual: fromCents(actual) });
  }
  if (trajectory.at(-1)?.date !== goal.targetDate) {
    trajectory.push({ date: goal.targetDate, expected: fromCents(goal.targetAmountCents), actual: fromCents(currentBalanceCents) });
  }
  const trajectoryStatus = statusFor(goal, currentBalanceCents, expectedBalanceCents, contributions.length > 0, today);
  const plannedMonthlyCents = goal.monthlyPlannedCents ?? null;
  const recommendation = currentBalanceCents >= goal.targetAmountCents
    ? "Goal reached — consider marking it complete or directing future savings to your next priority."
    : goal.status !== "active"
      ? "This goal is not active, so its monthly need is excluded from the active savings plan."
      : trajectoryStatus === "Overdue"
        ? `This goal is past its target date. Add ${fromCents(remainingCents).toFixed(2)} to complete it.`
        : plannedMonthlyCents != null && plannedMonthlyCents < requiredMonthlyCents
          ? `Increase the monthly plan by ${fromCents(requiredMonthlyCents - plannedMonthlyCents).toFixed(2)} to stay on schedule.`
          : trajectoryStatus === "Behind" || trajectoryStatus === "Slightly behind"
            ? `Add ${fromCents(Math.max(0, expectedBalanceCents - currentBalanceCents)).toFixed(2)} to catch up to the target pace.`
            : "Your current plan is aligned with this goal's target date.";

  return {
    id: goal.id,
    name: goal.name,
    targetAmount: fromCents(goal.targetAmountCents),
    startingBalance: fromCents(goal.startingBalanceCents),
    monthlyPlannedContribution: plannedMonthlyCents == null ? null : fromCents(plannedMonthlyCents),
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    priority: goal.priority,
    status: goal.status,
    notes: goal.notes,
    currentBalance: fromCents(currentBalanceCents),
    contributionsToDate: fromCents(contributionCents),
    remainingAmount: fromCents(remainingCents),
    percentComplete: Math.min(100, Math.max(0, (currentBalanceCents / target) * 100)),
    timeProgressPercent,
    expectedBalance: fromCents(expectedBalanceCents),
    variance: fromCents(currentBalanceCents - expectedBalanceCents),
    monthsRemaining,
    requiredMonthlyContribution: fromCents(requiredMonthlyCents),
    averageMonthlyContribution: fromCents(averageMonthlyContributionCents),
    projectedBalance: fromCents(projectedBalanceCents),
    projectedCompletionDate,
    trajectoryStatus,
    recommendation,
    trajectory,
  };
}

export function sortGoalsForRecommendation<T extends { priority: string; targetDate: string }>(goals: T[]): T[] {
  return [...goals].sort((a, b) => {
    const priority = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
    return priority || a.targetDate.localeCompare(b.targetDate);
  });
}