import { useState } from "react";
import { useGetSettings, useListPlanLines, useCreatePlanLine, useUpdatePlanLine, useDeletePlanLine, useListCategories, getListPlanLinesQueryKey } from "@workspace/api-client-react";
import { formatCurrency, PageHeader, EmptyState, Skeleton, Card, Button, Input, Select, Badge, Label } from "@/components/ui/core";
import { Plus, Trash2, Edit2, Check, X, FileEdit } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function BudgetPlan() {
  const { data: settings } = useGetSettings();
  const selectedMonth = settings?.selectedMonth;
  const { data: categories } = useListCategories();
  
  const { data: planLines, isLoading } = useListPlanLines({
    query: {
      queryKey: getListPlanLinesQueryKey()
    }
  });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Budget Plan" description="Allocate your income" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  // Group by category
  const groupedLines = planLines?.reduce((acc, line) => {
    if (!acc[line.category]) acc[line.category] = [];
    acc[line.category].push(line);
    return acc;
  }, {} as Record<string, typeof planLines>) || {};

  const totalPlanned = planLines?.reduce((sum, line) => sum + line.planned, 0) || 0;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <PageHeader 
          title="Budget Plan" 
          description={`Allocate your income for ${selectedMonth || 'the current month'}`}
        />
        <Button onClick={() => setIsAdding(true)} disabled={isAdding} className="mb-8 relative z-10 w-full sm:w-auto">
          <Plus size={18} className="mr-2" /> Add Line Item
        </Button>
      </div>

      <div className="glass-panel border-t-2 border-t-primary rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden group">
        <div className="absolute inset-0 bg-primary/5 opacity-50 group-hover:opacity-100 transition-opacity" />
        <div className="relative z-10">
          <h3 className="font-display text-xl font-bold text-white mb-1 tracking-wide">Total Planned Expenses</h3>
          <p className="text-white/60 text-sm">Target total across all categories</p>
        </div>
        <div className="text-4xl font-mono font-bold text-primary drop-shadow-[0_0_15px_rgba(28,216,210,0.5)] relative z-10 text-glow">
          {formatCurrency(totalPlanned)}
        </div>
      </div>

      {isAdding && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300 relative z-20">
          <Card className="border-t-4 border-t-secondary">
            <div className="p-5 sm:p-6 border-b border-white/10 bg-white/5">
              <h3 className="font-display font-bold text-white text-lg">New Plan Line</h3>
            </div>
            <div className="p-5 sm:p-6">
              <PlanLineForm 
                categories={categories || []}
                onCancel={() => setIsAdding(false)} 
                onComplete={() => setIsAdding(false)}
              />
            </div>
          </Card>
        </div>
      )}

      {Object.keys(groupedLines).length === 0 && !isAdding ? (
        <EmptyState 
          icon={FileEdit}
          title="No budget lines planned"
          description="Start planning your month by adding your first expense category."
          action={<Button onClick={() => setIsAdding(true)}><Plus size={16} className="mr-2" /> Create First Line</Button>}
        />
      ) : (
        <div className="space-y-8 relative z-10">
          {Object.entries(groupedLines).sort(([a], [b]) => a.localeCompare(b)).map(([categoryName, lines], index) => {
            const catTotal = lines.reduce((sum, l) => sum + l.planned, 0);
            return (
              <div key={categoryName} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: `${index * 100}ms` }}>
                <div className="flex items-end justify-between border-b border-white/10 pb-3">
                  <h3 className="font-display text-2xl font-bold text-white tracking-wide">{categoryName}</h3>
                  <span className="font-mono text-white/70 font-bold text-lg">{formatCurrency(catTotal)}</span>
                </div>
                
                <div className="glass-panel border-white/10 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-white/5 text-white/50 text-xs uppercase font-display tracking-wider">
                        <tr>
                          <th className="px-5 py-4 font-bold w-1/4">Subcategory</th>
                          <th className="px-5 py-4 font-bold w-1/6">Type</th>
                          <th className="px-5 py-4 font-bold text-right w-1/6">Planned</th>
                          <th className="px-5 py-4 font-bold w-1/4">Notes</th>
                          <th className="px-5 py-4 text-right w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {lines.map((line) => (
                          editingId === line.id ? (
                            <tr key={line.id} className="bg-primary/10 border-y-2 border-primary/30 relative z-20 shadow-[0_0_30px_rgba(28,216,210,0.1)]">
                              <td colSpan={5} className="p-5 sm:p-6">
                                <PlanLineForm 
                                  initialData={line} 
                                  categories={categories || []}
                                  onCancel={() => setEditingId(null)}
                                  onComplete={() => setEditingId(null)}
                                />
                              </td>
                            </tr>
                          ) : (
                            <tr key={line.id} className="hover:bg-white/5 transition-colors group">
                              <td className="px-5 py-4 font-bold text-white group-hover:text-primary transition-colors">{line.subcategory}</td>
                              <td className="px-5 py-4">
                                <div className="flex flex-wrap gap-2">
                                  {line.fixedVariable && (
                                    <Badge variant="outline" className="text-[10px] py-0">{line.fixedVariable}</Badge>
                                  )}
                                  {line.priority && (
                                    <Badge variant="secondary" className="text-[10px] py-0">{line.priority}</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-right font-mono font-bold text-white/90">{formatCurrency(line.planned)}</td>
                              <td className="px-5 py-4 text-white/50 truncate max-w-[150px] sm:max-w-[250px]" title={line.notes || ""}>
                                {line.notes || <span className="opacity-30">-</span>}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-9 w-9 text-white/50 hover:text-primary hover:bg-primary/20" onClick={() => setEditingId(line.id)}>
                                    <Edit2 size={16} />
                                  </Button>
                                  <DeleteLineButton id={line.id} />
                                </div>
                              </td>
                            </tr>
                          )
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlanLineForm({ 
  initialData, 
  categories,
  onCancel, 
  onComplete 
}: { 
  initialData?: any, 
  categories: any[],
  onCancel: () => void, 
  onComplete: () => void 
}) {
  const [category, setCategory] = useState(initialData?.category || "");
  const [subcategory, setSubcategory] = useState(initialData?.subcategory || "");
  const [planned, setPlanned] = useState(initialData?.planned?.toString() || "");
  const [priority, setPriority] = useState(initialData?.priority || "");
  const [fixedVariable, setFixedVariable] = useState(initialData?.fixedVariable || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createMutation = useCreatePlanLine({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPlanLinesQueryKey() });
        toast({ title: "Line item added", description: "Budget plan updated." });
        onComplete();
      }
    }
  });
  
  const updateMutation = useUpdatePlanLine({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPlanLinesQueryKey() });
        toast({ title: "Line item updated", description: "Changes saved." });
        onComplete();
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !subcategory || !planned) {
      toast({ title: "Validation Error", description: "Category, subcategory, and amount are required.", variant: "destructive" });
      return;
    }
    
    const data = {
      category,
      subcategory,
      planned: parseFloat(planned),
      priority: priority || null,
      fixedVariable: fixedVariable || null,
      notes: notes || null
    };

    if (initialData?.id) {
      updateMutation.mutate({ id: initialData.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  const selectedCategoryObj = categories.find((c: any) => c.name === category);
  const subcategoryOptions = selectedCategoryObj?.subcategories.map((s: string) => ({ value: s, label: s })) || [];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select 
            value={category} 
            onChange={(val) => { setCategory(val); setSubcategory(""); }} 
            options={categories.map(c => ({ value: c.name, label: c.name }))} 
          />
        </div>
        <div className="space-y-2">
          <Label>Subcategory</Label>
          {subcategoryOptions.length > 0 ? (
            <Select 
              value={subcategory} 
              onChange={setSubcategory} 
              options={subcategoryOptions} 
            />
          ) : (
            <Input 
              value={subcategory} 
              onChange={e => setSubcategory(e.target.value)} 
              placeholder="Custom subcategory..." 
            />
          )}
        </div>
        <div className="space-y-2">
          <Label>Planned Amount</Label>
          <div className="relative">
            <span className="absolute left-4 top-3 text-white/50 font-bold">$</span>
            <Input 
              type="number" 
              step="0.01" 
              className="pl-9 font-mono text-lg font-bold" 
              value={planned} 
              onChange={e => setPlanned(e.target.value)} 
              placeholder="0.00" 
            />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="space-y-2">
          <Label>Type (Optional)</Label>
          <Select 
            value={fixedVariable} 
            onChange={setFixedVariable} 
            options={[{value: "Fixed", label: "Fixed"}, {value: "Variable", label: "Variable"}]} 
            placeholder="None"
          />
        </div>
        <div className="space-y-2">
          <Label>Priority (Optional)</Label>
          <Select 
            value={priority} 
            onChange={setPriority} 
            options={[{value: "High", label: "High"}, {value: "Medium", label: "Medium"}, {value: "Low", label: "Low"}]} 
            placeholder="None"
          />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Input 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            placeholder="Optional context..." 
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-3 mt-4 border-t border-white/10">
        <Button type="button" variant="ghost" onClick={onCancel} className="w-full sm:w-auto">
          <X size={18} className="mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="w-full sm:w-auto">
          <Check size={18} className="mr-2" /> Save Line
        </Button>
      </div>
    </form>
  );
}

function DeleteLineButton({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const deleteMutation = useDeletePlanLine({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPlanLinesQueryKey() });
        toast({ title: "Deleted", description: "Plan line removed." });
      }
    }
  });

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-9 w-9 text-white/50 hover:text-destructive hover:bg-destructive/20" 
      onClick={() => {
        if (confirm("Are you sure you want to delete this line?")) {
          deleteMutation.mutate({ id });
        }
      }}
      disabled={deleteMutation.isPending}
    >
      <Trash2 size={16} />
    </Button>
  );
}