import {
  pgTable,
  text,
  serial,
  integer,
  doublePrecision,
  boolean,
  date,
  timestamp,
} from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  selectedMonth: text("selected_month").notNull().default("August 2026"),
  monthStartDay: integer("month_start_day").notNull().default(29),
  checkingBuffer: doublePrecision("checking_buffer").notNull().default(500),
  debtStrategy: text("debt_strategy").notNull().default("Avalanche"),
});

export const incomeSourcesTable = pgTable("income_sources", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  owner: text("owner").notNull().default("Household"),
  frequency: text("frequency").notNull().default("Monthly"),
  netAmount: doublePrecision("net_amount").notNull().default(0),
  monthlyEquivalent: doublePrecision("monthly_equivalent").notNull().default(0),
  notes: text("notes"),
});

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  subcategories: text("subcategories").array().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const planLinesTable = pgTable("plan_lines", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  month: text("month").notNull().default(""),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
  planned: doublePrecision("planned").notNull().default(0),
  priority: text("priority").notNull().default("Medium"),
  fixedVariable: text("fixed_variable").notNull().default("Variable"),
  dueDay: integer("due_day"),
  notes: text("notes"),
});

export const importsTable = pgTable("imports", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  fileName: text("file_name"),
  account: text("account").notNull().default("Checking"),
  totalRows: integer("total_rows").notNull().default(0),
  added: integer("added").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  importedAt: timestamp("imported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  date: date("date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  originalDescription: text("original_description"),
  bankCategory: text("bank_category"),
  amount: doublePrecision("amount").notNull(),
  status: text("status").notNull().default("Posted"),
  account: text("account"),
  source: text("source").notNull().default("bank"),
  category: text("category"),
  subcategory: text("subcategory"),
  include: boolean("include").notNull().default(true),
  month: text("month").notNull(),
  note: text("note"),
  needsReview: boolean("needs_review").notNull().default(false),
  fingerprint: text("fingerprint"),
  linkedBankId: integer("linked_bank_id"),
  importId: integer("import_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rulesTable = pgTable("rules", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  pattern: text("pattern").notNull(),
  matchType: text("match_type").notNull().default("description"),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
});

/**
 * Investment data is deliberately separate from the household ledger.
 * The `source` and provider IDs make it possible to add a brokerage adapter
 * later without changing the user-facing accounting model.
 */
export const investmentAccountsTable = pgTable("investment_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  institution: text("institution").notNull(),
  accountType: text("account_type").notNull(),
  cashBalance: doublePrecision("cash_balance").notNull().default(0),
  source: text("source").notNull().default("manual"),
  providerAccountId: text("provider_account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const investmentSecuritiesTable = pgTable("investment_securities", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  ticker: text("ticker").notNull(),
  securityName: text("security_name").notNull(),
  source: text("source").notNull().default("manual"),
  providerSecurityId: text("provider_security_id"),
});

export const investmentHoldingsTable = pgTable("investment_holdings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: integer("account_id").notNull(),
  securityId: integer("security_id").notNull(),
  shares: doublePrecision("shares").notNull().default(0),
  averageCost: doublePrecision("average_cost").notNull().default(0),
  currentPrice: doublePrecision("current_price").notNull().default(0),
  source: text("source").notNull().default("manual"),
  providerHoldingId: text("provider_holding_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const investmentTransactionsTable = pgTable("investment_transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: integer("account_id").notNull(),
  securityId: integer("security_id"),
  date: date("date", { mode: "string" }).notNull(),
  month: text("month").notNull(),
  transactionType: text("transaction_type").notNull(),
  amount: doublePrecision("amount").notNull().default(0),
  shares: doublePrecision("shares"),
  price: doublePrecision("price"),
  notes: text("notes"),
  source: text("source").notNull().default("manual"),
  providerTransactionId: text("provider_transaction_id"),
  linkedHouseholdTransactionId: integer("linked_household_transaction_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const investmentSetupTable = pgTable("investment_setup", {
  userId: text("user_id").primaryKey(),
  initializedAt: timestamp("initialized_at", { withTimezone: true }).notNull().defaultNow(),
});

export const investmentGoalsTable = pgTable("investment_goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: integer("account_id"),
  name: text("name").notNull(),
  targetAmount: doublePrecision("target_amount").notNull(),
  monthlyPlannedContribution: doublePrecision("monthly_planned_contribution").notNull(),
  targetDate: date("target_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const investmentTargetAllocationsTable = pgTable("investment_target_allocations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: integer("account_id").notNull(),
  securityId: integer("security_id").notNull(),
  monthlyAmount: doublePrecision("monthly_amount").notNull().default(0),
});

/**
 * Savings goals are household cash plans, not investment positions. Amounts
 * are stored as integer cents so goal progress and contribution history remain
 * exact even after many edits.
 */
export const savingsGoalsTable = pgTable("savings_goals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  targetAmountCents: integer("target_amount_cents").notNull(),
  startingBalanceCents: integer("starting_balance_cents").notNull().default(0),
  monthlyPlannedCents: integer("monthly_planned_cents"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  targetDate: date("target_date", { mode: "string" }).notNull(),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savingsContributionsTable = pgTable("savings_contributions", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id")
    .notNull()
    .references(() => savingsGoalsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  contributionDate: date("contribution_date", { mode: "string" }).notNull(),
  entryType: text("entry_type").notNull().default("contribution"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settingsTable.$inferSelect;
export type IncomeSource = typeof incomeSourcesTable.$inferSelect;
export type Category = typeof categoriesTable.$inferSelect;
export type PlanLine = typeof planLinesTable.$inferSelect;
export type Transaction = typeof transactionsTable.$inferSelect;
export type ImportBatch = typeof importsTable.$inferSelect;
export type Rule = typeof rulesTable.$inferSelect;
export type InvestmentAccount = typeof investmentAccountsTable.$inferSelect;
export type InvestmentSecurity = typeof investmentSecuritiesTable.$inferSelect;
export type InvestmentHolding = typeof investmentHoldingsTable.$inferSelect;
export type InvestmentTransaction = typeof investmentTransactionsTable.$inferSelect;
export type InvestmentGoal = typeof investmentGoalsTable.$inferSelect;
export type InvestmentTargetAllocation = typeof investmentTargetAllocationsTable.$inferSelect;
export type SavingsGoal = typeof savingsGoalsTable.$inferSelect;
export type SavingsContribution = typeof savingsContributionsTable.$inferSelect;
