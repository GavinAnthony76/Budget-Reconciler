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
        <Skeleton className="h-[600px] w-full" />
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Budget Plan" 
        description={`Allocate your income for ${selectedMonth || 'the current month'}`}
        action={
          <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
            <Plus size={16} className="mr-2" /> Add Line Item
          </Button>
        }
      />

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg font-semibold text-primary">Total Planned Expenses</h3>
          <p className="text-muted-foreground text-sm">Target total across all categories</p>
        </div>
        <div className="text-3xl font-mono font-bold text-primary">
          {formatCurrency(totalPlanned)}
        </div>
      </div>

      {isAdding && (
        <Card className="border-primary ring-1 ring-primary/20">
          <div className="p-4 border-b border-border bg-muted/20">
            <h3 className="font-medium">New Plan Line</h3>
          </div>
          <div className="p-4">
            <PlanLineForm 
              categories={categories || []}
              onCancel={() => setIsAdding(false)} 
              onComplete={() => setIsAdding(false)}
            />
          </div>
        </Card>
      )}

      {Object.keys(groupedLines).length === 0 && !isAdding ? (
        <EmptyState 
          icon={FileEdit}
          title="No budget lines planned"
          description="Start planning your month by adding your first expense category."
          action={<Button onClick={() => setIsAdding(true)}><Plus size={16} className="mr-2" /> Create First Line</Button>}
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedLines).sort(([a], [b]) => a.localeCompare(b)).map(([categoryName, lines]) => {
            const catTotal = lines.reduce((sum, l) => sum + l.planned, 0);
            return (
              <div key={categoryName} className="space-y-3">
                <div className="flex items-end justify-between border-b border-border pb-2">
                  <h3 className="font-serif text-xl font-semibold text-foreground">{categoryName}</h3>
                  <span className="font-mono text-muted-foreground font-medium">{formatCurrency(catTotal)}</span>
                </div>
                
                <div className="bg-card border border-card-border rounded-lg overflow-hidden shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/30 text-muted-foreground text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 font-medium w-1/4">Subcategory</th>
                        <th className="px-4 py-3 font-medium w-1/6">Type</th>
                        <th className="px-4 py-3 font-medium text-right w-1/6">Planned</th>
                        <th className="px-4 py-3 font-medium w-1/4">Notes</th>
                        <th className="px-4 py-3 text-right w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lines.map((line) => (
                        editingId === line.id ? (
                          <tr key={line.id} className="bg-muted/10">
                            <td colSpan={5} className="p-4">
                              <PlanLineForm 
                                initialData={line} 
                                categories={categories || []}
                                onCancel={() => setEditingId(null)}
                                onComplete={() => setEditingId(null)}
                              />
                            </td>
                          </tr>
                        ) : (
                          <tr key={line.id} className="hover:bg-muted/10 transition-colors group">
                            <td className="px-4 py-3 font-medium">{line.subcategory}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                {line.fixedVariable && (
                                  <Badge variant="outline" className="text-[10px] py-0">{line.fixedVariable}</Badge>
                                )}
                                {line.priority && (
                                  <Badge variant="secondary" className="text-[10px] py-0">{line.priority}</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(line.planned)}</td>
                            <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]" title={line.notes || ""}>
                              {line.notes || <span className="opacity-50">-</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditingId(line.id)}>
                                  <Edit2 size={14} />
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
            <Input 
              type="number" 
              step="0.01" 
              className="pl-7" 
              value={planned} 
              onChange={e => setPlanned(e.target.value)} 
              placeholder="0.00" 
            />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X size={16} className="mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
          <Check size={16} className="mr-2" /> Save Line
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
      className="h-8 w-8 text-muted-foreground hover:text-destructive" 
      onClick={() => {
        if (confirm("Are you sure you want to delete this line?")) {
          deleteMutation.mutate({ id });
        }
      }}
      disabled={deleteMutation.isPending}
    >
      <Trash2 size={14} />
    </Button>
  );
}