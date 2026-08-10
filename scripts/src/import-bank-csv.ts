/**
 * Bank CSV -> Budget Workbook importer.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run import-bank -- \
 *     --csv <bank csv> --in <workbook.xlsx> --out <output.xlsx>
 *
 * What it does:
 *  1. Ensures a "Rules" sheet exists (merchant pattern -> Budget Category/Subcategory),
 *     seeding it from built-in rules derived from the user's existing Manual Actuals.
 *  2. Ensures Setup has a "Budget Month Start Day" setting (default 29). A transaction on
 *     or after that day of the month belongs to the NEXT budget month (pay-cycle logic).
 *  3. Parses the bank CSV, dedupes against rows already in bk_download (with multiplicity,
 *     so genuine repeated charges survive), and appends new rows.
 *  4. Recomputes helper columns G..N for EVERY data row in bk_download:
 *     Account, Budget Category, Subcategory (Rules first, then the Setup bank-category
 *     mapping table), Include?, Month, Expense/Income split, and Review Note.
 *     Pending rows are excluded from totals; a Posted row that matches a Pending row
 *     replaces it (no double-count).
 *  5. Populates Manual Actuals from included bank expense rows, skipping rows that match
 *     an existing manual entry (amount within $0.25 and date within 4 days).
 *  6. Fixes the hardcoded month-cutoff formulas in the empty template rows and repairs
 *     the broken ColumnTitle1 defined name; forces full recalc on open.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
// @ts-expect-error - xlsx-populate has no bundled types
import XlsxPopulate from "xlsx-populate";
import JSZip from "jszip";

// ---------- CLI ----------
function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (def !== undefined) return def;
  console.error(`Missing --${name}`);
  process.exit(1);
}
const csvPath = arg("csv");
const inPath = arg("in");
const outPath = arg("out");

// ---------- date helpers (Excel serials, 1900 system) ----------
const EPOCH = Date.UTC(1899, 11, 30); // Excel day 0
const DAY_MS = 86400000;
const serialFromDate = (d: Date) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - EPOCH) / DAY_MS);
const dateFromSerial = (s: number) => new Date(EPOCH + Math.round(s) * DAY_MS);
function parseCsvDate(v: string): number {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return serialFromDate(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return serialFromDate(new Date(Date.UTC(y, +m[1] - 1, +m[2])));
  }
  throw new Error(`Unparseable date: ${v}`);
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function budgetMonth(serial: number, startDay: number): string {
  const d = dateFromSerial(serial);
  let y = d.getUTCFullYear();
  let mo = d.getUTCMonth();
  if (d.getUTCDate() >= startDay) {
    mo += 1;
    if (mo > 11) { mo = 0; y += 1; }
  }
  return `${MONTHS[mo]} ${y}`;
}

// ---------- normalization ----------
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const money = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ---------- seed merchant rules (derived from existing Manual Actuals + bank data) ----------
const SEED_RULES: Array<[string, string, string]> = [
  ["CITY OF KILLEEN", "Utilities", "Water/Sewer/Trash"],
  ["JUST ENERGY", "Utilities", "Electricity"],
  ["TMOBILE", "Utilities", "Telephone"],
  ["T-MOBILE", "Utilities", "Telephone"],
  ["YOUTUBE TV", "Subscriptions", "Streaming"],
  ["GOOGLE *YOUTUBE", "Subscriptions", "Streaming"],
  ["AMAZON", "Subscriptions", "Other Subscriptions"],
  ["CASEYS", "Vehicle", "Fuel"],
  ["7-ELEVEN", "Vehicle", "Fuel"],
  ["STAR MART", "Vehicle", "Fuel"],
  ["H-E-B", "Food", "Groceries"],
  ["DOORDASH", "Food", "Dining Out"],
  ["DUNKIN", "Food", "Dining Out"],
  ["MCDONALD", "Food", "Dining Out"],
  ["POPEYES", "Food", "Dining Out"],
  ["PLUCKERS", "Food", "Dining Out"],
  ["MARINER FINANCE", "Debt", "Loans"],
  ["MOLLY MAID", "Housing", "Home Maintenance"],
  ["REGAL", "Entertainment", "Entertainment"],
  ["DFAS", "Income", "Other Income"],
];

async function main() {
  const wb = await XlsxPopulate.fromFileAsync(inPath);
  const sheet = (n: string) => {
    const s = wb.sheet(n);
    if (!s) throw new Error(`Missing sheet: ${n}`);
    return s;
  };
  const setup = sheet("Setup");
  const bk = sheet("bk_download");
  const manual = sheet("Manual Actuals");

  // ----- 1. Setup: Budget Month Start Day -----
  let startDay = 29;
  if (norm(setup.cell("A9").value()) !== "BUDGET MONTH START DAY") {
    setup.cell("A9").value("Budget Month Start Day");
    setup.cell("B9").value(startDay);
  } else {
    startDay = Number(setup.cell("B9").value()) || 29;
  }

  // ----- 2. Rules sheet -----
  let rules = wb.sheet("Rules");
  if (!rules) {
    rules = wb.addSheet("Rules");
    rules.cell("A1").value([[
      "Match Text (found anywhere in description)", "Budget Category", "Subcategory", "Notes",
    ]]);
    rules.cell("A2").value(SEED_RULES.map(([p, c, s]) => [p, c, s, "Seeded from existing entries"]));
    rules.column("A").width(45); rules.column("B").width(18); rules.column("C").width(22); rules.column("D").width(30);
    rules.range("A1:D1").style({ bold: true, fill: "D9E1F2" });
  }
  const ruleList: Array<{ pat: string; cat: string; sub: string }> = [];
  for (let r = 2; r <= 500; r++) {
    const p = rules.cell(`A${r}`).value();
    if (!p) continue;
    ruleList.push({ pat: norm(p), cat: String(rules.cell(`B${r}`).value() ?? ""), sub: String(rules.cell(`C${r}`).value() ?? "") });
  }

  // ----- 3. Bank-category mapping table from Setup E15:G79 -----
  const bankCatMap = new Map<string, { cat: string; sub: string }>();
  for (let r = 15; r <= 79; r++) {
    const k = setup.cell(`E${r}`).value();
    if (!k) continue;
    bankCatMap.set(norm(k), { cat: String(setup.cell(`F${r}`).value() ?? "Miscellaneous"), sub: String(setup.cell(`G${r}`).value() ?? "Uncategorized") });
  }

  function categorize(desc: string, origDesc: string, bankCat: string): { cat: string; sub: string; matched: boolean } {
    const d = norm(desc), od = norm(origDesc);
    for (const r of ruleList) if (r.pat && (d.includes(r.pat) || od.includes(r.pat))) return { cat: r.cat, sub: r.sub, matched: true };
    const m = bankCatMap.get(norm(bankCat));
    if (m && norm(bankCat) !== "CATEGORY PENDING" && norm(bankCat) !== "UNCATEGORIZED") return { ...m, matched: true };
    return { cat: "Miscellaneous", sub: "Uncategorized", matched: false };
  }

  // ----- 4. Read existing bk_download data rows -----
  type BkRow = { serial: number; desc: string; orig: string; bankCat: string; amount: number; status: string };
  const existing: BkRow[] = [];
  for (let r = 2; r <= 5000; r++) {
    const a = bk.cell(`A${r}`).value();
    if (a === undefined || a === null || String(a).trim() === "") continue;
    if (typeof a !== "number") continue; // skip junk rows like a lone space
    existing.push({
      serial: a,
      desc: String(bk.cell(`B${r}`).value() ?? ""),
      orig: String(bk.cell(`C${r}`).value() ?? ""),
      bankCat: String(bk.cell(`D${r}`).value() ?? ""),
      amount: money(bk.cell(`E${r}`).value()),
      status: String(bk.cell(`F${r}`).value() ?? "Posted"),
    });
  }

  // ----- 5. Parse CSV -----
  const csvText = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error("CSV parse errors: " + JSON.stringify(parsed.errors.slice(0, 3)));
  const incoming: BkRow[] = parsed.data.map((row) => ({
    serial: parseCsvDate(row["Date"]),
    desc: (row["Description"] ?? "").trim(),
    orig: (row["Original Description"] ?? "").trim(),
    bankCat: (row["Category"] ?? "").trim(),
    amount: money(row["Amount"]),
    status: (row["Status"] ?? "Posted").trim(),
  }));

  // Dedupe with multiplicity: key = date|desc|amount|status-agnostic
  const key = (t: BkRow) => `${t.serial}|${norm(t.desc)}|${t.amount.toFixed(2)}`;
  const counts = new Map<string, number>();
  for (const t of existing) counts.set(key(t), (counts.get(key(t)) ?? 0) + 1);
  let added = 0;
  const all: BkRow[] = [...existing];
  for (const t of incoming) {
    const k = key(t);
    const have = counts.get(k) ?? 0;
    if (have > 0) {
      counts.set(k, have - 1);
      // if CSV says Posted but sheet had Pending, upgrade status
      const match = all.find((e) => key(e) === k && e.status !== t.status);
      if (match && t.status === "Posted") match.status = "Posted";
      continue;
    }
    all.push(t); added++;
  }

  // Pending -> Posted replacement: drop Pending rows that a Posted row supersedes
  const posted = all.filter((t) => norm(t.status) === "POSTED");
  const survivors = all.filter((t) => {
    if (norm(t.status) !== "PENDING") return true;
    return !posted.some((p) => Math.abs(p.amount - t.amount) < 0.005 && Math.abs(p.serial - t.serial) <= 7 &&
      (norm(p.orig).slice(0, 12) === norm(t.orig).slice(0, 12) || norm(p.desc).slice(0, 12) === norm(t.desc).slice(0, 12)));
  });
  survivors.sort((a, b) => b.serial - a.serial);

  // ----- 6. Rewrite bk_download data rows with recomputed columns -----
  const LAST_TEMPLATE_ROW = 1902;
  // clear old data region first
  for (let r = 2; r <= Math.max(existing.length + 5, survivors.length + 5); r++) {
    for (const c of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"]) bk.cell(`${c}${r}`).value(undefined);
  }
  const seen = new Map<string, number>();
  let uncategorized = 0;
  survivors.forEach((t, i) => {
    const r = i + 2;
    const { cat, sub, matched } = categorize(t.desc, t.orig, t.bankCat);
    const isPending = norm(t.status) === "PENDING";
    const isTransfer = cat === "Transfers" || norm(t.bankCat) === "TRANSFER" || norm(t.bankCat) === "TRANSFERS";
    const isIncome = cat === "Income";
    const include = !isPending && !isTransfer && !isIncome ? "Yes" : "No";
    const month = budgetMonth(t.serial, startDay);
    const k = key(t);
    const dupCount = (seen.get(k) ?? 0) + 1; seen.set(k, dupCount);
    let note = "";
    if (isPending) note = "Pending - not counted until posted";
    else if (!matched) { note = "Needs categorization"; uncategorized++; }
    else if (dupCount > 1) note = "Repeated charge - verify not a duplicate";
    bk.cell(`A${r}`).value(t.serial).style("numberFormat", "m/d/yyyy");
    bk.cell(`B${r}`).value(t.desc);
    bk.cell(`C${r}`).value(t.orig);
    bk.cell(`D${r}`).value(t.bankCat);
    bk.cell(`E${r}`).value(t.amount).style("numberFormat", "#,##0.00");
    bk.cell(`F${r}`).value(t.status);
    bk.cell(`G${r}`).value("Checking");
    bk.cell(`H${r}`).value(cat);
    bk.cell(`I${r}`).value(sub);
    bk.cell(`J${r}`).value(include);
    bk.cell(`K${r}`).value(month);
    bk.cell(`L${r}`).value(include === "Yes" && t.amount < 0 ? -t.amount : 0).style("numberFormat", "#,##0.00");
    bk.cell(`M${r}`).value(include === "Yes" && t.amount > 0 ? t.amount : 0).style("numberFormat", "#,##0.00");
    bk.cell(`N${r}`).value(note);
  });
  // Restore helper formulas in all empty template rows (so hand-pasted rows still work),
  // with the month cutoff driven by Setup!$B$9 instead of a hardcoded date.
  for (let r = survivors.length + 2; r <= LAST_TEMPLATE_ROW; r++) {
    bk.cell(`G${r}`).formula(`IF(A${r}="","","Checking")`);
    bk.cell(`H${r}`).formula(`IF(A${r}="","",IFERROR(XLOOKUP(D${r},Setup!$E$15:$E$79,Setup!$F$15:$F$79),"Miscellaneous"))`);
    bk.cell(`I${r}`).formula(`IF(A${r}="","",IFERROR(XLOOKUP(D${r},Setup!$E$15:$E$79,Setup!$G$15:$G$79),"Uncategorized"))`);
    bk.cell(`J${r}`).formula(`IF(A${r}="","",IF(OR(H${r}="Transfers",H${r}="Income",D${r}="Transfer",D${r}="Category Pending",F${r}="Pending"),"No","Yes"))`);
    bk.cell(`K${r}`).formula(`IF(A${r}="","",TEXT(IF(DAY(A${r})>=Setup!$B$9,DATE(YEAR(A${r}),MONTH(A${r})+1,1),DATE(YEAR(A${r}),MONTH(A${r}),1)),"mmmm yyyy"))`);
    bk.cell(`L${r}`).formula(`IF(A${r}="",0,IF(AND(J${r}="Yes",E${r}<0),-E${r},0))`);
    bk.cell(`M${r}`).formula(`IF(A${r}="",0,IF(AND(J${r}="Yes",E${r}>0),E${r},0))`);
    bk.cell(`N${r}`).formula(`IF(A${r}="","",IF(D${r}="Category Pending","Needs categorization",IF(COUNTIFS($A$2:A${r},A${r},$B$2:B${r},B${r},$E$2:E${r},E${r})>1,"Possible duplicate","")))`);
  }

  // ----- 7. Manual Actuals: append included bank expenses not already entered manually -----
  type ManRow = { serial: number; amount: number; used: boolean };
  const manualRows: ManRow[] = [];
  let manLast = 1;
  for (let r = 2; r <= 5000; r++) {
    const a = manual.cell(`A${r}`).value();
    if (a === undefined || a === null || String(a).trim() === "") continue;
    manLast = Math.max(manLast, r);
    // Normalize text dates ("7/29/2026") to real date serials so filters and math work
    let serial: number | null = null;
    if (typeof a === "number") serial = a;
    else {
      try { serial = parseCsvDate(String(a)); } catch { serial = null; }
      if (serial !== null) manual.cell(`A${r}`).value(serial).style("numberFormat", "m/d/yyyy");
    }
    if (serial !== null) {
      manualRows.push({ serial, amount: money(manual.cell(`C${r}`).value()), used: false });
      // Stamp Month as a value on every data row — the original formulas used a hardcoded
      // date cutoff and are unreliable; blank/stale months make rows invisible to totals.
      manual.cell(`H${r}`).value(budgetMonth(serial, startDay));
    }
  }
  // Only auto-import rows the manual sheet doesn't already cover
  const toImport = survivors.filter((t) => {
    if (norm(t.status) === "PENDING" || t.amount >= 0) return false;
    const { cat } = categorize(t.desc, t.orig, t.bankCat);
    if (cat === "Transfers" || cat === "Income") return false;
    const m = manualRows.find((mr) => !mr.used && Math.abs(mr.amount - -t.amount) <= 0.25 && Math.abs(mr.serial - t.serial) <= 4);
    if (m) { m.used = true; return false; }
    return true;
  });
  let mr = manLast + 1;
  for (const t of toImport) {
    const { cat, sub, matched } = categorize(t.desc, t.orig, t.bankCat);
    manual.cell(`A${mr}`).value(t.serial).style("numberFormat", "m/d/yyyy");
    manual.cell(`B${mr}`).value(t.desc);
    manual.cell(`C${mr}`).value(-t.amount).style("numberFormat", "$#,##0.00");
    manual.cell(`D${mr}`).value(cat);
    manual.cell(`E${mr}`).value(sub);
    manual.cell(`F${mr}`).value("Checking");
    manual.cell(`G${mr}`).value("Yes"); // real spending counts even before categorization
    manual.cell(`H${mr}`).value(budgetMonth(t.serial, startDay));
    manual.cell(`I${mr}`).value(matched ? "Imported from bank" : "Imported from bank - needs categorization");
    mr++;
  }
  // Restore month formula in remaining Manual Actuals template rows
  for (let r = mr; r <= 861; r++) {
    manual.cell(`H${r}`).formula(
      `IF(A${r}="","",TEXT(IF(DAY(A${r})>=Setup!$B$9,DATE(YEAR(A${r}),MONTH(A${r})+1,1),DATE(YEAR(A${r}),MONTH(A${r}),1)),"mmmm yyyy"))`,
    );
  }

  // ----- 8. Save, then post-process zip: remove broken defined name, force recalc -----
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const buf: Buffer = await wb.outputAsync();
  const zip = await JSZip.loadAsync(buf);
  let wbXml = await zip.file("xl/workbook.xml")!.async("string");
  wbXml = wbXml.replace(/<definedName name="ColumnTitle1"[^>]*>[^<]*<\/definedName>/, "");
  if (/<calcPr[^>]*\/>/.test(wbXml)) wbXml = wbXml.replace(/<calcPr([^>]*)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>');
  else wbXml = wbXml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
  zip.file("xl/workbook.xml", wbXml);
  zip.remove("xl/calcChain.xml"); // Excel rebuilds it; stale chains cause errors
  let ct = await zip.file("[Content_Types].xml")!.async("string");
  ct = ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, "");
  zip.file("[Content_Types].xml", ct);
  let rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  rels = rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, "");
  zip.file("xl/_rels/workbook.xml.rels", rels);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(outPath, out);

  console.log(JSON.stringify({
    csvRows: incoming.length,
    newRowsAdded: added,
    totalBankRows: survivors.length,
    pendingDropped: all.length - survivors.length,
    manualRowsImported: toImport.length,
    needsCategorization: uncategorized,
    out: outPath,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
