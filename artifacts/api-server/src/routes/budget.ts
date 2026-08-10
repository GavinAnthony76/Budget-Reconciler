import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  settingsTable,
  incomeSourcesTable,
  categoriesTable,
  planLinesTable,
  rulesTable,
  transactionsTable,
} from "@workspace/db";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
  ListMonthsResponse,
  ListIncomesResponse,
  CreateIncomeBody,
  CreateIncomeResponse,
  UpdateIncomeParams,
  UpdateIncomeBody,
  UpdateIncomeResponse,
  DeleteIncomeParams,
  ListCategoriesResponse,
  CreateCategoryBody,
  CreateCategoryResponse,
  UpdateCategoryParams,
  UpdateCategoryBody,
  UpdateCategoryResponse,
  DeleteCategoryParams,
  ListPlanLinesResponse,
  CreatePlanLineBody,
  CreatePlanLineResponse,
  UpdatePlanLineParams,
  UpdatePlanLineBody,
  UpdatePlanLineResponse,
  DeletePlanLineParams,
  ListRulesResponse,
  CreateRuleBody,
  CreateRuleResponse,
  DeleteRuleParams,
} from "@workspace/api-zod";
import {
  monthSortKey,
  applyRuleRetroactively,
  stripNulls,
  budgetMonth,
} from "../lib/budget";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  res.json(GetSettingsResponse.parse(s));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const s = await getOrCreateSettings();
  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, s.id))
    .returning();
  // Changing the pay-cycle start day reassigns every transaction's budget month
  if (
    parsed.data.monthStartDay !== undefined &&
    parsed.data.monthStartDay !== s.monthStartDay
  ) {
    const all = await db
      .select({
        id: transactionsTable.id,
        date: transactionsTable.date,
        month: transactionsTable.month,
      })
      .from(transactionsTable);
    for (const t of all) {
      const month = budgetMonth(t.date, updated.monthStartDay);
      if (month !== t.month) {
        await db
          .update(transactionsTable)
          .set({ month })
          .where(eq(transactionsTable.id, t.id));
      }
    }
  }
  res.json(UpdateSettingsResponse.parse(updated));
});

router.get("/months", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ month: transactionsTable.month })
    .from(transactionsTable);
  const s = await getOrCreateSettings();
  const set = new Set(rows.map((r) => r.month));
  set.add(s.selectedMonth);
  const months = [...set].sort((a, b) => monthSortKey(b) - monthSortKey(a));
  res.json(ListMonthsResponse.parse(months));
});

// ---- Income sources ----
router.get("/incomes", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(incomeSourcesTable)
    .orderBy(asc(incomeSourcesTable.id));
  res.json(ListIncomesResponse.parse(rows));
});

router.post("/incomes", async (req, res): Promise<void> => {
  const parsed = CreateIncomeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = stripNulls(parsed.data);
  const [row] = await db
    .insert(incomeSourcesTable)
    .values({
      ...data,
      name: parsed.data.name,
      netAmount: parsed.data.netAmount,
      monthlyEquivalent: data.monthlyEquivalent ?? data.netAmount,
    })
    .returning();
  res.status(201).json(CreateIncomeResponse.parse(row));
});

router.patch("/incomes/:id", async (req, res): Promise<void> => {
  const params = UpdateIncomeParams.safeParse(req.params);
  const parsed = UpdateIncomeBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [row] = await db
    .update(incomeSourcesTable)
    .set(stripNulls(parsed.data, ["notes"]))
    .where(eq(incomeSourcesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Income source not found" });
    return;
  }
  res.json(UpdateIncomeResponse.parse(row));
});

router.delete("/incomes/:id", async (req, res): Promise<void> => {
  const params = DeleteIncomeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(incomeSourcesTable)
    .where(eq(incomeSourcesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Income source not found" });
    return;
  }
  res.sendStatus(204);
});

// ---- Categories ----
router.get("/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id));
  res.json(ListCategoriesResponse.parse(rows));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(categoriesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(CreateCategoryResponse.parse(row));
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [row] = await db
    .update(categoriesTable)
    .set(parsed.data)
    .where(eq(categoriesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json(UpdateCategoryResponse.parse(row));
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.sendStatus(204);
});

// ---- Plan lines ----
router.get("/plan", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(planLinesTable)
    .orderBy(asc(planLinesTable.id));
  res.json(ListPlanLinesResponse.parse(rows));
});

router.post("/plan", async (req, res): Promise<void> => {
  const parsed = CreatePlanLineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = stripNulls(parsed.data, ["dueDay", "notes"]);
  const [row] = await db
    .insert(planLinesTable)
    .values({
      ...data,
      category: parsed.data.category,
      subcategory: parsed.data.subcategory,
      planned: parsed.data.planned,
    })
    .returning();
  res.status(201).json(CreatePlanLineResponse.parse(row));
});

router.patch("/plan/:id", async (req, res): Promise<void> => {
  const params = UpdatePlanLineParams.safeParse(req.params);
  const parsed = UpdatePlanLineBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [row] = await db
    .update(planLinesTable)
    .set(stripNulls(parsed.data, ["dueDay", "notes"]))
    .where(eq(planLinesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Plan line not found" });
    return;
  }
  res.json(UpdatePlanLineResponse.parse(row));
});

router.delete("/plan/:id", async (req, res): Promise<void> => {
  const params = DeletePlanLineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(planLinesTable)
    .where(eq(planLinesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Plan line not found" });
    return;
  }
  res.sendStatus(204);
});

// ---- Merchant rules (description rules only are exposed) ----
router.get("/rules", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(rulesTable)
    .where(eq(rulesTable.matchType, "description"))
    .orderBy(asc(rulesTable.id));
  res.json(ListRulesResponse.parse(rows));
});

router.post("/rules", async (req, res): Promise<void> => {
  const parsed = CreateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(rulesTable)
    .values({ ...parsed.data, matchType: "description" })
    .returning();
  await applyRuleRetroactively(parsed.data);
  res.status(201).json(CreateRuleResponse.parse(row));
});

router.delete("/rules/:id", async (req, res): Promise<void> => {
  const params = DeleteRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(rulesTable)
    .where(eq(rulesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
export { getOrCreateSettings };
