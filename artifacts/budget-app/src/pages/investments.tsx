import { useState } from "react";
import {
  getGetInvestmentOverviewQueryKey,
  useCreateInvestmentAccount,
  useCreateInvestmentGoal,
  useCreateInvestmentHolding,
  useCreateInvestmentTargetAllocation,
  useCreateInvestmentTransaction,
  useDeleteInvestmentAccount,
  useDeleteInvestmentGoal,
  useDeleteInvestmentHolding,
  useDeleteInvestmentTargetAllocation,
  useDeleteInvestmentTransaction,
  useGetInvestmentOverview,
  useSyncInvestmentContributionPlan,
  useUpdateInvestmentAccount,
  useUpdateInvestmentGoal,
  useUpdateInvestmentHolding,
  useUpdateInvestmentTargetAllocation,
  useUpdateInvestmentTransaction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Edit2, LineChart, Plus, Trash2, TrendingUp, Wallet } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  formatCurrency,
} from "@/components/ui/core";
import { useToast } from "@/hooks/use-toast";

type FormMode = "account" | "holding" | "transaction" | "goal" | "allocation" | null;

const transactionTypes = [
  { value: "deposit", label: "Deposit / contribution" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "dividend", label: "Dividend" },
  { value: "dividend_reinvestment", label: "Dividend reinvestment" },
  { value: "fee", label: "Fee" },
];

export default function Investments() {
  const { data, isLoading } = useGetInvestmentOverview();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormMode>(null);
  const [editing, setEditing] = useState<{ type: Exclude<FormMode, null>; item: any } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetInvestmentOverviewQueryKey() });
  const finishForm = () => {
    refresh();
    setForm(null);
    setEditing(null);
    toast({ title: "Investments updated", description: "Your portfolio workspace has been refreshed." });
  };
  const deleteOptions = {
    mutation: {
      onSuccess: refresh,
      onError: (error: any) => toast({ title: "Could not remove item", description: error?.message || "Please try again.", variant: "destructive" }),
    },
  };
  const deleteAccount = useDeleteInvestmentAccount(deleteOptions);
  const deleteHolding = useDeleteInvestmentHolding(deleteOptions);
  const deleteTransaction = useDeleteInvestmentTransaction(deleteOptions);
  const deleteGoal = useDeleteInvestmentGoal(deleteOptions);
  const deleteAllocation = useDeleteInvestmentTargetAllocation(deleteOptions);
  const syncPlan = useSyncInvestmentContributionPlan({
    mutation: {
      onSuccess: () => {
        refresh();
        toast({
          title: "Budget plan synced",
          description: `Added ${formatCurrency(data?.summary.monthlyContribution ?? 0)} to the current and next budget cycles.`,
        });
      },
      onError: (error: any) =>
        toast({
          title: "Could not sync budget plan",
          description: error?.message || "Please try again.",
          variant: "destructive",
        }),
    },
  });

  if (isLoading || !data) {
    return <div><PageHeader title="Investments" description="Building your manual portfolio workspace" /><Skeleton className="h-[700px] w-full rounded-2xl" /></div>;
  }

  const openEdit = (type: Exclude<FormMode, null>, item: any) => {
    setForm(null);
    setEditing({ type, item });
  };
  const remove = (label: string, mutation: any, id: number) => {
    if (confirm(`Delete this ${label}? This cannot be undone.`)) mutation.mutate({ id });
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <PageHeader title="Investments" description="Manual portfolio tracking, goals, and monthly contribution planning" />
        <div className="flex flex-wrap gap-2 mb-8">
          <Button variant="secondary" onClick={() => syncPlan.mutate()} disabled={syncPlan.isPending} data-testid="button-sync-investment-plan"><LineChart size={16} className="mr-2" /> Sync plan to budget</Button>
          <Button onClick={() => { setEditing(null); setForm("transaction"); }} data-testid="button-add-investment-transaction"><Plus size={16} className="mr-2" /> Record activity</Button>
          <Button variant="outline" onClick={() => { setEditing(null); setForm("holding"); }}><Plus size={16} className="mr-2" /> Add holding</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Portfolio value" value={formatCurrency(data.summary.portfolioValue)} icon={Wallet} tone="primary" />
        <MetricCard title="Monthly plan" value={formatCurrency(data.summary.monthlyContribution)} icon={TrendingUp} tone="secondary" />
        <MetricCard title="Net contributions" value={formatCurrency(data.summary.netContributions)} icon={LineChart} tone="chart-4" />
        <MetricCard title="$25K goal progress" value={`${data.summary.goalProgress.toFixed(1)}%`} icon={TrendingUp} tone="primary" />
      </div>

      {(form || editing) && (
        <Card className="border-t-4 border-t-primary">
          <CardHeader><CardTitle>{editing ? `Edit ${editing.type}` : `Add ${form}`}</CardTitle></CardHeader>
          <CardContent>
            {editing?.type === "account" || form === "account" ? <AccountForm initial={editing?.item} onDone={finishForm} /> : null}
            {editing?.type === "holding" || form === "holding" ? <HoldingForm initial={editing?.item} accounts={data.accounts} onDone={finishForm} /> : null}
            {editing?.type === "transaction" || form === "transaction" ? <TransactionForm initial={editing?.item} accounts={data.accounts} holdings={data.holdings} onDone={finishForm} /> : null}
            {editing?.type === "goal" || form === "goal" ? <GoalForm initial={editing?.item} accounts={data.accounts} onDone={finishForm} /> : null}
            {editing?.type === "allocation" || form === "allocation" ? <AllocationForm initial={editing?.item} accounts={data.accounts} onDone={finishForm} /> : null}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 border-t-4 border-t-secondary/50">
          <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Investment goals</CardTitle><Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm("goal"); }}><Plus size={14} className="mr-1" /> Add goal</Button></div></CardHeader>
          <CardContent className="space-y-4">
            {data.goals.map((goal) => (
              <div key={goal.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-display text-lg font-bold text-white">{goal.name}</h3><p className="text-sm text-white/55">Target date: {goal.targetDate}</p></div>
                  <RowActions onEdit={() => openEdit("goal", goal)} onDelete={() => remove("goal", deleteGoal, goal.id)} />
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/40"><div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.min(100, goal.percentComplete)}%` }} /></div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <DataPoint label="Current value" value={formatCurrency(goal.currentPortfolioValue)} />
                  <DataPoint label="Contributions" value={formatCurrency(goal.contributionsToDate)} />
                  <DataPoint label="Growth" value={formatCurrency(goal.investmentGrowth)} />
                  <DataPoint label="Remaining" value={formatCurrency(goal.remainingAmount)} />
                </div>
                <p className="mt-4 text-xs text-white/55">This cycle: {formatCurrency(goal.monthlyPlannedContribution)} planned · {goal.monthlyContributionProgress.toFixed(0)}% contributed</p>
              </div>
            ))}
            {data.goals.length === 0 && <EmptyState icon={TrendingUp} title="No investment goal yet" description="Add a target to see contribution progress separately from investment growth." action={<Button onClick={() => setForm("goal")}>Create goal</Button>} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Accounts</CardTitle><Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm("account"); }}><Plus size={14} className="mr-1" /> Add</Button></div></CardHeader>
          <CardContent className="space-y-3">
            {data.accounts.map((account) => (
              <div key={account.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex justify-between gap-2"><div><p className="font-bold text-white">{account.name}</p><p className="text-xs text-white/50">{account.institution} · {account.accountType}</p></div><RowActions onEdit={() => openEdit("account", account)} onDelete={() => remove("account and its investment history", deleteAccount, account.id)} /></div>
                <p className="mt-3 font-mono text-primary font-bold">{formatCurrency(account.cashBalance)} cash</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-t-4 border-t-primary/40">
        <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Monthly allocation plan</CardTitle><p className="mt-1 text-xs text-white/50">After changing allocations, use “Sync plan to budget” to update the current and next budget cycles.</p></div><Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm("allocation"); }}><Plus size={14} className="mr-1" /> Add allocation</Button></div></CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Security</Th><Th>Monthly amount</Th><Th>Allocation</Th><Th /></tr></thead>
            <tbody>{data.allocations.map((allocation) => <tr key={allocation.id}><Td><span className="font-bold text-white">{allocation.ticker}</span><span className="block text-xs text-white/45">{allocation.securityName}</span></Td><Td>{formatCurrency(allocation.monthlyAmount)}</Td><Td>{data.summary.monthlyContribution === 0 ? "0%" : `${((allocation.monthlyAmount / data.summary.monthlyContribution) * 100).toFixed(0)}%`}</Td><Td><RowActions onEdit={() => openEdit("allocation", allocation)} onDelete={() => remove("allocation", deleteAllocation, allocation.id)} /></Td></tr>)}</tbody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-t-4 border-t-accent/40">
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Holdings</CardTitle><Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm("holding"); }}><Plus size={14} className="mr-1" /> Add holding</Button></div></CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Security</Th><Th>Shares</Th><Th>Cost basis</Th><Th>Current value</Th><Th>Gain / loss</Th><Th>Allocation</Th><Th /></tr></thead>
            <tbody>{data.holdings.map((holding) => <tr key={holding.id}><Td><span className="font-bold text-white">{holding.ticker}</span><span className="block text-xs text-white/45">{holding.securityName}</span></Td><Td>{holding.shares.toLocaleString()}</Td><Td>{formatCurrency(holding.costBasis)}</Td><Td>{formatCurrency(holding.currentMarketValue)}</Td><Td><span className={holding.unrealizedGainLoss >= 0 ? "text-chart-4" : "text-destructive"}>{formatCurrency(holding.unrealizedGainLoss)} <span className="text-xs">({holding.unrealizedGainLossPercent.toFixed(1)}%)</span></span></Td><Td>{holding.portfolioAllocationPercent.toFixed(1)}%</Td><Td><RowActions onEdit={() => openEdit("holding", holding)} onDelete={() => remove("holding", deleteHolding, holding.id)} /></Td></tr>)}</tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Contribution & activity history</CardTitle><Button size="sm" onClick={() => { setEditing(null); setForm("transaction"); }}><Plus size={14} className="mr-1" /> Record activity</Button></div></CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Date</Th><Th>Activity</Th><Th>Security</Th><Th>Amount</Th><Th>Notes</Th><Th /></tr></thead>
            <tbody>{data.transactions.map((transaction) => <tr key={transaction.id}><Td>{transaction.date}</Td><Td><Badge variant={transaction.transactionType === "deposit" ? "default" : "outline"}>{transaction.transactionType.replace(/_/g, " ")}</Badge></Td><Td>{transaction.ticker || "Cash"}</Td><Td>{formatCurrency(transaction.amount)}</Td><Td>{transaction.notes || <span className="text-white/30">—</span>}</Td><Td><RowActions onEdit={() => openEdit("transaction", transaction)} onDelete={() => remove("activity", deleteTransaction, transaction.id)} /></Td></tr>)}</tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, tone }: any) {
  const tones: any = { primary: "border-primary/30 text-primary bg-primary/15", secondary: "border-secondary/30 text-secondary bg-secondary/15", "chart-4": "border-chart-4/30 text-chart-4 bg-chart-4/15" };
  return <Card className={`border-t-2 ${tones[tone].split(" ").slice(0, 1).join(" ")}`}><CardContent className="p-5"><div className="flex justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-white/55">{title}</p><span className={`rounded-xl p-2 ${tones[tone]}`}><Icon size={18} /></span></div><p className="mt-4 font-mono text-2xl font-bold text-white">{value}</p></CardContent></Card>;
}
function DataPoint({ label, value }: { label: string; value: string }) { return <div><p className="text-white/45 text-xs">{label}</p><p className="font-mono font-bold text-white">{value}</p></div>; }
function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) { return <div className="flex justify-end gap-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}><Edit2 size={14} /></Button><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 size={14} /></Button></div>; }
function Table({ children }: { children: React.ReactNode }) { return <div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">{children}</table></div>; }
function Th({ children }: { children?: React.ReactNode }) { return <th className="bg-white/5 px-5 py-3 text-left text-xs uppercase tracking-wider text-white/45">{children}</th>; }
function Td({ children }: { children?: React.ReactNode }) { return <td className="border-t border-white/5 px-5 py-4 text-white/75">{children}</td>; }

function FormActions({ onCancel, pending }: { onCancel: () => void; pending: boolean }) { return <div className="flex justify-end gap-3 pt-3 border-t border-white/10"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending}>Save</Button></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function AccountForm({ initial, onDone }: any) {
  const [name, setName] = useState(initial?.name || "");
  const [institution, setInstitution] = useState(initial?.institution || "");
  const [accountType, setAccountType] = useState(initial?.accountType || "Taxable brokerage");
  const [cashBalance, setCashBalance] = useState(String(initial?.cashBalance ?? 0));
  const create = useCreateInvestmentAccount({ mutation: { onSuccess: onDone } });
  const update = useUpdateInvestmentAccount({ mutation: { onSuccess: onDone } });
  const submit = (event: React.FormEvent) => { event.preventDefault(); const data = { name, institution, accountType, cashBalance: Number(cashBalance) }; initial ? update.mutate({ id: initial.id, data }) : create.mutate({ data }); };
  return <form onSubmit={submit} className="space-y-5"><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><Field label="Account name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Institution"><Input value={institution} onChange={(e) => setInstitution(e.target.value)} required /></Field><Field label="Type"><Input value={accountType} onChange={(e) => setAccountType(e.target.value)} required /></Field><Field label="Cash balance"><Input type="number" step="0.01" value={cashBalance} onChange={(e) => setCashBalance(e.target.value)} required /></Field></div><FormActions pending={create.isPending || update.isPending} onCancel={onDone} /></form>;
}

function HoldingForm({ initial, accounts, onDone }: any) {
  const [accountId, setAccountId] = useState(String(initial?.accountId || accounts[0]?.id || ""));
  const [ticker, setTicker] = useState(initial?.ticker || "");
  const [securityName, setSecurityName] = useState(initial?.securityName || "");
  const [shares, setShares] = useState(String(initial?.shares ?? 0));
  const [averageCost, setAverageCost] = useState(String(initial?.averageCost ?? 0));
  const [currentPrice, setCurrentPrice] = useState(String(initial?.currentPrice ?? 0));
  const create = useCreateInvestmentHolding({ mutation: { onSuccess: onDone } });
  const update = useUpdateInvestmentHolding({ mutation: { onSuccess: onDone } });
  const submit = (event: React.FormEvent) => { event.preventDefault(); const data = { ticker, securityName, shares: Number(shares), averageCost: Number(averageCost), currentPrice: Number(currentPrice) }; initial ? update.mutate({ id: initial.id, data }) : create.mutate({ data: { ...data, accountId: Number(accountId) } }); };
  return <form onSubmit={submit} className="space-y-5"><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{!initial && <Field label="Account"><Select value={accountId} onChange={setAccountId} options={accounts.map((a: any) => ({ value: String(a.id), label: a.name }))} /></Field>}<Field label="Ticker"><Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} required /></Field><Field label="Security name"><Input value={securityName} onChange={(e) => setSecurityName(e.target.value)} required /></Field><Field label="Shares"><Input type="number" step="any" min="0" value={shares} onChange={(e) => setShares(e.target.value)} required /></Field><Field label="Average cost"><Input type="number" step="0.01" min="0" value={averageCost} onChange={(e) => setAverageCost(e.target.value)} required /></Field><Field label="Current price"><Input type="number" step="0.01" min="0" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} required /></Field></div><FormActions pending={create.isPending || update.isPending} onCancel={onDone} /></form>;
}

function TransactionForm({ initial, accounts, holdings, onDone }: any) {
  const [accountId, setAccountId] = useState(String(initial?.accountId || accounts[0]?.id || ""));
  const [securityId, setSecurityId] = useState(initial?.securityId ? String(initial.securityId) : "");
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const [transactionType, setTransactionType] = useState(initial?.transactionType || "deposit");
  const [amount, setAmount] = useState(String(initial?.amount ?? 0));
  const [shares, setShares] = useState(initial?.shares == null ? "" : String(initial.shares));
  const [price, setPrice] = useState(initial?.price == null ? "" : String(initial.price));
  const [notes, setNotes] = useState(initial?.notes || "");
  const create = useCreateInvestmentTransaction({ mutation: { onSuccess: onDone } });
  const update = useUpdateInvestmentTransaction({ mutation: { onSuccess: onDone } });
  const submit = (event: React.FormEvent) => { event.preventDefault(); const data: any = { accountId: Number(accountId), securityId: securityId ? Number(securityId) : null, date, transactionType, amount: Number(amount), shares: shares === "" ? null : Number(shares), price: price === "" ? null : Number(price), notes: notes || null }; initial ? update.mutate({ id: initial.id, data }) : create.mutate({ data }); };
  return <form onSubmit={submit} className="space-y-5"><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><Field label="Account"><Select value={accountId} onChange={setAccountId} options={accounts.map((a: any) => ({ value: String(a.id), label: a.name }))} /></Field><Field label="Activity"><Select value={transactionType} onChange={setTransactionType} options={transactionTypes} /></Field><Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field><Field label="Amount"><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field><Field label="Holding (optional)"><Select value={securityId} onChange={setSecurityId} placeholder="Cash activity" options={holdings.map((h: any) => ({ value: String(h.securityId), label: `${h.ticker} — ${h.securityName}` }))} /></Field><Field label="Shares (optional)"><Input type="number" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} /></Field><Field label="Price (optional)"><Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field><Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div><p className="text-xs text-white/50">A deposit or withdrawal creates its linked household transfer automatically. Do not record the same transfer again in Transactions. Trades, dividends, reinvestments, and fees remain investment activity.</p><FormActions pending={create.isPending || update.isPending} onCancel={onDone} /></form>;
}

function GoalForm({ initial, accounts, onDone }: any) {
  const [accountId, setAccountId] = useState(initial?.accountId ? String(initial.accountId) : "");
  const [name, setName] = useState(initial?.name || "");
  const [targetAmount, setTargetAmount] = useState(String(initial?.targetAmount ?? 25000));
  const [monthlyPlannedContribution, setMonthly] = useState(String(initial?.monthlyPlannedContribution ?? 300));
  const [targetDate, setTargetDate] = useState(initial?.targetDate || new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().slice(0, 10));
  const create = useCreateInvestmentGoal({ mutation: { onSuccess: onDone } });
  const update = useUpdateInvestmentGoal({ mutation: { onSuccess: onDone } });
  const submit = (event: React.FormEvent) => { event.preventDefault(); const data: any = { accountId: accountId ? Number(accountId) : null, name, targetAmount: Number(targetAmount), monthlyPlannedContribution: Number(monthlyPlannedContribution), targetDate }; initial ? update.mutate({ id: initial.id, data }) : create.mutate({ data }); };
  return <form onSubmit={submit} className="space-y-5"><div className="grid grid-cols-1 md:grid-cols-5 gap-4"><Field label="Goal name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Account"><Select value={accountId} onChange={setAccountId} placeholder="All accounts" options={accounts.map((a: any) => ({ value: String(a.id), label: a.name }))} /></Field><Field label="Target"><Input type="number" min="0" step="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} required /></Field><Field label="Monthly contribution"><Input type="number" min="0" step="0.01" value={monthlyPlannedContribution} onChange={(e) => setMonthly(e.target.value)} required /></Field><Field label="Target date"><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required /></Field></div><FormActions pending={create.isPending || update.isPending} onCancel={onDone} /></form>;
}

function AllocationForm({ initial, accounts, onDone }: any) {
  const [accountId, setAccountId] = useState(String(initial?.accountId || accounts[0]?.id || ""));
  const [ticker, setTicker] = useState(initial?.ticker || "");
  const [securityName, setSecurityName] = useState(initial?.securityName || "");
  const [monthlyAmount, setMonthlyAmount] = useState(String(initial?.monthlyAmount ?? 0));
  const create = useCreateInvestmentTargetAllocation({ mutation: { onSuccess: onDone } });
  const update = useUpdateInvestmentTargetAllocation({ mutation: { onSuccess: onDone } });
  const submit = (event: React.FormEvent) => { event.preventDefault(); const data: any = { monthlyAmount: Number(monthlyAmount) }; initial ? update.mutate({ id: initial.id, data }) : create.mutate({ data: { ...data, accountId: Number(accountId), ticker, securityName } }); };
  return <form onSubmit={submit} className="space-y-5"><div className="grid grid-cols-1 md:grid-cols-4 gap-4">{!initial && <Field label="Account"><Select value={accountId} onChange={setAccountId} options={accounts.map((a: any) => ({ value: String(a.id), label: a.name }))} /></Field>}{!initial && <Field label="Ticker"><Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} required /></Field>}{!initial && <Field label="Security name"><Input value={securityName} onChange={(e) => setSecurityName(e.target.value)} required /></Field>}<Field label="Monthly amount"><Input type="number" min="0" step="0.01" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} required /></Field></div><FormActions pending={create.isPending || update.isPending} onCancel={onDone} /></form>;
}