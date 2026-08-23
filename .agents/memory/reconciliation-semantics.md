---
name: Reconciliation semantics
description: Keep transaction-source matching distinct from budget-plan performance.
---

Reconciliation must report two independent facts per category: whether imported
CSV transactions match household ledger data, and whether ledger spending is
within the budget plan.

**Why:** Imported and ledger totals can correctly match while spending is still
over budget. Calling that state simply “matched” hides the budget overage and
confuses the accounting audit with budget performance.

**How to apply:** Preserve a source-match status for imported-versus-ledger
comparison, and expose planned amount plus budget variance and an over-budget
status alongside it. Any refresh feedback must describe both states.