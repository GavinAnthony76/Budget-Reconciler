import { Router, type IRouter } from "express";
import path from "node:path";
import fs from "node:fs";
import { and, asc, eq } from "drizzle-orm";
// @ts-expect-error - xlsx-populate has no bundled types
import XlsxPopulate from "xlsx-populate";
import JSZip from "jszip";
import {
  db,
  settingsTable,
  incomeSourcesTable,
  planLinesTable,
  rulesTable,
  transactionsTable,
} from "@workspace/db";
import { currentUserId } from "../middlewares/requireUser";

const router: IRouter = Router();

const TEMPLATE = [
  path.resolve(process.cwd(), "templates/budget-template.xlsx"),
  path.resolve(process.cwd(), "artifacts/api-server/templates/budget-template.xlsx"),
].find((p) => fs.existsSync(p))!;

const EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;
function serialFromIso(iso: string): number {
  return Math.round((Date.parse(iso + "T00:00:00Z") - EPOCH) / DAY_MS);
}

router.get("/export", async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const [settingsRow] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId))
    .limit(1);
  const exportMonth = settingsRow?.selectedMonth ?? "";
  const [incomes, planLines, rules, txns] = await Promise.all([
    db.select().from(incomeSourcesTable).where(eq(incomeSourcesTable.userId, userId)).orderBy(asc(incomeSourcesTable.id)),
    db
      .select()
      .from(planLinesTable)
      .where(and(eq(planLinesTable.month, exportMonth), eq(planLinesTable.userId, userId)))
      .orderBy(asc(planLinesTable.id)),
    db
      .select()
      .from(rulesTable)
      .where(and(eq(rulesTable.matchType, "description"), eq(rulesTable.userId, userId)))
      .orderBy(asc(rulesTable.id)),
    db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId)),
  ]);

  const wb = await XlsxPopulate.fromFileAsync(TEMPLATE);
  const setup = wb.sheet("Setup");
  const bk = wb.sheet("bk_download");
  const manual = wb.sheet("Manual Actuals");
  const plan = wb.sheet("Budget Plan");
  const rulesSheet = wb.sheet("Rules");

  // ----- Setup core settings -----
  if (settingsRow) {
    setup.cell("B4").value(settingsRow.selectedMonth);
    setup.cell("B5").value(settingsRow.checkingBuffer);
    setup.cell("B6").value(settingsRow.debtStrategy);
    setup.cell("B9").value(settingsRow.monthStartDay);
  }

  // ----- Income sources (Setup D4:H10 region; clear then write) -----
  for (let r = 4; r <= 10; r++) {
    for (const c of ["D", "E", "F", "G", "H"]) setup.cell(`${c}${r}`).value(undefined);
  }
  incomes.slice(0, 7).forEach((inc, i) => {
    const r = 4 + i;
    setup.cell(`D${r}`).value(inc.name);
    setup.cell(`E${r}`).value(inc.owner);
    setup.cell(`F${r}`).value(inc.frequency);
    setup.cell(`G${r}`).value(inc.netAmount);
    setup.cell(`H${r}`).value(inc.monthlyEquivalent);
  });

  // ----- Budget Plan rows (4..55 in template; A,B,C,G,H,I,J) -----
  for (let r = 4; r <= 55; r++) {
    for (const c of ["A", "B", "C", "G", "H", "I", "J"]) plan.cell(`${c}${r}`).value(undefined);
  }
  planLines.slice(0, 52).forEach((p, i) => {
    const r = 4 + i;
    plan.cell(`A${r}`).value(p.category);
    plan.cell(`B${r}`).value(p.subcategory);
    plan.cell(`C${r}`).value(p.planned);
    plan.cell(`G${r}`).value(p.priority);
    plan.cell(`H${r}`).value(p.fixedVariable);
    if (p.dueDay != null) plan.cell(`I${r}`).value(p.dueDay);
    if (p.notes) plan.cell(`J${r}`).value(p.notes);
  });

  // ----- Rules sheet -----
  if (rulesSheet) {
    for (let r = 2; r <= 500; r++) {
      for (const c of ["A", "B", "C", "D"]) rulesSheet.cell(`${c}${r}`).value(undefined);
    }
    rules.forEach((rule, i) => {
      const r = 2 + i;
      rulesSheet.cell(`A${r}`).value(rule.pattern);
      rulesSheet.cell(`B${r}`).value(rule.category);
      rulesSheet.cell(`C${r}`).value(rule.subcategory);
    });
  }

  // ----- bk_download rows -----
  // The template has fixed capacity (rows 2..2000 bank, 2..900 manual are
  // cleared/rewritten). Refuse to export beyond it rather than silently
  // leaving stale template rows behind.
  const BANK_CAPACITY = 1999;
  const MANUAL_CAPACITY = 899;
  const bankTotal = txns.filter((t) => t.source === "bank").length;
  const manualTotal = txns.filter(
    (t) => t.source === "manual" || t.source === "investment",
  ).length;
  if (bankTotal > BANK_CAPACITY || manualTotal > MANUAL_CAPACITY) {
    res.status(409).json({
      error:
        `Workbook export supports up to ${BANK_CAPACITY} bank and ${MANUAL_CAPACITY} household actual transactions ` +
        `(you have ${bankTotal} bank and ${manualTotal} household actuals). ` +
        "Archive older transactions before exporting.",
    });
    return;
  }
  const bankTxns = txns
    .filter((t) => t.source === "bank")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id - b.id));
  for (let r = 2; r <= 2000; r++) {
    for (const c of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"])
      bk.cell(`${c}${r}`).value(undefined);
  }
  bankTxns.forEach((t, i) => {
    const r = i + 2;
    const include = t.include ? "Yes" : "No";
    bk.cell(`A${r}`).value(serialFromIso(t.date)).style("numberFormat", "m/d/yyyy");
    bk.cell(`B${r}`).value(t.description);
    bk.cell(`C${r}`).value(t.originalDescription ?? "");
    bk.cell(`D${r}`).value(t.bankCategory ?? "");
    bk.cell(`E${r}`).value(t.amount).style("numberFormat", "#,##0.00");
    bk.cell(`F${r}`).value(t.status);
    bk.cell(`G${r}`).value(t.account ?? "Checking");
    bk.cell(`H${r}`).value(t.category ?? "Miscellaneous");
    bk.cell(`I${r}`).value(t.subcategory ?? "Uncategorized");
    bk.cell(`J${r}`).value(include);
    bk.cell(`K${r}`).value(t.month);
    bk.cell(`L${r}`).value(t.include && t.amount < 0 ? -t.amount : 0).style("numberFormat", "#,##0.00");
    bk.cell(`M${r}`).value(t.include && t.amount > 0 ? t.amount : 0).style("numberFormat", "#,##0.00");
    bk.cell(`N${r}`).value(t.needsReview ? "Needs categorization" : (t.note ?? ""));
  });
  // Restore helper formulas in empty template rows
  for (let r = bankTxns.length + 2; r <= 1902; r++) {
    bk.cell(`G${r}`).formula(`IF(A${r}="","","Checking")`);
    bk.cell(`H${r}`).formula(`IF(A${r}="","",IFERROR(XLOOKUP(D${r},Setup!$E$15:$E$79,Setup!$F$15:$F$79),"Miscellaneous"))`);
    bk.cell(`I${r}`).formula(`IF(A${r}="","",IFERROR(XLOOKUP(D${r},Setup!$E$15:$E$79,Setup!$G$15:$G$79),"Uncategorized"))`);
    bk.cell(`J${r}`).formula(`IF(A${r}="","",IF(OR(H${r}="Transfers",H${r}="Income",D${r}="Transfer",D${r}="Category Pending",F${r}="Pending"),"No","Yes"))`);
    bk.cell(`K${r}`).formula(`IF(A${r}="","",TEXT(IF(DAY(A${r})>=Setup!$B$9,DATE(YEAR(A${r}),MONTH(A${r})+1,1),DATE(YEAR(A${r}),MONTH(A${r}),1)),"mmmm yyyy"))`);
    bk.cell(`L${r}`).formula(`IF(A${r}="",0,IF(AND(J${r}="Yes",E${r}<0),-E${r},0))`);
    bk.cell(`M${r}`).formula(`IF(A${r}="",0,IF(AND(J${r}="Yes",E${r}>0),E${r},0))`);
    bk.cell(`N${r}`).formula(`IF(A${r}="","",IF(D${r}="Category Pending","Needs categorization",IF(COUNTIFS($A$2:A${r},A${r},$B$2:B${r},B${r},$E$2:E${r},E${r})>1,"Possible duplicate","")))`);
  }

  // ----- Manual Actuals rows -----
  const manualTxns = txns
    .filter((t) => t.source === "manual" || t.source === "investment")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  for (let r = 2; r <= 900; r++) {
    for (const c of ["A", "B", "C", "D", "E", "F", "G", "H", "I"])
      manual.cell(`${c}${r}`).value(undefined);
  }
  manualTxns.forEach((t, i) => {
    const r = i + 2;
    manual.cell(`A${r}`).value(serialFromIso(t.date)).style("numberFormat", "m/d/yyyy");
    manual.cell(`B${r}`).value(t.description);
    manual.cell(`C${r}`).value(Math.abs(t.amount)).style("numberFormat", "$#,##0.00");
    manual.cell(`D${r}`).value(t.category ?? "Miscellaneous");
    manual.cell(`E${r}`).value(t.subcategory ?? "Uncategorized");
    manual.cell(`F${r}`).value(t.account ?? "Checking");
    manual.cell(`G${r}`).value(t.include ? "Yes" : "No");
    manual.cell(`H${r}`).value(t.month);
    manual.cell(`I${r}`).value(t.note ?? "");
  });
  for (let r = manualTxns.length + 2; r <= 861; r++) {
    manual
      .cell(`H${r}`)
      .formula(
        `IF(A${r}="","",TEXT(IF(DAY(A${r})>=Setup!$B$9,DATE(YEAR(A${r}),MONTH(A${r})+1,1),DATE(YEAR(A${r}),MONTH(A${r}),1)),"mmmm yyyy"))`,
      );
  }

  // ----- Post-process zip: remove broken defined name, force recalc -----
  const buf: Buffer = await wb.outputAsync();
  const zip = await JSZip.loadAsync(buf);
  let wbXml = await zip.file("xl/workbook.xml")!.async("string");
  wbXml = wbXml.replace(/<definedName name="ColumnTitle1"[^>]*>[^<]*<\/definedName>/, "");
  // xlsx-populate preserves the template's calculation settings. Only add
  // fullCalcOnLoad when it is absent; duplicating the XML attribute makes an
  // otherwise valid ZIP unreadable in Excel.
  if (!/<calcPr\b[^>]*\bfullCalcOnLoad=/.test(wbXml)) {
    if (/<calcPr[^>]*\/>/.test(wbXml)) {
      wbXml = wbXml.replace(/<calcPr([^>]*)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>');
    } else {
      wbXml = wbXml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    }
  }
  zip.file("xl/workbook.xml", wbXml);
  zip.remove("xl/calcChain.xml");
  let ct = await zip.file("[Content_Types].xml")!.async("string");
  ct = ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, "");
  zip.file("[Content_Types].xml", ct);
  let rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  rels = rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, "");
  zip.file("xl/_rels/workbook.xml.rels", rels);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const stamp = new Date().toISOString().slice(0, 10);
  res
    .status(200)
    .setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    .setHeader(
      "Content-Disposition",
      `attachment; filename="KJA_Budget_${stamp}.xlsx"`,
    )
    .send(out);
  req.log.info({ rows: bankTxns.length + manualTxns.length }, "Workbook exported");
});

export default router;
