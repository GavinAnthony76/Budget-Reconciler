import { useGetDashboard, useGetSettings, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { formatCurrency, PageHeader, Skeleton, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/core";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  PiggyBank, 
  AlertCircle,
  FileSearch,
  CheckCircle2
} from "lucide-react";

export default function Dashboard() {
  const { data: settings } = useGetSettings();
  const selectedMonth = settings?.selectedMonth;

  const { data: dashboard, isLoading } = useGetDashboard(
    { month: selectedMonth },
    { 
      query: { 
        enabled: !!selectedMonth,
        queryKey: getGetDashboardQueryKey({ month: selectedMonth }) 
      } 
    }
  );

  if (!selectedMonth) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Overview of your financial month" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div>
        <PageHeader title="Dashboard" description={`Overview for ${selectedMonth}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader 
        title="Dashboard" 
        description={`Financial overview for ${dashboard.month}`} 
      />

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Income (Actual / Plan)" 
          value={formatCurrency(dashboard.incomeActual)}
          subValue={`vs ${formatCurrency(dashboard.incomePlanned)}`}
          icon={ArrowDownRight}
          trend={dashboard.incomeActual >= dashboard.incomePlanned ? "good" : "neutral"}
        />
        <StatCard 
          title="Expenses (Actual / Plan)" 
          value={formatCurrency(Math.abs(dashboard.actualExpenses))}
          subValue={`vs ${formatCurrency(dashboard.plannedExpenses)}`}
          icon={ArrowUpRight}
          trend={Math.abs(dashboard.actualExpenses) <= dashboard.plannedExpenses ? "good" : "bad"}
        />
        <StatCard 
          title="Remaining Budget" 
          value={formatCurrency(dashboard.remaining)}
          subValue="Across all categories"
          icon={Wallet}
          trend={dashboard.remaining > 0 ? "good" : dashboard.remaining < 0 ? "bad" : "neutral"}
        />
        <StatCard 
          title="Cash Flow" 
          value={formatCurrency(dashboard.cashFlow)}
          subValue="Income minus Expenses"
          icon={PiggyBank}
          trend={dashboard.cashFlow > 0 ? "good" : "bad"}
        />
      </div>

      {/* Action Needed Alerts */}
      {(dashboard.reviewCount > 0 || dashboard.pendingCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {dashboard.reviewCount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-4">
              <div className="text-amber-600 dark:text-amber-500 mt-0.5">
                <FileSearch size={20} />
              </div>
              <div>
                <h4 className="font-medium text-amber-900 dark:text-amber-400">Needs Review</h4>
                <p className="text-sm text-amber-800/80 dark:text-amber-500/80 mt-1">
                  You have {dashboard.reviewCount} transactions that need categorization.
                </p>
              </div>
            </div>
          )}
          {dashboard.pendingCount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-4">
              <div className="text-blue-600 dark:text-blue-500 mt-0.5">
                <AlertCircle size={20} />
              </div>
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-400">Pending Transactions</h4>
                <p className="text-sm text-blue-800/80 dark:text-blue-500/80 mt-1">
                  {dashboard.pendingCount} transactions are still pending and waiting to post.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Budget vs Actual by Category</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium text-right">Planned</th>
                  <th className="px-6 py-4 font-medium text-right">Actual</th>
                  <th className="px-6 py-4 font-medium text-right">Remaining</th>
                  <th className="px-6 py-4 font-medium w-1/4">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dashboard.byCategory.map((cat, i) => {
                  const percentUsed = cat.planned > 0 ? Math.min(100, Math.max(0, (Math.abs(cat.actual) / cat.planned) * 100)) : 0;
                  const isOver = Math.abs(cat.actual) > cat.planned;
                  
                  return (
                    <tr key={i} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{cat.category}</td>
                      <td className="px-6 py-4 text-right font-mono text-muted-foreground">{formatCurrency(cat.planned)}</td>
                      <td className="px-6 py-4 text-right font-mono">{formatCurrency(Math.abs(cat.actual))}</td>
                      <td className={`px-6 py-4 text-right font-mono ${isOver ? 'text-destructive' : 'text-primary'}`}>
                        {formatCurrency(cat.remaining)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${isOver ? 'bg-destructive' : 'bg-primary'}`} 
                            style={{ width: `${percentUsed}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {dashboard.byCategory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground italic">
                      No plan data available for this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, subValue, icon: Icon, trend }: { title: string, value: string, subValue: string, icon: any, trend: "good" | "bad" | "neutral" }) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-5 pointer-events-none ${
        trend === "good" ? "bg-green-500" : trend === "bad" ? "bg-destructive" : "bg-primary"
      }`} />
      <CardContent className="p-6 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          <div className={`p-2 rounded-md ${
            trend === "good" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : 
            trend === "bad" ? "bg-destructive/10 text-destructive" : 
            "bg-primary/10 text-primary"
          }`}>
            <Icon size={18} />
          </div>
        </div>
        <div>
          <p className="text-3xl font-serif font-bold text-foreground mb-1 font-mono">{value}</p>
          <p className="text-sm text-muted-foreground">{subValue}</p>
        </div>
      </CardContent>
    </Card>
  );
}