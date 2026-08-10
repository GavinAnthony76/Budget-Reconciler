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
import { Save, Plus, Trash2, Edit2, X } from "lucide-react";

export default function Settings() {
  const { data: settings, isLoading: loadingSettings } = useGetSettings();
  
  if (loadingSettings || !settings) {
    return <div className="p-8"><Skeleton className="h-[800px] w-full" /></div>;
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <PageHeader title="Settings" description="System configuration and global rules" />
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-8">
          <GeneralSettingsForm initialData={settings} />
          <RulesList />
        </div>
        <div className="lg:col-span-7 space-y-8">
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
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <Label>Active Budget Month</Label>
            <Select 
              value={selectedMonth} 
              onChange={setSelectedMonth} 
              options={monthOptions} 
            />
            <p className="text-xs text-muted-foreground">Changes the context for Dashboard, Plan, and Transactions.</p>
          </div>
          
          <div className="space-y-2">
            <Label>Month Start Day</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-12">Day</span>
              <Input 
                type="number" 
                min="1" 
                max="28" 
                value={monthStartDay} 
                onChange={e => setMonthStartDay(e.target.value)} 
              />
            </div>
            <p className="text-xs text-muted-foreground">The date your primary pay cycle resets (1-28).</p>
          </div>

          <div className="space-y-2">
            <Label>Checking Account Buffer</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
              <Input 
                type="number" 
                className="pl-7" 
                value={checkingBuffer} 
                onChange={e => setCheckingBuffer(e.target.value)} 
              />
            </div>
            <p className="text-xs text-muted-foreground">Target minimum balance to leave in checking.</p>
          </div>

          <div className="pt-2">
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              <Save size={16} className="mr-2" /> Save Preferences
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

  if (isLoading) return <Skeleton className="h-64" />;

  const totalMonthly = incomes?.reduce((sum, inc) => sum + inc.monthlyEquivalent, 0) || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Income Sources</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Defines baseline for budget planning</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus size={14} className="mr-1" /> Add Source
        </Button>
      </CardHeader>
      
      {isAdding && (
        <div className="px-6 py-4 border-b border-border bg-muted/10">
          <IncomeForm onCancel={() => setIsAdding(false)} onComplete={() => setIsAdding(false)} />
        </div>
      )}
      
      <div className="divide-y divide-border">
        {incomes?.map(income => (
          editingId === income.id ? (
            <div key={income.id} className="p-6 bg-muted/10">
              <IncomeForm initialData={income} onCancel={() => setEditingId(null)} onComplete={() => setEditingId(null)} />
            </div>
          ) : (
            <div key={income.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
              <div>
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  {income.name}
                  {income.owner && <Badge variant="secondary">{income.owner}</Badge>}
                </h4>
                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3">
                  <span>{formatCurrency(income.netAmount)}</span>
                  <span className="w-1 h-1 rounded-full bg-border"></span>
                  <span>{income.frequency}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Eq.</div>
                  <div className="font-mono font-medium text-primary">{formatCurrency(income.monthlyEquivalent)}</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(income.id)}>
                    <Edit2 size={14} />
                  </Button>
                  <DeleteIncomeButton id={income.id} />
                </div>
              </div>
            </div>
          )
        ))}
        {(!incomes || incomes.length === 0) && !isAdding && (
          <div className="p-8 text-center text-muted-foreground italic">No income sources defined.</div>
        )}
      </div>
      
      {incomes && incomes.length > 0 && (
        <CardContent className="pt-6 bg-muted/5 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-foreground">Total Planned Monthly Income</span>
            <span className="font-mono font-bold text-xl text-primary">{formatCurrency(totalMonthly)}</span>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Name / Source</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pension" required />
        </div>
        <div className="space-y-1">
          <Label>Owner (Optional)</Label>
          <Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. John" />
        </div>
        <div className="space-y-1">
          <Label>Net Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
            <Input type="number" step="0.01" className="pl-7" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Frequency</Label>
          <Select 
            value={frequency} 
            onChange={setFrequency} 
            options={["Weekly", "Bi-weekly", "Semi-monthly", "Monthly", "Annually"].map(v => ({ value: v, label: v }))} 
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Save</Button>
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
    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
      if (confirm("Delete this income source?")) deleteMutation.mutate({ id });
    }}>
      <Trash2 size={14} />
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
    <Card>
      <CardHeader>
        <CardTitle>Merchant Rules</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">Auto-categorization patterns</p>
      </CardHeader>
      <div className="overflow-y-auto max-h-96 divide-y divide-border border-t border-border">
        {rules?.map(rule => (
          <div key={rule.id} className="p-4 flex items-center justify-between hover:bg-muted/10">
            <div>
              <div className="font-mono text-sm text-foreground bg-muted px-2 py-0.5 rounded inline-block mb-1">
                {rule.pattern}
              </div>
              <div className="text-xs text-muted-foreground flex gap-2">
                <span>{rule.category}</span>
                <span>→</span>
                <span>{rule.subcategory}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => {
              if (confirm("Delete this rule?")) deleteMutation.mutate({ id: rule.id });
            }}>
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        {(!rules || rules.length === 0) && (
          <div className="p-6 text-center text-sm text-muted-foreground">No rules created yet. Create them from the Transactions page.</div>
        )}
      </div>
    </Card>
  );
}

function CategoriesList() {
  const { data: categories, isLoading } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Categories</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Budget categories and subcategories</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus size={14} className="mr-1" /> Add Category
        </Button>
      </CardHeader>
      
      {isAdding && (
        <div className="px-6 py-4 border-b border-border bg-muted/10">
          <CategoryForm onCancel={() => setIsAdding(false)} onComplete={() => setIsAdding(false)} />
        </div>
      )}
      
      <div className="divide-y divide-border">
        {categories?.map(category => (
          editingId === category.id ? (
            <div key={category.id} className="p-6 bg-muted/10">
              <CategoryForm initialData={category} onCancel={() => setEditingId(null)} onComplete={() => setEditingId(null)} />
            </div>
          ) : (
            <div key={category.id} className="p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 group">
              <div>
                <h4 className="font-semibold text-foreground">{category.name}</h4>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {category.subcategories.map(sub => (
                    <Badge key={sub} variant="secondary" className="font-normal">{sub}</Badge>
                  ))}
                  {category.subcategories.length === 0 && (
                    <span className="text-sm text-muted-foreground italic">No subcategories</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" onClick={() => setEditingId(category.id)}>
                  <Edit2 size={14} />
                </Button>
                <DeleteCategoryButton id={category.id} />
              </div>
            </div>
          )
        ))}
        {(!categories || categories.length === 0) && !isAdding && (
          <div className="p-8 text-center text-muted-foreground italic">No categories defined.</div>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Category Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Housing" required />
        </div>
        <div className="space-y-1">
          <Label>Subcategories</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {subcategories.map(sub => (
              <Badge key={sub} variant="secondary" className="flex items-center gap-1 font-normal">
                {sub}
                <button type="button" onClick={() => removeSub(sub)} className="text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              </Badge>
            ))}
          </div>
          <Input 
            value={newSub} 
            onChange={e => setNewSub(e.target.value)} 
            onKeyDown={addSub}
            placeholder="Type and press Enter to add..." 
            className="text-sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Save</Button>
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
    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
      if (confirm("Delete this category? This might affect existing budget lines and transactions.")) {
        deleteMutation.mutate({ id });
      }
    }}>
      <Trash2 size={14} />
    </Button>
  );
}