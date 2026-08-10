---
name: Budget workbook quirks
description: Non-obvious conventions and pitfalls in the KJA household budget workbook and its CSV importer
---

- Budget months follow a pay cycle: day >= Setup!B9 (default 29) rolls into the NEXT month. The user's manual entries confirmed this (Jul 29 → "August 2026"); the original formula hardcoded serial 46232, breaking all future months.
- **Why:** matches payday; do not "fix" to calendar months.
- xlsx-populate silently drops shared-formula cells when neighbors are cleared — after rewriting data regions, re-write template formulas explicitly for every empty row.
- SheetJS (`xlsx`) reads of xlsx-populate output may not show `<f>` formulas; verify against raw sheet XML before assuming formulas are missing.
- Manual-vs-bank reconciliation only matches if imported-but-uncategorized rows still count as spending (Include = Yes) and every manual row has a Month value (some had text dates and blank months).

**Budget app durable rule:** Manual-source spending rows are the source of truth for actuals; bank rows only feed import and reconciliation. Any included bank expense must have exactly one manual mirror, or dashboard totals and reconciliation diverge. A startup repair pass enforces this invariant (seed data may violate it).
- The user's bank CSVs come from MULTIPLE accounts and files can be pairwise disjoint even over overlapping date ranges — never assume overlap means duplicates. Dedupe fingerprints only within the same account; identical fingerprints on different accounts are both real.
- The user's workbook failed to reconcile because pasted bank rows had no Manual Actuals counterparts (116 bank vs 44 manual) — the mirror invariant, again.

**Account auto-detection (user decision):** users never name accounts. Each imported CSV is matched by fingerprint overlap to an existing account (most shared rows wins); zero overlap → next free "Account N" label. Per-account spending views were explicitly declined — only combined totals matter. An explicit `account` in the import request overrides detection (tests/scripts only).

## Per-month budget plans (Aug 2026)
Plan lines are scoped by a `month` label; new months get their plan via POST /plan/copy (guarded 404/409, serialized with a pg advisory xact lock). `/months` always appends the next cycle month so users can plan ahead. Startup migration backfilled un-monthed lines into every transaction month.
**Why:** user wants to build next month's plan early, copy-forward unchanged items, and keep historical months showing the targets that applied then.
**Gotcha:** orval codegen collides when an operation's request body is inline — name the schema in components (e.g. CopyPlanInput) instead.
