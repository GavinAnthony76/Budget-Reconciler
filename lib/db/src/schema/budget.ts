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
  selectedMonth: text("selected_month").notNull().default("August 2026"),
  monthStartDay: integer("month_start_day").notNull().default(29),
  checkingBuffer: doublePrecision("checking_buffer").notNull().default(500),
  debtStrategy: text("debt_strategy").notNull().default("Avalanche"),
});

export const incomeSourcesTable = pgTable("income_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  owner: text("owner").notNull().default("Household"),
  frequency: text("frequency").notNull().default("Monthly"),
  netAmount: doublePrecision("net_amount").notNull().default(0),
  monthlyEquivalent: doublePrecision("monthly_equivalent").notNull().default(0),
  notes: text("notes"),
});

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  subcategories: text("subcategories").array().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const planLinesTable = pgTable("plan_lines", {
  id: serial("id").primaryKey(),
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
  pattern: text("pattern").notNull(),
  matchType: text("match_type").notNull().default("description"),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
});

export type Settings = typeof settingsTable.$inferSelect;
export type IncomeSource = typeof incomeSourcesTable.$inferSelect;
export type Category = typeof categoriesTable.$inferSelect;
export type PlanLine = typeof planLinesTable.$inferSelect;
export type Transaction = typeof transactionsTable.$inferSelect;
export type ImportBatch = typeof importsTable.$inferSelect;
export type Rule = typeof rulesTable.$inferSelect;
