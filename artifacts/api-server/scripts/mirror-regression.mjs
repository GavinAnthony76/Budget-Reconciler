// Regression test for the linked bank/manual mirror model.
// Runs against the dev API using a synthetic far-future month (Jan 2031, pay
// cycle day 29 => budget month "February 2031") and cleans up after itself.
// Usage: node artifacts/api-server/scripts/mirror-regression.mjs
const B = process.env.API_BASE ?? "http://localhost:80";
const j = async (u, o) => {
  const r = await fetch(B + u, o);
  if (r.status === 204) return null;
  const body = await r.json();
  if (!r.ok) throw new Error(`${u} -> ${r.status} ${JSON.stringify(body)}`);
  return body;
};
const post = (u, body) =>
  j(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patch = (u, body) =>
  j(u, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log("PASS:", msg);
  else {
    failures++;
    console.error("FAIL:", msg);
  }
};

const MONTH = "February 2031";
const rows = async () => (await j("/api/transactions")).filter((t) => t.month === MONTH);
const cleanup = async () => {
  for (const t of await rows()) {
    await j(`/api/transactions/${t.id}`, { method: "DELETE" }).catch(() => {});
  }
};

const csv = (lines) =>
  "Date,Description,Original Description,Category,Amount,Status,Account\n" + lines.join("\n");

await cleanup();
try {
  // 1. Manual entry exists; import same-amount UNRELATED purchase same window
  //    -> must NOT link (different merchant), creates its own mirror.
  await post("/api/transactions", {
    date: "2031-01-30",
    description: "Cash - babysitter",
    amount: -50,
    category: "Miscellaneous",
    subcategory: "Uncategorized",
  });
  await post("/api/import", {
    csvContent: csv(['01/31/2031,SHELL OIL 123,SHELL OIL 123 TAMPA FL,Gas,-50.00,Posted,Checking']),
  });
  let r = await rows();
  const shellMirror = r.find((t) => t.source === "manual" && /shell/i.test(t.description));
  assert(!!shellMirror, "unrelated same-amount purchase gets its own mirror (no false link)");
  const babysitter = r.find((t) => t.description.includes("babysitter"));
  assert(!!babysitter, "pre-existing manual row untouched");

  // 2. Manual entry for SAME merchant (similar description, ±$0.25) -> linked, no duplicate.
  await post("/api/transactions", {
    date: "2031-01-30",
    description: "Publix groceries",
    amount: -82.4,
    category: "Food",
    subcategory: "Groceries",
  });
  await post("/api/import", {
    csvContent: csv(['01/31/2031,Publix,PUBLIX #451 ORLANDO FL,Groceries,-82.55,Posted,Checking']),
  });
  r = await rows();
  const publixManual = r.filter((t) => t.source === "manual" && /publix/i.test(t.description));
  assert(publixManual.length === 1, "same-merchant fuzzy match links instead of duplicating");
  const publixBank = r.find((t) => t.source === "bank" && /publix/i.test(t.description));
  // Categorize the bank row; the linked manual row must follow.
  await patch(`/api/transactions/${publixBank.id}`, { category: "Food", subcategory: "Dining Out" });
  r = await rows();
  assert(
    r.find((t) => t.id === publixManual[0].id).subcategory === "Dining Out",
    "categorizing bank row propagates to linked manual row",
  );

  // 3. Excluded import (Transfer) must NOT create a manual mirror.
  await post("/api/import", {
    csvContent: csv(['01/31/2031,Online Transfer to Savings,ONLINE TRANSFER,Transfer,-500.00,Posted,Checking']),
  });
  r = await rows();
  assert(
    !r.some((t) => t.source === "manual" && /transfer/i.test(t.description)),
    "excluded (transfer) import creates no manual spending row",
  );

  // 4. Exclusion propagates and clears review state; deleting the bank row
  //    removes the mirror too.
  await post("/api/import", {
    csvContent: csv(['01/31/2031,ZZUNKNOWN MERCHANT 77,ZZUNKNOWN MERCHANT 77 FL,Category Pending,-19.99,Posted,Checking']),
  });
  r = await rows();
  const unknownBank = r.find((t) => t.source === "bank" && /zzunknown/i.test(t.description));
  assert(unknownBank.needsReview === true, "unmatched import lands in review queue");
  await patch(`/api/transactions/${unknownBank.id}`, { include: false });
  r = await rows();
  assert(
    r.filter((t) => /zzunknown/i.test(t.description)).every((t) => !t.needsReview && !t.include),
    "excluding a review item clears needsReview and include on bank row and mirror",
  );
  await patch(`/api/transactions/${publixBank.id}`, { include: false });
  r = await rows();
  assert(
    r.find((t) => t.id === publixManual[0].id).include === false,
    "excluding bank row excludes linked manual row",
  );
  await j(`/api/transactions/${publixBank.id}`, { method: "DELETE" });
  r = await rows();
  assert(
    !r.some((t) => t.id === publixManual[0].id),
    "deleting bank row deletes linked manual mirror",
  );

  // 5. Pending rows: no mirror until posted; posting creates it once.
  await post("/api/import", {
    csvContent: csv(['01/31/2031,STARBUCKS 991,STARBUCKS 991 MIAMI FL,Coffee Shops,-6.45,Pending,Checking']),
  });
  r = await rows();
  assert(
    !r.some((t) => t.source === "manual" && /starbucks/i.test(t.description)),
    "pending import has no manual mirror",
  );
  await post("/api/import", {
    csvContent: csv(['01/31/2031,STARBUCKS 991,STARBUCKS 991 MIAMI FL,Coffee Shops,-6.45,Posted,Checking']),
  });
  r = await rows();
  const sbManual = r.filter((t) => t.source === "manual" && /starbucks/i.test(t.description));
  assert(sbManual.length === 1, "pending->posted upgrade creates exactly one manual mirror");

  // 6. Dashboard actuals == sum of included manual rows for the month.
  const dash = await fetch(`${B}/api/dashboard?month=${encodeURIComponent(MONTH)}`).then((x) => x.json());
  const manualSum = (await rows())
    .filter((t) => t.source === "manual" && t.include && t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  assert(
    Math.abs(dash.actualExpenses - manualSum) < 0.01,
    `dashboard actuals (${dash.actualExpenses.toFixed(2)}) match manual rows (${manualSum.toFixed(2)})`,
  );
} finally {
  await cleanup();
}
console.log(failures === 0 ? "ALL TESTS PASSED" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
