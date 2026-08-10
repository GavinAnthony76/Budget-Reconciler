---
name: Budget workbook quirks
description: Non-obvious conventions and pitfalls in the KJA household budget workbook and its CSV importer
---

- Budget months follow a pay cycle: day >= Setup!B9 (default 29) rolls into the NEXT month. The user's manual entries confirmed this (Jul 29 → "August 2026"); the original formula hardcoded serial 46232, breaking all future months.
- **Why:** matches payday; do not "fix" to calendar months.
- xlsx-populate silently drops shared-formula cells when neighbors are cleared — after rewriting data regions, re-write template formulas explicitly for every empty row.
- SheetJS (`xlsx`) reads of xlsx-populate output may not show `<f>` formulas; verify against raw sheet XML before assuming formulas are missing.
- Manual-vs-bank reconciliation only matches if imported-but-uncategorized rows still count as spending (Include = Yes) and every manual row has a Month value (some had text dates and blank months).

**Budget app durable rule:** Manual-source spending rows are the source of truth for actuals; bank rows only feed import and reconciliation. Any included bank expense must have exactly one manual mirror, or dashboard totals and reconciliation diverge.
