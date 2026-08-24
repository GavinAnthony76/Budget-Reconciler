import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSavingsOverview, getGetSavingsOverviewQueryKey,
  useCreateSavingsGoal, useUpdateSavingsGoal, useDeleteSavingsGoal,
  useGetSavingsGoal, getGetSavingsGoalQueryKey,
  useListSavingsContributions, getListSavingsContributionsQueryKey,
  useCreateSavingsContribution, useUpdateSavingsContribution, useDeleteSavingsContribution,
  SavingsGoal, SavingsTrajectoryPoint
} from "@workspace/api-client-react";
import { PageHeader, Skeleton, Card, CardContent, Button, Input, Label, Select, Badge, EmptyState, formatCurrency } from "@/components/ui/core";
import { PiggyBank, Plus, Edit2, TrendingUp, X, Activity, Wallet, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Helper UI Components
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function dateInputValue(value: unknown, fallback = new Date().toISOString().slice(0, 10)): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return fallback;
}

function durationTargetDate(startDate: string, durationMonths: string): string {
  const [year, month, day] = dateInputValue(startDate).split("-").map(Number);
  const months = Math.max(1, Number(durationMonths) || 1);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Ahead': return 'text-chart-2 drop-shadow-[0_0_8px_rgba(46,204,113,0.5)]';
    case 'On track': return 'text-primary';
    case 'Slightly behind': return 'text-accent';
    case 'Behind': return 'text-destructive';
    case 'Overdue': return 'text-destructive drop-shadow-[0_0_8px_rgba(255,50,50,0.8)]';
    case 'Completed': return 'text-chart-4 drop-shadow-[0_0_8px_rgba(0,255,100,0.5)]';
    default: return 'text-white/50';
  }
}

function StatusText({ status }: { status: string }) {
  return <span className={`font-bold uppercase tracking-wider text-[10px] ${getStatusColor(status)}`}>{status.replace(/_/g, ' ')}</span>;
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90dvh] overflow-y-auto glass-panel rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/20 animate-in zoom-in-95 duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-display font-bold text-white tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-colors border border-white/10">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TrajectoryChart({ trajectory }: { trajectory: SavingsTrajectoryPoint[] }) {
  if (!trajectory || trajectory.length === 0) return null;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trajectory} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fff" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#fff" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
          <XAxis 
            dataKey="date" 
            stroke="hsl(var(--muted-foreground))" 
            fontSize={11} 
            tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })} 
            tickMargin={10}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))" 
            fontSize={11} 
            tickFormatter={(val) => `$${(val/1000).toFixed(1)}k`} 
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', color: '#fff' }}
            itemStyle={{ color: '#fff', fontSize: '13px' }}
            labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '12px', marginBottom: '4px' }}
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          />
          <Area type="monotone" dataKey="expected" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" fillOpacity={1} fill="url(#colorExpected)" name="Expected" />
          <Area type="monotone" dataKey="actual" stroke="hsl(var(--chart-2))" strokeWidth={2} fillOpacity={1} fill="url(#colorActual)" name="Actual" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, delay }: any) {
  const styles: any = {
    primary: "text-primary bg-primary/20 shadow-[0_0_15px_rgba(28,216,210,0.3)] border-primary/30",
    "chart-2": "text-chart-2 bg-chart-2/20 shadow-[0_0_15px_rgba(46,204,113,0.3)] border-chart-2/30",
    accent: "text-accent bg-accent/20 shadow-[0_0_15px_rgba(241,196,15,0.3)] border-accent/30",
    "chart-4": "text-chart-4 bg-chart-4/20 shadow-[0_0_15px_rgba(0,255,100,0.3)] border-chart-4/30",
    destructive: "text-destructive bg-destructive/20 shadow-[0_0_15px_rgba(255,50,50,0.3)] border-destructive/30"
  };
  const s = styles[color] || styles.primary;
  
  return (
    <Card className={`border-t-2 ${s.split(' ')[0]} animate-in fade-in slide-in-from-bottom-4 fill-mode-both`} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5 flex flex-col justify-between h-full relative z-10">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xs font-bold text-white/50 font-display uppercase tracking-wider">{title}</h3>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${s}`}>
            <Icon size={20} />
          </div>
        </div>
        <p className="text-2xl font-bold text-white font-mono tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function GoalCard({ goal, onClick }: { goal: SavingsGoal, onClick: () => void }) {
  const isCompleted = goal.status === 'completed';
  const isPaused = goal.status === 'paused';
  const progressPercent = Math.min(100, goal.percentComplete);
  const timePercent = Math.min(100, goal.timeProgressPercent);
  
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chart-2/80"
      aria-label={`Open savings goal ${goal.name}`}
    >
      <Card className="cursor-pointer hover:border-chart-2/40 hover:shadow-[0_0_25px_rgba(46,204,113,0.15)] transition-all duration-300 group">
      <CardContent className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex gap-2 items-center mb-1">
              <h3 className="font-display text-lg font-bold text-white group-hover:text-chart-2 transition-colors">{goal.name}</h3>
              {isCompleted && <Badge variant="success">Done</Badge>}
              {isPaused && <Badge variant="outline">Paused</Badge>}
            </div>
            <p className="text-xs text-white/50 font-medium tracking-wide uppercase">
              Target: {new Date(goal.targetDate).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-bold text-white">{formatCurrency(goal.currentBalance)}</p>
            <p className="text-xs text-white/50">of {formatCurrency(goal.targetAmount)}</p>
          </div>
        </div>
        
        <div className="mb-2 h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] relative">
          <div className="absolute top-0 bottom-0 w-[2px] bg-white/40 z-10 shadow-[0_0_5px_rgba(255,255,255,0.8)]" style={{ left: `${timePercent}%` }} />
          <div 
            className={`h-full transition-all duration-1000 ease-out ${
              progressPercent >= timePercent ? 'bg-gradient-to-r from-chart-2/50 to-chart-2 shadow-[0_0_10px_rgba(46,204,113,0.6)]' : 'bg-gradient-to-r from-accent/50 to-accent shadow-[0_0_10px_rgba(241,196,15,0.6)]'
            }`} 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        
        <div className="flex justify-between items-center text-xs">
          <p className="text-white/60">
            <span className="text-white font-bold">{goal.percentComplete.toFixed(0)}%</span> funded
          </p>
          <StatusText status={goal.trajectoryStatus} />
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

function DetailStat({ label, value, colorClass = "text-white" }: { label: string, value: string, colorClass?: string }) {
  return (
    <div className="p-4 bg-black/20 rounded-2xl border border-white/5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]">
      <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">{label}</p>
      <p className={`font-mono text-lg font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function GoalDetailModal({ goal, contributions, onClose, onEdit, onAddContribution, onEditContribution, onDeleteContribution }: any) {
  return (
    <Modal isOpen={true} onClose={onClose} title={goal.name}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <DetailStat label="Balance" value={formatCurrency(goal.currentBalance)} />
          <DetailStat label="Target" value={formatCurrency(goal.targetAmount)} />
          <DetailStat label="Remaining" value={formatCurrency(goal.remainingAmount)} />
          <DetailStat label="Status" value={goal.trajectoryStatus.replace(/_/g, ' ')} colorClass={getStatusColor(goal.trajectoryStatus)} />
        </div>
        
        {goal.recommendation && (
          <div className="glass-panel border-white/10 rounded-2xl p-5 bg-gradient-to-r from-chart-2/10 to-transparent border-l-4 border-l-chart-2 shadow-lg">
            <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2 tracking-wide font-display">
              <TrendingUp size={18} className="text-chart-2" />
              Recommendation
            </h4>
            <p className="text-sm text-white/80 leading-relaxed">{goal.recommendation}</p>
          </div>
        )}

        {goal.trajectory && goal.trajectory.length > 0 && (
          <div className="mt-6">
            <h4 className="font-display text-lg font-bold text-white mb-4">Projection</h4>
            <TrajectoryChart trajectory={goal.trajectory} />
          </div>
        )}
        
        <div className="flex flex-wrap gap-3 pt-6 border-t border-white/10 mt-8">
          <Button onClick={onAddContribution} className="bg-chart-2 text-black hover:bg-chart-2/90 border-transparent shadow-[0_0_15px_rgba(46,204,113,0.3)]">
            <Plus size={16} className="mr-2"/> Add Funds
          </Button>
          <Button variant="outline" onClick={onEdit}>
            <Edit2 size={16} className="mr-2"/> Edit Goal
          </Button>
        </div>

        <div className="mt-10">
          <h3 className="font-display font-bold text-xl text-white mb-4">Contribution History</h3>
          {contributions && contributions.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {contributions.map((c: any) => (
                <div key={c.id} className="flex justify-between items-center p-4 rounded-xl border border-white/5 bg-black/20 hover:bg-white/5 transition-colors">
                  <div>
                    <p className="text-sm font-bold text-white">{new Date(c.contributionDate).toLocaleDateString()}</p>
                    <p className="text-xs text-white/50 capitalize">{c.entryType.replace(/_/g, ' ')} {c.note && `· ${c.note}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`font-mono font-bold text-lg ${c.amount >= 0 ? 'text-chart-2' : 'text-white'}`}>
                      {c.amount > 0 ? '+' : ''}{formatCurrency(c.amount)}
                    </p>
                    <button type="button" onClick={() => onEditContribution(c)} aria-label={`Edit contribution from ${c.contributionDate}`} className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white"><Edit2 size={14} /></button>
                    <button type="button" onClick={() => onDeleteContribution(c)} aria-label={`Delete contribution from ${c.contributionDate}`} className="rounded-lg p-2 text-white/40 hover:bg-destructive/15 hover:text-destructive"><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center border border-dashed border-white/10 rounded-2xl bg-black/20">
              <p className="text-sm text-white/40 italic">No contributions yet.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function GoalForm({ initial, onSave, onCancel, onDelete }: { initial?: SavingsGoal | null, onSave: (data: any) => void, onCancel: () => void, onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [targetAmount, setTargetAmount] = useState(initial ? String(initial.targetAmount) : "");
  const [startingBalance, setStartingBalance] = useState(initial ? String(initial.startingBalance) : "0");
  const [monthlyPlannedContribution, setMonthly] = useState(initial?.monthlyPlannedContribution ? String(initial.monthlyPlannedContribution) : "");
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(dateInputValue(initial?.startDate, today));
  const [targetDate, setTargetDate] = useState(dateInputValue(initial?.targetDate, nextYear));
  const [deadlineMode, setDeadlineMode] = useState<"date" | "duration">("date");
  const [durationMonths, setDurationMonths] = useState("12");
  const [priority, setPriority] = useState<string>(initial?.priority || "Medium");
  const [status, setStatus] = useState<string>(initial?.status || "active");
  const [notes, setNotes] = useState(initial?.notes || "");
  const computedTargetDate = () => {
    if (deadlineMode === "date") return targetDate;
    return durationTargetDate(startDate, durationMonths);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = {
      name,
      targetAmount: Number(targetAmount),
      startingBalance: Number(startingBalance),
      monthlyPlannedContribution: monthlyPlannedContribution ? Number(monthlyPlannedContribution) : null,
      startDate,
      targetDate: computedTargetDate(),
      priority,
      notes: notes || null
    };
    if (initial) {
      data.status = status;
    }
    onSave(data);
  };

  return (
    <Modal isOpen={true} onClose={onCancel} title={initial ? "Edit Goal" : "New Savings Goal"}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Goal Name">
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Emergency Fund" />
          </Field>
          <Field label="Target Amount">
            <Input type="number" min="0.01" step="0.01" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} required placeholder="10000.00" />
          </Field>
          <Field label="Starting Balance">
            <Input type="number" min="0" step="0.01" value={startingBalance} onChange={e => setStartingBalance(e.target.value)} required />
          </Field>
          <Field label="Monthly Planned Contribution">
            <Input type="number" min="0" step="0.01" value={monthlyPlannedContribution} onChange={e => setMonthly(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Start Date">
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Deadline Method">
            <Select value={deadlineMode} onChange={(value) => setDeadlineMode(value === "duration" ? "duration" : "date")} options={[{value:"date",label:"Choose target date"}, {value:"duration",label:"Set duration"}]} />
          </Field>
          {deadlineMode === "date" ? (
            <Field label="Target Date">
              <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} required />
            </Field>
          ) : (
            <Field label="Goal Duration (months)">
              <Input type="number" min="1" step="1" value={durationMonths} onChange={e => setDurationMonths(e.target.value)} required />
              <p className="text-xs text-white/45">Target date: {new Date(`${computedTargetDate()}T00:00:00`).toLocaleDateString()}</p>
            </Field>
          )}
          <Field label="Priority">
            <Select value={priority} onChange={setPriority} options={[{value:"High",label:"High"}, {value:"Medium",label:"Medium"}, {value:"Low",label:"Low"}]} />
          </Field>
          {initial && (
            <Field label="Status">
              <Select value={status} onChange={setStatus} options={[{value:"active",label:"Active"}, {value:"paused",label:"Paused"}, {value:"completed",label:"Completed"}, {value:"archived",label:"Archived"}]} />
            </Field>
          )}
        </div>
        <Field label="Notes">
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional context or links" />
        </Field>
        
        <div className="flex justify-between items-center pt-6 border-t border-white/10 mt-8">
          {initial && onDelete ? (
            <Button type="button" variant="destructive" onClick={() => { if(confirm("Are you sure you want to delete this goal and all its contributions?")) onDelete(); }}>Delete Goal</Button>
          ) : <div/>}
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="primary">Save Goal</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ContributionForm({ initial, onSave, onCancel, onDelete }: { initial?: any, onSave: (data: any) => void, onCancel: () => void, onDelete?: () => void }) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [contributionDate, setDate] = useState(dateInputValue(initial?.contributionDate));
  const [entryType, setEntryType] = useState(initial?.entryType || "contribution");
  const [note, setNote] = useState(initial?.note || "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      amount: Number(amount),
      contributionDate,
      entryType,
      note: note || null
    });
  };

  return (
    <Modal isOpen={true} onClose={onCancel} title={initial ? "Edit Activity" : "Record Activity"}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Amount">
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required autoFocus placeholder="e.g. 500.00 (use negative for withdrawals)" />
          </Field>
          <Field label="Date">
            <Input type="date" value={contributionDate} onChange={e => setDate(e.target.value)} required />
          </Field>
          <Field label="Type">
            <Select value={entryType} onChange={setEntryType} options={[{value:"contribution",label:"Contribution"}, {value:"adjustment",label:"Adjustment"}]} />
          </Field>
        </div>
        <Field label="Note">
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional details" />
        </Field>
        <div className="flex justify-between gap-3 pt-6 border-t border-white/10 mt-8">
          {initial && onDelete ? <Button type="button" variant="destructive" onClick={() => { if (confirm("Delete this savings record?")) onDelete(); }}>Delete</Button> : <div />}
          <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary">Save Record</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Savings() {
  const { data, isLoading } = useGetSavingsOverview();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [isContribFormOpen, setIsContribFormOpen] = useState(false);
  const [editingContribution, setEditingContribution] = useState<any | null>(null);
  const selectedGoalId = selectedGoal?.id ?? -1;
  const { data: selectedGoalDetail } = useGetSavingsGoal(selectedGoalId, {
    query: { enabled: selectedGoalId > 0, queryKey: getGetSavingsGoalQueryKey(selectedGoalId) },
  });
  const { data: selectedContributions } = useListSavingsContributions(selectedGoalId, {
    query: { enabled: selectedGoalId > 0, queryKey: getListSavingsContributionsQueryKey(selectedGoalId) },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetSavingsOverviewQueryKey() });

  const createGoal = useCreateSavingsGoal({
    mutation: {
      onSuccess: () => { refresh(); setIsGoalFormOpen(false); toast({title: "Goal created"}); },
      onError: (err: any) => toast({title: "Could not create goal", description: err.message, variant: "destructive"})
    }
  });

  const updateGoal = useUpdateSavingsGoal({
    mutation: {
      onSuccess: (updated) => { 
        queryClient.setQueryData(getGetSavingsGoalQueryKey(updated.id), updated);
        setSelectedGoal(updated);
        refresh(); 
        setEditingGoal(null);
        toast({title: "Goal updated"}); 
      },
      onError: (err: any) => toast({title: "Could not update goal", description: err.message, variant: "destructive"})
    }
  });

  const deleteGoal = useDeleteSavingsGoal({
    mutation: {
      onSuccess: () => { refresh(); setEditingGoal(null); setSelectedGoal(null); toast({title: "Goal deleted"}); },
      onError: (err: any) => toast({title: "Could not delete goal", description: err.message, variant: "destructive"})
    }
  });

  const createContrib = useCreateSavingsContribution({
    mutation: {
      onSuccess: () => { 
        refresh(); 
        queryClient.invalidateQueries({ queryKey: getGetSavingsGoalQueryKey(selectedGoalId) });
        queryClient.invalidateQueries({ queryKey: getListSavingsContributionsQueryKey(selectedGoalId) });
        setIsContribFormOpen(false); 
        toast({title: "Record saved"}); 
      },
      onError: (err: any) => toast({title: "Could not save record", description: err.message, variant: "destructive"})
    }
  });
  const updateContrib = useUpdateSavingsContribution({
    mutation: {
      onSuccess: () => {
        refresh();
        queryClient.invalidateQueries({ queryKey: getGetSavingsGoalQueryKey(selectedGoalId) });
        queryClient.invalidateQueries({ queryKey: getListSavingsContributionsQueryKey(selectedGoalId) });
        setEditingContribution(null);
        toast({ title: "Record updated" });
      },
      onError: (err: any) => toast({ title: "Could not update record", description: err.message, variant: "destructive" }),
    },
  });
  const deleteContrib = useDeleteSavingsContribution({
    mutation: {
      onSuccess: () => {
        refresh();
        queryClient.invalidateQueries({ queryKey: getGetSavingsGoalQueryKey(selectedGoalId) });
        queryClient.invalidateQueries({ queryKey: getListSavingsContributionsQueryKey(selectedGoalId) });
        setEditingContribution(null);
        toast({ title: "Record deleted" });
      },
      onError: (err: any) => toast({ title: "Could not delete record", description: err.message, variant: "destructive" }),
    },
  });

  // Keep selected goal data fresh after mutations
  const currentSelectedGoal = useMemo(() => {
    if (!selectedGoal || !data) return null;
    return selectedGoalDetail || data.goals.find(g => g.id === selectedGoal.id) || null;
  }, [data, selectedGoal, selectedGoalDetail]);

  if (isLoading || !data) {
    return (
      <div>
        <PageHeader title="Savings Goals" description="Plan, track, and achieve your financial targets" />
        <Skeleton className="h-[400px] w-full rounded-3xl" />
      </div>
    );
  }

  const activeGoals = data.goals.filter(g => g.status === 'active' || g.status === 'paused');
  const pastGoals = data.goals.filter(g => g.status === 'completed' || g.status === 'archived');

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
        <PageHeader title="Savings Goals" description="Plan, track, and achieve your financial targets" />
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 mb-10 sm:w-auto w-full">
          <Button onClick={() => setIsGoalFormOpen(true)} className="w-full sm:w-auto shadow-[0_0_20px_rgba(28,216,210,0.3)]">
            <Plus size={18} className="mr-2" /> New Goal
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title="Total Saved" value={formatCurrency(data.summary.totalCurrentBalance)} icon={Wallet} color="primary" delay="0" />
        <StatCard title="Combined Target" value={formatCurrency(data.summary.totalTargetAmount)} icon={PiggyBank} color="chart-2" delay="100" />
        <StatCard title="Monthly Need" value={formatCurrency(data.summary.combinedMonthlyNeed)} icon={Activity} color="accent" delay="200" />
        <StatCard title="Affordability" value={data.summary.affordabilityStatus.replace(/_/g, ' ')} icon={AlertCircle} color={data.summary.affordabilityStatus === 'Within budget' ? 'chart-4' : 'destructive'} delay="300" />
      </div>

      <div className="mt-12 pt-8 border-t border-white/10">
        <div className="flex items-center gap-4 mb-8">
          <h3 className="font-display text-2xl font-bold text-white tracking-tight">Active Goals</h3>
          <Badge variant="outline" className="bg-white/5">{activeGoals.length}</Badge>
        </div>
        
        {activeGoals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {activeGoals.map(goal => (
              <GoalCard key={goal.id} goal={goal} onClick={() => setSelectedGoal(goal)} />
            ))}
          </div>
        ) : (
          <EmptyState 
            title="No active goals" 
            description="Start building your safety net or saving for your next adventure." 
            icon={PiggyBank} 
            action={<Button onClick={() => setIsGoalFormOpen(true)}>Create your first goal</Button>} 
          />
        )}
      </div>

      {pastGoals.length > 0 && (
        <div className="mt-16 pt-8 border-t border-white/10">
          <h3 className="font-display text-xl font-bold text-white/70 mb-6">Completed & Archived</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 opacity-75 hover:opacity-100 transition-opacity">
            {pastGoals.map(goal => (
              <GoalCard key={goal.id} goal={goal} onClick={() => setSelectedGoal(goal)} />
            ))}
          </div>
        </div>
      )}

      {/* Forms & Modals */}
      {isGoalFormOpen && (
        <GoalForm 
          onSave={(input) => createGoal.mutate({ data: input })} 
          onCancel={() => setIsGoalFormOpen(false)} 
        />
      )}

      {editingGoal && (
        <GoalForm 
          initial={editingGoal}
          onSave={(input) => updateGoal.mutate({ id: editingGoal.id, data: input })} 
          onDelete={() => deleteGoal.mutate({ id: editingGoal.id })}
          onCancel={() => setEditingGoal(null)} 
        />
      )}

      {isContribFormOpen && currentSelectedGoal && (
        <ContributionForm 
          onSave={(input) => createContrib.mutate({ id: currentSelectedGoal.id, data: input })}
          onCancel={() => setIsContribFormOpen(false)}
        />
      )}

      {editingContribution && currentSelectedGoal && (
        <ContributionForm
          initial={editingContribution}
          onSave={(input) => updateContrib.mutate({ id: currentSelectedGoal.id, contributionId: editingContribution.id, data: input })}
          onDelete={() => deleteContrib.mutate({ id: currentSelectedGoal.id, contributionId: editingContribution.id })}
          onCancel={() => setEditingContribution(null)}
        />
      )}

      {currentSelectedGoal && !editingGoal && !isContribFormOpen && !editingContribution && (
        <GoalDetailModal 
          goal={currentSelectedGoal} 
          contributions={selectedContributions || currentSelectedGoal.contributions}
          onClose={() => setSelectedGoal(null)}
          onEdit={() => setEditingGoal(currentSelectedGoal)}
          onAddContribution={() => setIsContribFormOpen(true)}
          onEditContribution={(contribution: any) => setEditingContribution(contribution)}
          onDeleteContribution={(contribution: any) => {
            if (confirm("Delete this savings record?")) deleteContrib.mutate({ id: currentSelectedGoal.id, contributionId: contribution.id });
          }}
        />
      )}
    </div>
  );
}
