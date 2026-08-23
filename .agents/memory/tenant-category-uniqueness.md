---
name: Tenant category uniqueness
description: Protect tenant-scoped categories from a legacy database-level global name constraint.
---

When making categories tenant-scoped, make uniqueness tenant-scoped too rather
than retaining a global category-name rule.

**Why:** A global uniqueness rule means one household can block another from
using a normal category name, even when all application queries are scoped to a
user.

**How to apply:** Audit the database and ORM together during a tenant-scoping
migration so the resulting rule permits the same category name for different
users while preventing duplicates within one household.