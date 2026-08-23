import { useState, Fragment } from "react";
import {
  useGetSettings,
  useGetReconciliation,
  getGetReconciliationQueryKey,
  useListTransactions,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { Transaction } from "@workspace/api-client-react";
import { formatCurrency, PageHeader, Skeleton, Card, CardContent, Badge } from "@/components/ui/core";
import { CheckCircle2, AlertTriangle, Scale, ChevronDown, ChevronRight } from "lucide-react";

/** Mirrors the server's reconciliation bucketing: included expenses only. */
function categoryTransactions(txns: Transaction[], category: string) {
  const bank: Transaction[] = [];
  const manual: Transaction[] = [];
  for (const t of txns) {
    if (!t.include || t.amount >= 0) continue;
    const c = t.category ?? "Miscellaneous";
    if (c !== category) continue;
    if (t.source === "manual") manual.push(t);
    else if ((t.status ?? "").trim().toUpperCase() === "POSTED") bank.push(t);
  }
  const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date);
  bank.sort(byDate);
  manual.sort(byDate);
  return { bank, manual };
}

function DetailList({ title, items, accent }: { title: string; items: Transaction[]; accent: string }) {
  return (
    <div className="flex-1 min-w-[260px]">
      <div className={`text-xs uppercase tracking-wider font-display font-bold mb-2 ${accent}`}>
        {title} · {items.length} {items.length === 1 ? "item" : "items"}
      </div>
      {items.length === 0 ? (
        <div className="text-white/30 italic text-sm">No entries</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-4 text-sm" data-testid={`row-audit-txn-${t.id}`}>
              <span className="text-white/40 font-mono shrink-0">{t.date.slice(5)}</span>
              <span className="text-white/80 truncate flex-1" title={t.description}>{t.description}</span>
              <span className="font-mono text-white/90 shrink-0">{formatCurrency(Math.abs(t.amount))}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-4 text-sm border-t border-white/10 pt-1.5 mt-1.5">
            <span className="text-white/50 font-bold uppercase text-xs tracking-wider font-display">Total</span>
            <span className="font-mono font-bold text-white">
              {formatCurrency(items.reduce((s, t) => s + Math.abs(t.amount), 0))}
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}

export default function Reconciliation() {
  const { data: settings } = useGetSettings();
  const selectedMonth = settings?.selectedMonth;
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: reconciliationData, isLoading } = useGetReconciliation(
    { month: selectedMonth },
    { 
      query: { 
        enabled: !!selectedMonth,
        queryKey: getGetReconciliationQueryKey({ month: selectedMonth }) 
      } 
    }
  );

  const { data: monthTxns } = useListTransactions(
    { month: selectedMonth },
    {
      query: {
        enabled: !!selectedMonth,
        queryKey: getListTransactionsQueryKey({ month: selectedMonth }),
      },
    }
  );

  if (isLoading || !selectedMonth) {
    return (
      <div>
        <PageHeader title="Reconciliation" description="Match expected vs actual flows" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  const rows = reconciliationData || [];
  const needsInvestigation = rows.filter(r => r.status === "Investigate").length;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <PageHeader 
          title="Reconciliation" 
          description={`Audit trail for ${selectedMonth}`}
        />
        <div className="mb-8 relative z-10 w-full sm:w-auto animate-in fade-in slide-in-from-right-4 duration-500 delay-200">
          {needsInvestigation === 0 ? (
            <div className="flex items-center justify-center sm:justify-start gap-3 text-chart-4 bg-chart-4/10 px-5 py-3 rounded-xl border border-chart-4/20 shadow-[0_0_15px_rgba(0,255,100,0.1)]">
              <CheckCircle2 size={20} className="drop-shadow-[0_0_8px_rgba(0,255,100,0.5)]" />
              <span className="font-bold font-display tracking-wide uppercase text-sm">All matched</span>
            </div>
          ) : (
            <div className="flex items-center justify-center sm:justify-start gap-3 text-destructive bg-destructive/10 px-5 py-3 rounded-xl border border-destructive/20 shadow-[0_0_15px_rgba(255,50,50,0.15)]">
              <AlertTriangle size={20} className="drop-shadow-[0_0_8px_rgba(255,50,50,0.5)]" />
              <span className="font-bold font-display tracking-wide uppercase text-sm">{needsInvestigation} discrepancies</span>
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel border-white/10 rounded-2xl overflow-hidden shadow-sm relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
        <div className="p-6 border-b border-white/10 bg-white/5 flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-primary/5 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" />
          <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center text-white relative z-10">
            <Scale size={20} />
          </div>
          <div className="relative z-10">
            <h3 className="font-display text-xl font-bold text-white">Category Audit</h3>
            <p className="text-white/40 text-xs mt-0.5">Click a category to see every transaction behind its totals</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider font-display border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-bold">Category</th>
                <th className="px-6 py-4 font-bold text-right">Imported CSV</th>
                <th className="px-6 py-4 font-bold text-right">Ledger Data</th>
                <th className="px-6 py-4 font-bold text-right">Difference</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => {
                const isOpen = expanded === row.category;
                const detail = isOpen && monthTxns ? categoryTransactions(monthTxns, row.category) : null;
                return (
                  <Fragment key={row.category}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : row.category)}
                      data-testid={`row-audit-${row.category}`}
                      className={`cursor-pointer hover:bg-white/5 transition-colors group ${row.status === 'Investigate' ? 'bg-destructive/10 hover:bg-destructive/20' : ''}`}
                    >
                      <td className="px-6 py-4 font-bold text-white group-hover:text-primary transition-colors">
                        <span className="inline-flex items-center gap-2">
                          {isOpen ? <ChevronDown size={16} className="text-primary" /> : <ChevronRight size={16} className="text-white/30 group-hover:text-primary transition-colors" />}
                          {row.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-white/50">
                        {formatCurrency(Math.abs(row.bankTotal))}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-white/90 font-bold">
                        {formatCurrency(Math.abs(row.manualTotal))}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold">
                        {Math.abs(row.difference) > 0 ? (
                          <span className={row.status === 'Investigate' ? 'text-destructive drop-shadow-[0_0_8px_rgba(255,50,50,0.5)]' : 'text-primary'}>
                            {formatCurrency(row.difference)}
                          </span>
                        ) : (
                          <span className="text-white/20 font-normal">$0.00</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {row.status === "Matched" ? (
                          <Badge variant="success" className="bg-chart-4/10 text-chart-4 border-chart-4/20 shadow-none">Matched</Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30 shadow-[0_0_10px_rgba(255,50,50,0.3)]">Investigate</Badge>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-black/20" data-testid={`detail-audit-${row.category}`}>
                        <td colSpan={5} className="px-6 py-5 whitespace-normal">
                          {detail ? (
                            <div className="flex flex-col md:flex-row gap-6 md:gap-10">
                              <DetailList title="Imported CSV" items={detail.bank} accent="text-white/50" />
                              <DetailList title="Ledger entries" items={detail.manual} accent="text-primary" />
                            </div>
                          ) : (
                            <Skeleton className="h-16 w-full rounded-xl" />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-white/40 italic font-display">
                    No transaction data to reconcile for this cycle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {needsInvestigation > 0 && (
        <Card className="border-t-4 border-t-destructive relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500 fill-mode-both">
          <CardContent className="p-6 sm:p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-destructive/10 rounded-full blur-[50px] pointer-events-none group-hover:bg-destructive/20 transition-colors duration-700" />
            <h4 className="font-display text-xl font-bold text-white mb-4 flex items-center gap-3 relative z-10">
              <div className="h-10 w-10 bg-destructive/20 text-destructive rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(255,50,50,0.2)]">
                <AlertTriangle size={20} />
              </div>
              How to fix discrepancies
            </h4>
            <ul className="list-disc list-outside text-white/70 space-y-2 ml-14 mt-4 relative z-10">
              <li>Check the <a href="/transactions" className="text-primary hover:text-primary/80 font-bold hover:underline underline-offset-4 decoration-primary/50 transition-all">Ledger</a> for missing manual entries (like cash purchases).</li>
              <li>Ensure all imported CSV transactions are properly categorized.</li>
              <li>Verify that "Include in Budget" toggles on transactions are set correctly.</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
