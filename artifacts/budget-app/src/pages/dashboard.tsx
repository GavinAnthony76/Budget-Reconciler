import { useGetDashboard, useGetSettings, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { formatCurrency, PageHeader, Skeleton, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/core";
import { Link } from "wouter";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  PiggyBank, 
  AlertCircle,
  FileSearch,
  CheckCircle2,
  TrendingUp,
  Activity
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
        <PageHeader title="Overview" description="Your financial pulse" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div>
        <PageHeader title="Overview" description={`Loading ${selectedMonth}...`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700">
      <PageHeader 
        title="Overview" 
        description={`Your financial pulse for ${dashboard.month}`} 
      />

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard 
          title="Income vs Plan" 
          value={formatCurrency(dashboard.incomeActual)}
          subValue={`Target: ${formatCurrency(dashboard.incomePlanned)}`}
          icon={ArrowDownRight}
          trend={dashboard.incomeActual >= dashboard.incomePlanned ? "good" : "neutral"}
          color="chart-4"
          delay="0"
        />
        <StatCard 
          title="Expenses vs Plan" 
          value={formatCurrency(Math.abs(dashboard.actualExpenses))}
          subValue={`Target: ${formatCurrency(dashboard.plannedExpenses)}`}
          icon={ArrowUpRight}
          trend={Math.abs(dashboard.actualExpenses) <= dashboard.plannedExpenses ? "good" : "bad"}
          color="destructive"
          delay="100"
        />
        <StatCard 
          title="Remaining Budget" 
          value={formatCurrency(dashboard.remaining)}
          subValue="Across all categories"
          icon={Wallet}
          trend={dashboard.remaining > 0 ? "good" : dashboard.remaining < 0 ? "bad" : "neutral"}
          color="primary"
          delay="200"
        />
        <StatCard 
          title="Cash Flow" 
          value={formatCurrency(dashboard.cashFlow)}
          subValue="Income minus Expenses"
          icon={Activity}
          trend={dashboard.cashFlow > 0 ? "good" : "bad"}
          color="secondary"
          delay="300"
        />
      </div>

      {/* Savings Snapshot */}
      {dashboard.savings && (
        <div className="glass-panel rounded-2xl border border-chart-2/30 p-5 sm:p-6 shadow-[0_8px_32px_0_rgba(46,204,113,0.1)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-chart-2">Savings Goals</p>
              <h2 className="font-display text-xl font-bold text-white mt-1">Progress & Planning</h2>
            </div>
            <Link href="/savings" className="text-sm font-semibold text-chart-2 hover:text-white transition-colors">Manage Goals →</Link>
          </div>
          {dashboard.savings.activeGoalCount > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <InvestmentMetric label="Total saved" value={formatCurrency(dashboard.savings.totalCurrentBalance)} positive={true} />
              <InvestmentMetric label="Monthly need" value={formatCurrency(dashboard.savings.combinedMonthlyNeed)} />
              <InvestmentMetric label="Affordability" value={dashboard.savings.affordabilityStatus.replace(/_/g, ' ')} positive={dashboard.savings.affordabilityStatus === 'Within budget'} />
              {dashboard.savings.primaryGoal ? (
                <InvestmentMetric label="Primary goal" value={`${dashboard.savings.primaryGoal.percentComplete.toFixed(1)}%`} />
              ) : (
                <InvestmentMetric label="Active goals" value={dashboard.savings.activeGoalCount.toString()} />
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/20 p-6 flex flex-col items-center justify-center text-center bg-black/20">
              <PiggyBank className="text-white/30 mb-3" size={32} />
              <h3 className="text-white font-bold font-display">No active savings goals</h3>
              <p className="text-white/50 text-sm mt-1 mb-4 max-w-sm">Create a goal to start tracking progress for emergencies, travel, or big purchases.</p>
              <Link href="/savings" className="text-sm font-bold text-black bg-chart-2 px-4 py-2 rounded-xl hover:bg-chart-2/90 transition-colors shadow-[0_0_15px_rgba(46,204,113,0.4)]">Create your first goal</Link>
            </div>
          )}
        </div>
      )}

      {/* Investment snapshot intentionally stays separate from household cash
          flow. Deposits/withdrawals are included in Budget vs Actual below;
          trades and dividends are never counted as a second expense. */}
      <div className="glass-panel rounded-2xl border border-primary/20 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Investments</p>
            <h2 className="font-display text-xl font-bold text-white mt-1">Portfolio progress</h2>
          </div>
          <a href="/investments" className="text-sm font-semibold text-primary hover:text-white transition-colors">Open Investments →</a>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <InvestmentMetric label="Portfolio value" value={formatCurrency(dashboard.investment.portfolioValue)} />
          <InvestmentMetric label="Monthly plan" value={formatCurrency(dashboard.investment.monthlyContribution)} />
          <InvestmentMetric label="Gain / loss" value={formatCurrency(dashboard.investment.investmentGrowth)} positive={dashboard.investment.investmentGrowth >= 0} />
          <InvestmentMetric label="$25K goal" value={`${dashboard.investment.goalProgress.toFixed(1)}%`} />
        </div>
      </div>

      {/* Action Needed Alerts */}
      {(dashboard.reviewCount > 0 || dashboard.pendingCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400 fill-mode-both">
          {dashboard.reviewCount > 0 && (
            <div className="glass-panel border-chart-5/30 rounded-2xl p-5 flex items-start gap-4 relative overflow-hidden group">
              <div className="absolute inset-0 bg-chart-5/5 opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="h-12 w-12 rounded-xl bg-chart-5/20 flex items-center justify-center text-chart-5 shadow-[0_0_15px_rgba(255,200,0,0.2)] flex-shrink-0 relative z-10">
                <FileSearch size={24} />
              </div>
              <div className="relative z-10">
                <h4 className="font-display font-bold text-white text-lg">Needs Review</h4>
                <p className="text-sm text-white/70 mt-1">
                  You have <span className="font-mono text-chart-5 font-bold">{dashboard.reviewCount}</span> transactions that need categorization.
                </p>
              </div>
            </div>
          )}
          {dashboard.pendingCount > 0 && (
            <div className="glass-panel border-primary/30 rounded-2xl p-5 flex items-start gap-4 relative overflow-hidden group">
              <div className="absolute inset-0 bg-primary/5 opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(28,216,210,0.2)] flex-shrink-0 relative z-10">
                <AlertCircle size={24} />
              </div>
              <div className="relative z-10">
                <h4 className="font-display font-bold text-white text-lg">Pending Transactions</h4>
                <p className="text-sm text-white/70 mt-1">
                  <span className="font-mono text-primary font-bold">{dashboard.pendingCount}</span> transactions are waiting to post.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category Breakdown */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500 fill-mode-both">
        <Card className="border-t-4 border-t-secondary/50">
          <CardHeader>
            <CardTitle>Budget vs Actual</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-white/50 uppercase tracking-wider bg-white/5 border-b border-white/10 font-display">
                  <tr>
                    <th className="px-6 py-4 font-bold">Category</th>
                    <th className="px-6 py-4 font-bold text-right">Planned</th>
                    <th className="px-6 py-4 font-bold text-right">Actual</th>
                    <th className="px-6 py-4 font-bold text-right">Remaining</th>
                    <th className="px-6 py-4 font-bold w-1/4 hidden sm:table-cell">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dashboard.byCategory.map((cat, i) => {
                    const percentUsed = cat.planned > 0 ? Math.min(100, Math.max(0, (Math.abs(cat.actual) / cat.planned) * 100)) : 0;
                    const isOver = Math.abs(cat.actual) > cat.planned;
                    
                    return (
                      <tr key={i} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4 font-bold text-white group-hover:text-primary transition-colors">{cat.category}</td>
                        <td className="px-6 py-4 text-right font-mono text-white/50">{formatCurrency(cat.planned)}</td>
                        <td className="px-6 py-4 text-right font-mono text-white/90">{formatCurrency(Math.abs(cat.actual))}</td>
                        <td className={`px-6 py-4 text-right font-mono font-bold ${isOver ? 'text-destructive drop-shadow-[0_0_8px_rgba(255,50,50,0.5)]' : 'text-chart-4'}`}>
                          {formatCurrency(cat.remaining)}
                        </td>
                        <td className="px-6 py-4 hidden sm:table-cell">
                          <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                            <div 
                              className={`h-full transition-all duration-1000 ease-out ${isOver ? 'bg-destructive shadow-[0_0_10px_rgba(255,50,50,0.8)]' : 'bg-gradient-to-r from-primary to-accent shadow-[0_0_10px_rgba(28,216,210,0.5)]'}`} 
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {dashboard.byCategory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-white/40 italic font-display">
                        No plan data available for this cycle.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvestmentMetric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-xl bg-black/20 border border-white/5 p-4">
      <p className="text-xs text-white/45">{label}</p>
      <p className={`mt-2 font-mono font-bold ${positive === undefined ? "text-white" : positive ? "text-chart-4" : "text-destructive"}`}>{value}</p>
    </div>
  );
}

function StatCard({ title, value, subValue, icon: Icon, trend, color, delay }: { title: string, value: string, subValue: string, icon: any, trend: "good" | "bad" | "neutral", color: string, delay: string }) {
  
  const colorMap: Record<string, { text: string, bg: string, shadow: string, border: string }> = {
    "primary": { text: "text-primary", bg: "bg-primary/20", shadow: "shadow-[0_0_15px_rgba(28,216,210,0.3)]", border: "border-primary/30" },
    "secondary": { text: "text-secondary", bg: "bg-secondary/20", shadow: "shadow-[0_0_15px_rgba(255,0,127,0.3)]", border: "border-secondary/30" },
    "destructive": { text: "text-destructive", bg: "bg-destructive/20", shadow: "shadow-[0_0_15px_rgba(255,50,50,0.3)]", border: "border-destructive/30" },
    "chart-4": { text: "text-chart-4", bg: "bg-chart-4/20", shadow: "shadow-[0_0_15px_rgba(0,255,100,0.3)]", border: "border-chart-4/30" }
  };

  const style = colorMap[color] || colorMap.primary;

  return (
    <Card className={`relative overflow-hidden group border-t-2 ${style.border} animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both`} style={{ animationDelay: `${delay}ms` }}>
      {/* Decorative gradient orb */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[40px] pointer-events-none transition-all duration-700 opacity-20 group-hover:opacity-40 group-hover:scale-150 ${style.bg.split('/')[0]}`} />
      
      <CardContent className="p-5 sm:p-6 flex flex-col justify-between h-full relative z-10">
        <div className="flex justify-between items-start mb-4 sm:mb-6">
          <h3 className="text-sm font-bold text-white/60 font-display uppercase tracking-wider">{title}</h3>
          <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 ${style.bg} ${style.text} ${style.shadow} border border-white/10`}>
            <Icon size={20} className="sm:hidden" />
            <Icon size={24} className="hidden sm:block" />
          </div>
        </div>
        <div>
          <p className="text-2xl sm:text-3xl lg:text-2xl xl:text-3xl font-bold text-white mb-1 font-mono tracking-tight text-glow">{value}</p>
          <p className="text-xs sm:text-sm font-medium text-white/50">{subValue}</p>
        </div>
      </CardContent>
    </Card>
  );
}