import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { eq, isNull, sql } from "drizzle-orm";
import {
  db,
  categoriesTable,
  importsTable,
  incomeSourcesTable,
  planLinesTable,
  rulesTable,
  settingsTable,
  transactionsTable,
} from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Claims the pre-auth single-household records for the first person who signs
 * into this private Ledger. This is an atomic one-time migration; later users
 * receive their own empty Ledger instead of seeing this household's history.
 */
async function claimLegacyHousehold(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialize first-login migration across concurrent tabs/requests. The
    // advisory key is fixed because the legacy data has no owner yet.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ledger_legacy_owner_claim'))`);
    const existing = await tx
      .select({ id: settingsTable.id })
      .from(settingsTable)
      .where(eq(settingsTable.userId, userId))
      .limit(1);
    if (existing.length) return;
    const legacy = await tx
      .select({ id: settingsTable.id })
      .from(settingsTable)
      .where(isNull(settingsTable.userId))
      .limit(1);
    if (!legacy.length) return;

    await tx.update(settingsTable).set({ userId }).where(isNull(settingsTable.userId));
    await tx.update(incomeSourcesTable).set({ userId }).where(isNull(incomeSourcesTable.userId));
    await tx.update(categoriesTable).set({ userId }).where(isNull(categoriesTable.userId));
    await tx.update(planLinesTable).set({ userId }).where(isNull(planLinesTable.userId));
    await tx.update(rulesTable).set({ userId }).where(isNull(rulesTable.userId));
    await tx.update(importsTable).set({ userId }).where(isNull(importsTable.userId));
    await tx.update(transactionsTable).set({ userId }).where(isNull(transactionsTable.userId));
  });
}

export const requireUser: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  const candidateUserId = auth.sessionClaims?.userId || auth.userId;
  const userId = typeof candidateUserId === "string" ? candidateUserId : undefined;
  if (!userId) {
    res.status(401).json({ error: "Sign in is required to access Ledger." });
    return;
  }
  try {
    await claimLegacyHousehold(userId);
    req.userId = userId;
    next();
  } catch (error) {
    req.log.error({ err: error }, "could not prepare Ledger ownership");
    res.status(500).json({ error: "Could not open your Ledger." });
  }
};

export function currentUserId(req: Express.Request): string {
  if (!req.userId) throw new Error("Authenticated user was not attached to request");
  return req.userId;
}