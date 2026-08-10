import { useGetSettings, useGetReconciliation, getGetReconciliationQueryKey } from "@workspace/api-client-react";
import { formatCurrency, PageHeader, Skeleton, Card, CardContent, Badge } from "@/components/ui/core";
import { CheckCircle2, AlertTriangle, Scale } from "lucide-react";

export default function Reconciliation() {
  const { data: settings } = useGetSettings();
  const selectedMonth = settings?.selectedMonth;

  const { data: reconciliationData, isLoading } = useGetReconciliation(
    { month: selectedMonth },
    { 
      query: { 
        enabled: !!selectedMonth,
        queryKey: getGetReconciliationQueryKey({ month: selectedMonth }) 
      } 
    }
  );

  if (isLoading || !selectedMonth) {
    return (
      <div>
        <PageHeader title="Reconciliation" description="Match expected vs actual flows" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  const rows = reconciliationData || [];
  const needsInvestigation = rows.filter(r => r.status === "Investigate").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Reconciliation" 
        description={`Audit trail for ${selectedMonth}`}
        action={
          needsInvestigation === 0 ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-100 px-4 py-2 rounded-full dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
              <CheckCircle2 size={18} />
              <span className="font-medium text-sm">All matched</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-2 rounded-full border border-destructive/20">
              <AlertTriangle size={18} />
              <span className="font-medium text-sm">{needsInvestigation} discrepancies found</span>
            </div>
          )
        }
      />

      <div className="bg-card border border-card-border rounded-lg overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-muted/10 flex items-center gap-3">
          <Scale className="text-muted-foreground" size={20} />
          <h3 className="font-serif text-lg font-semibold text-foreground">Category Audit</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium text-right">Bank Statement</th>
                <th className="px-6 py-4 font-medium text-right">Ledger Data</th>
                <th className="px-6 py-4 font-medium text-right">Difference</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => (
                <tr key={i} className={`hover:bg-muted/10 transition-colors ${row.status === 'Investigate' ? 'bg-destructive/5' : ''}`}>
                  <td className="px-6 py-4 font-medium text-foreground">{row.category}</td>
                  <td className="px-6 py-4 text-right font-mono text-muted-foreground">
                    {formatCurrency(Math.abs(row.bankTotal))}
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    {formatCurrency(Math.abs(row.manualTotal))}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-medium">
                    {Math.abs(row.difference) > 0 ? (
                      <span className={row.status === 'Investigate' ? 'text-destructive' : 'text-primary'}>
                        {formatCurrency(row.difference)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground opacity-50">$0.00</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.status === "Matched" ? (
                      <Badge variant="success" className="font-normal">Matched</Badge>
                    ) : (
                      <Badge variant="destructive" className="font-normal">Investigate</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground italic">
                    No transaction data to reconcile for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {needsInvestigation > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6">
            <h4 className="font-serif font-semibold text-destructive mb-2 flex items-center gap-2">
              <AlertTriangle size={18} /> How to fix discrepancies
            </h4>
            <ul className="list-disc list-inside text-sm text-foreground/80 space-y-1 ml-6 mt-3">
              <li>Check the <a href="/transactions" className="text-primary hover:underline">Transactions page</a> for missing manual entries (like cash purchases).</li>
              <li>Ensure all imported bank transactions are properly categorized.</li>
              <li>Verify that "Exclude" toggles on transactions are set correctly.</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}