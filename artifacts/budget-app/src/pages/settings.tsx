import { useState } from "react";
import { 
  useGetSettings, 
  useUpdateSettings, 
  useListMonths, 
  useListIncomes,
  useCreateIncome,
  useUpdateIncome,
  useDeleteIncome,
  useListRules,
  useDeleteRule,
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  getGetSettingsQueryKey,
  getListIncomesQueryKey,
  getListRulesQueryKey,
  getListCategoriesQueryKey
} from "@workspace/api-client-react";
import { PageHeader, Skeleton, formatCurrency, Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Label, Badge } from "@/components/ui/core";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Save, Plus, Trash2, Edit2, X, Settings2, Wallet, Waypoints, Target } from "lucide-react";

export default function Settings() {
  const { data: settings, isLoading: loadingSettings } = useGetSettings();
  
  if (loadingSettings || !settings) {
    return <div className="p-8"><Skeleton className="h-[800px] w-full rounded-2xl" /></div>;
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20 relative z-10">
      <PageHeader title="Settings" description="System configuration and global rules" />
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 delay-200 fill-mode-both">
          <GeneralSettingsForm initialData={settings} />
          <RulesList />
        </div>
        <div className="lg:col-span-7 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 delay-300 fill-mode-both">
          <IncomeSourcesList />
          <CategoriesList />
        </div>
      </div>
    </div>
  );
}

function GeneralSettingsForm({ initialData }: { initialData: any }) {
  const [selectedMonth, setSelectedMonth] = useState(initialData.selectedMonth);
  const [monthStartDay, setMonthStartDay] = useState(initialData.monthStartDay.toString());
  const [checkingBuffer, setCheckingBuffer] = useState(initialData.checkingBuffer.toString());
  
  const { data: months } = useListMonths();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
        toast({ title: "Settings saved", description: "Global configuration updated." });
      }
    }
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      data: {
        selectedMonth,
        monthStartDay: parseInt(monthStartDay, 10),
        checkingBuffer: parseFloat(checkingBuffer)
      }
    });
  };

  const monthOptions = months?.map(m => ({ value: m, label: m })) || [];
  if (selectedMonth && !monthOptions.find(o => o.value === selectedMonth)) {
    monthOptions.unshift({ value: selectedMonth, label: selectedMonth });
  }

  return (
    <Card className="border-t-4 border-t-primary">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="h-10 w-10 bg-primary/20 text-primary rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(28,216,210,0.2)]">
          <Settings2 size={20} />
        </div>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label>Active Budget Month</Label>
            <Select 
              value={selectedMonth} 
              onChange={setSelectedMonth} 
              options={monthOptions} 
            />
            <p className="text-xs text-white/40">Changes the context for Dashboard, Plan, and Transactions.</p>
          </div>
          
          <div className="space-y-2">
            <Label>Month Start Day</Label>
            <div className="flex items-center gap-3 bg-black/20 p-2 rounded-xl border border-white/10">
              <span className="text-sm text-white/50 w-12 text-center font-bold">Day</span>
              <Input 
                type="number" 
                min="1" 
                max="28" 
                value={monthStartDay} 
                onChange={e => setMonthStartDay(e.target.value)} 
                className="bg-black/40 border-white/5 font-mono text-lg font-bold"
              />
            </div>
            <p className="text-xs text-white/40">The date your primary pay cycle resets (1-28).</p>
          </div>

          <div className="space-y-2">
            <Label>Checking Account Buffer</Label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-white/50 font-bold">$</span>
              <Input 
                type="number" 
                className="pl-9 font-mono text-lg font-bold" 
                value={checkingBuffer} 
                onChange={e => setCheckingBuffer(e.target.value)} 
              />
            </div>
            <p className="text-xs text-white/40">Target minimum balance to leave in checking.</p>
          </div>

          <div className="pt-4 border-t border-white/10">
            <Button type="submit" className="w-full shadow-[0_0_15px_rgba(28,216,210,0.3)]" disabled={updateMutation.isPending}>
              <Save size={18} className="mr-2" /> Save Preferences
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function IncomeSourcesList() {
  const { data: incomes, isLoading } = useListIncomes({ query: { queryKey: getListIncomesQueryKey() } });
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  const totalMonthly = incomes?.reduce((sum, inc) => sum + inc.monthlyEquivalent, 0) || 0;

  return (
    <Card className="border-t-4 border-t-chart-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-chart-4/20 text-chart-4 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(0,255,100,0.2)]">
            <Wallet size={20} />
          </div>
          <div>
            <CardTitle>Income Sources</CardTitle>
            <p className="text-sm text-white/40 mt-1">Defines baseline for budget planning</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus size={16} className="mr-1" /> Add Source
        </Button>
      </CardHeader>
      
      {isAdding && (
        <div className="px-6 py-5 border-b border-white/10 bg-black/40">
          <IncomeForm onCancel={() => setIsAdding(false)} onComplete={() => setIsAdding(false)} />
        </div>
      )}
      
      <div className="divide-y divide-white/5">
        {incomes?.map(income => (
          editingId === income.id ? (
            <div key={income.id} className="p-6 bg-primary/10 border-y-2 border-primary/30 relative z-20 shadow-[0_0_30px_rgba(28,216,210,0.1)]">
              <IncomeForm initialData={income} onCancel={() => setEditingId(null)} onComplete={() => setEditingId(null)} />
            </div>
          ) : (
            <div key={income.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-white/5 transition-colors">
              <div>
                <h4 className="font-bold text-white text-lg flex items-center gap-3">
                  {income.name}
                  {income.owner && <Badge variant="secondary" className="text-[10px]">{income.owner}</Badge>}
                </h4>
                <div className="text-sm text-white/50 mt-1 flex items-center gap-3 font-mono">
                  <span>{formatCurrency(income.netAmount)}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                  <span className="font-sans font-bold tracking-wide uppercase text-xs">{income.frequency}</span>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right bg-black/20 px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">Monthly Eq.</div>
                  <div className="font-mono font-bold text-chart-4 drop-shadow-[0_0_8px_rgba(0,255,100,0.3)]">{formatCurrency(income.monthlyEquivalent)}</div>
                </div>
                <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(income.id)} className="hover:bg-primary/20 hover:text-primary">
                    <Edit2 size={16} />
                  </Button>
                  <DeleteIncomeButton id={income.id} />
                </div>
              </div>
            </div>
          )
        ))}
        {(!incomes || incomes.length === 0) && !isAdding && (
          <div className="p-12 text-center text-white/40 italic font-display">No income sources defined.</div>
        )}
      </div>
      
      {incomes && incomes.length > 0 && (
        <CardContent className="pt-6 bg-chart-4/5 border-t border-chart-4/20 mt-auto">
          <div className="flex justify-between items-center">
            <span className="font-display font-bold text-white tracking-wide">Total Planned Monthly</span>
            <span className="font-mono font-bold text-2xl text-chart-4 drop-shadow-[0_0_10px_rgba(0,255,100,0.5)]">{formatCurrency(totalMonthly)}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function IncomeForm({ initialData, onCancel, onComplete }: any) {
  const [name, setName] = useState(initialData?.name || "");
  const [owner, setOwner] = useState(initialData?.owner || "");
  const [amount, setAmount] = useState(initialData?.netAmount?.toString() || "");
  const [frequency, setFrequency] = useState(initialData?.frequency || "Monthly");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createMutation = useCreateIncome({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListIncomesQueryKey() });
        toast({ title: "Income source created" });
        onComplete();
      }
    }
  });
  
  const updateMutation = useUpdateIncome({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListIncomesQueryKey() });
        toast({ title: "Income source updated" });
        onComplete();
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;
    
    const parsedAmount = parseFloat(amount);
    let eq = parsedAmount;
    if (frequency === "Weekly") eq = (parsedAmount * 52) / 12;
    if (frequency === "Bi-weekly") eq = (parsedAmount * 26) / 12;
    if (frequency === "Semi-monthly") eq = (parsedAmount * 24) / 12;
    if (frequency === "Annually") eq = parsedAmount / 12;

    const data = {
      name,
      owner: owner || null,
      netAmount: parsedAmount,
      frequency,
      monthlyEquivalent: eq
    };

    if (initialData?.id) {
      updateMutation.mutate({ id: initialData.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label>Name / Source</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pension" required />
        </div>
        <div className="space-y-2">
          <Label>Owner (Optional)</Label>
          <Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. John" />
        </div>
        <div className="space-y-2">
          <Label>Net Amount</Label>
          <div className="relative">
            <span className="absolute left-4 top-3 text-white/50 font-bold">$</span>
            <Input type="number" step="0.01" className="pl-9 font-mono text-lg font-bold" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select 
            value={frequency} 
            onChange={setFrequency} 
            options={["Weekly", "Bi-weekly", "Semi-monthly", "Monthly", "Annually"].map(v => ({ value: v, label: v }))} 
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t border-white/10 mt-4">
        <Button type="button" variant="ghost" onClick={onCancel} className="w-full sm:w-auto">Cancel</Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="w-full sm:w-auto">Save Income</Button>
      </div>
    </form>
  );
}

function DeleteIncomeButton({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteIncome({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListIncomesQueryKey() })
    }
  });

  return (
    <Button variant="ghost" size="icon" className="text-white/50 hover:text-destructive hover:bg-destructive/20" onClick={() => {
      if (confirm("Delete this income source?")) deleteMutation.mutate({ id });
    }}>
      <Trash2 size={16} />
    </Button>
  );
}

function RulesList() {
  const { data: rules } = useListRules({ query: { queryKey: getListRulesQueryKey() } });
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteRule({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() })
    }
  });

  return (
    <Card className="border-t-4 border-t-chart-5">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="h-10 w-10 bg-chart-5/20 text-chart-5 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(255,200,0,0.2)]">
          <Waypoints size={20} />
        </div>
        <div>
          <CardTitle>Merchant Rules</CardTitle>
          <p className="text-sm text-white/40 mt-1">Auto-categorization patterns</p>
        </div>
      </CardHeader>
      <div className="overflow-y-auto max-h-96 divide-y divide-white/5 border-t border-white/10">
        {rules?.map(rule => (
          <div key={rule.id} className="p-5 flex items-center justify-between hover:bg-white/5 transition-colors group">
            <div>
              <div className="font-mono text-sm text-white bg-black/40 border border-white/10 px-3 py-1 rounded-lg inline-block mb-2 font-bold tracking-wide">
                {rule.pattern}
              </div>
              <div className="text-sm text-white/60 flex items-center gap-3">
                <span className="font-bold text-white/80">{rule.category}</span>
                <span className="text-primary">→</span>
                <span>{rule.subcategory}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="text-white/50 hover:text-destructive hover:bg-destructive/20 h-10 w-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={() => {
              if (confirm("Delete this rule?")) deleteMutation.mutate({ id: rule.id });
            }}>
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        {(!rules || rules.length === 0) && (
          <div className="p-10 text-center text-sm text-white/40 font-display italic">No rules created yet. Create them from the Ledger.</div>
        )}
      </div>
    </Card>
  );
}

function CategoriesList() {
  const { data: categories, isLoading } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <Card className="border-t-4 border-t-secondary">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-secondary/20 text-secondary rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(255,0,127,0.2)]">
            <Target size={20} />
          </div>
          <div>
            <CardTitle>Categories</CardTitle>
            <p className="text-sm text-white/40 mt-1">Budget categories and subcategories</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus size={16} className="mr-1" /> Add Category
        </Button>
      </CardHeader>
      
      {isAdding && (
        <div className="px-6 py-5 border-b border-white/10 bg-black/40">
          <CategoryForm onCancel={() => setIsAdding(false)} onComplete={() => setIsAdding(false)} />
        </div>
      )}
      
      <div className="divide-y divide-white/5">
        {categories?.map(category => (
          editingId === category.id ? (
            <div key={category.id} className="p-6 bg-primary/10 border-y-2 border-primary/30 relative z-20 shadow-[0_0_30px_rgba(28,216,210,0.1)]">
              <CategoryForm initialData={category} onCancel={() => setEditingId(null)} onComplete={() => setEditingId(null)} />
            </div>
          ) : (
            <div key={category.id} className="p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 group hover:bg-white/5 transition-colors">
              <div className="w-full">
                <h4 className="font-display font-bold text-white text-xl">{category.name}</h4>
                <div className="flex flex-wrap gap-2 mt-3 bg-black/20 p-3 rounded-xl border border-white/5">
                  {category.subcategories.map(sub => (
                    <Badge key={sub} variant="outline" className="font-bold bg-white/5 hover:bg-white/10">{sub}</Badge>
                  ))}
                  {category.subcategories.length === 0 && (
                     <span className="text-sm text-white/40 italic font-display">No subcategories</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity mt-2 sm:mt-0">
                <Button variant="ghost" size="icon" onClick={() => setEditingId(category.id)} className="hover:bg-primary/20 hover:text-primary">
                  <Edit2 size={16} />
                </Button>
                <DeleteCategoryButton id={category.id} />
              </div>
            </div>
          )
        ))}
        {(!categories || categories.length === 0) && !isAdding && (
          <div className="p-12 text-center text-white/40 italic font-display">No categories defined.</div>
        )}
      </div>
    </Card>
  );
}

function CategoryForm({ initialData, onCancel, onComplete }: any) {
  const [name, setName] = useState(initialData?.name || "");
  const [subcategories, setSubcategories] = useState<string[]>(initialData?.subcategories || []);
  const [newSub, setNewSub] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createMutation = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        toast({ title: "Category created" });
        onComplete();
      }
    }
  });
  
  const updateMutation = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        toast({ title: "Category updated" });
        onComplete();
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    
    // Add pending subcategory if present
    const finalSubs = [...subcategories];
    if (newSub.trim() && !finalSubs.includes(newSub.trim())) {
      finalSubs.push(newSub.trim());
    }

    const data = {
      name,
      subcategories: finalSubs,
      sortOrder: initialData?.sortOrder || 0
    };

    if (initialData?.id) {
      updateMutation.mutate({ id: initialData.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  const addSub = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (newSub.trim() && !subcategories.includes(newSub.trim())) {
        setSubcategories([...subcategories, newSub.trim()]);
        setNewSub("");
      }
    }
  };

  const removeSub = (subToRemove: string) => {
    setSubcategories(subcategories.filter(s => s !== subToRemove));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Category Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Housing" required className="font-bold text-lg" />
        </div>
        <div className="space-y-2">
          <Label>Subcategories</Label>
          <div className="bg-black/40 p-4 rounded-xl border border-white/10 space-y-3">
            <div className="flex flex-wrap gap-2">
              {subcategories.map(sub => (
                <Badge key={sub} variant="secondary" className="flex items-center gap-1 font-bold pl-3 pr-1 py-1">
                  {sub}
                  <button type="button" onClick={() => removeSub(sub)} className="text-secondary hover:text-white bg-black/20 hover:bg-black/40 rounded-full p-1 transition-colors ml-1">
                    <X size={12} />
                  </button>
                </Badge>
              ))}
              {subcategories.length === 0 && <span className="text-sm text-white/30 italic font-display">Add subcategories below...</span>}
            </div>
            <Input 
              value={newSub} 
              onChange={e => setNewSub(e.target.value)} 
              onKeyDown={addSub}
              placeholder="Type and press Enter to add..." 
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t border-white/10 mt-4">
        <Button type="button" variant="ghost" onClick={onCancel} className="w-full sm:w-auto">Cancel</Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="w-full sm:w-auto">Save Category</Button>
      </div>
    </form>
  );
}

function DeleteCategoryButton({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteCategory({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() })
    }
  });

  return (
    <Button variant="ghost" size="icon" className="text-white/50 hover:text-destructive hover:bg-destructive/20" onClick={() => {
      if (confirm("Delete this category? This might affect existing budget lines and transactions.")) {
        deleteMutation.mutate({ id });
      }
    }}>
      <Trash2 size={16} />
    </Button>
  );
}