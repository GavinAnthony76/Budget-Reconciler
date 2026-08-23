---
name: Investment budget boundary
description: Keep household cash-flow reporting separate from internal brokerage activity.
---

Treat a deposit or withdrawal as one generated household brokerage-transfer
record linked to its investment activity. Budget vs Actual must calculate from
household ledger rows without guessing that similar rows are duplicates. Buys,
sells, dividends, dividend reinvestments, and fees are only investment
activity.

**Why:** Counting the household transfer and the investment-journal deposit
overstates expenses. Heuristic date-and-amount deduplication is also unsafe:
two equal same-day contributions can both be real. Counting trades again turns
activity inside a brokerage account into false household spending.

**How to apply:** Create, update, and remove the generated household row only
through its explicit investment link; protect it from generic ledger edits.
Count each remaining ledger row in every household-actual surface, including
the dashboard, reconciliation, and workbook export. Synchronize a budget plan
only through the user’s explicit investment-plan action.