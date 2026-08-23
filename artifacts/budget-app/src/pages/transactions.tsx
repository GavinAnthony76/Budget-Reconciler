import { useState, useMemo } from "react";
import { useGetSettings, useListTransactions, useUpdateTransaction, useDeleteTransaction, useCreateTransaction, useListCategories, getListTransactionsQueryKey, ListTransactionsSource } from "@workspace/api-client-react";
import { formatCurrency, formatDate, PageHeader, Skeleton, EmptyState, Card, Button, Input, Select, Badge, Label } from "@/components/ui/core";
import { Search, Filter, Edit2, Trash2, Receipt, AlertCircle, Check, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Transactions() {
  const { data: settings } = useGetSettings();
  const selectedMonth = settings?.selectedMonth;
  
  const [filterType, setFilterType] = useState<"all" | "review" | "bank" | "manual">("all");
  const [search, setSearch] = useState("");
  
  const queryParams = {
    month: selectedMonth,
    needsReview: filterType === "review" ? true : undefined,
    source: (filterType === "bank" ? "bank" : filterType === "manual" ? "manual" : undefined) as ListTransactionsSource | undefined
  };

  const { data: transactions, isLoading } = useListTransactions(
    queryParams,
    { 
      query: { 
        enabled: !!selectedMonth,
        queryKey: getListTransactionsQueryKey(queryParams) 
      } 
    }
  );

  const { data: categories } = useListCategories();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  if (isLoading || !selectedMonth) {
    return (
      <div>
        <PageHeader title="Ledger" description="All transactions for the cycle" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  const filteredData = transactions?.filter(t => {
    if (filterType === "all" && t.source === "manual" && t.linkedBankId != null) return false;
    return (
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      (t.originalDescription && t.originalDescription.toLowerCase().includes(search.toLowerCase())) ||
      (t.category && t.category.toLowerCase().includes(search.toLowerCase()))
    );
  }) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <PageHeader 
          title="Ledger" 
          description={`Transaction history for ${selectedMonth}`}
        />
        <Button onClick={() => setShowAdd((v) => !v)} data-testid="button-add-entry" className="mb-8 relative z-10 w-full sm:w-auto">
          <Plus size={18} className="mr-2" /> Add Entry
        </Button>
      </div>

      {showAdd && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AddEntryForm
            categories={categories || []}
            queryParams={queryParams}
            onDone={() => setShowAdd(false)}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row justify-between gap-4 relative z-10">
        <div className="flex bg-black/20 p-1.5 rounded-xl overflow-x-auto border border-white/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]">
          {[
            { id: "all", label: "All" },
            { id: "review", label: "Needs Review" },
            { id: "bank", label: "Imported CSV" },
            { id: "manual", label: "Manual" }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id as any)}
              className={`px-5 py-2 text-sm font-bold rounded-lg whitespace-nowrap transition-all duration-300 font-display tracking-wide ${
                filterType === f.id 
                  ? "bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.1)] text-white border border-white/20" 
                  : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-72">
          <Search size={18} className="absolute left-4 top-3 text-white/40" />
          <Input 
            className="pl-11 h-12" 
            placeholder="Search transactions..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-visible z-10 relative mt-4">
        {filteredData.length === 0 ? (
          <EmptyState 
            icon={Receipt}
            title="No transactions found"
            description="There are no transactions matching your current filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider font-display border-b border-white/10">
                <tr>
                  <th className="px-5 py-4 font-bold">Date</th>
                  <th className="px-5 py-4 font-bold">Description</th>
                  <th className="px-5 py-4 font-bold">Category</th>
                  <th className="px-5 py-4 font-bold text-right">Amount</th>
                  <th className="px-5 py-4 font-bold text-center">Status</th>
                  <th className="px-5 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredData.map((txn) => (
                  editingId === txn.id ? (
                    <TransactionEditRow 
                      key={txn.id} 
                      transaction={txn} 
                      categories={categories || []}
                      onCancel={() => setEditingId(null)}
                      onComplete={() => setEditingId(null)}
                      queryParams={queryParams}
                    />
                  ) : (
                    <tr key={txn.id} className={`hover:bg-white/5 transition-colors group ${!txn.include ? 'opacity-40 grayscale-[50%]' : ''}`}>
                      <td className="px-5 py-4 font-mono text-white/60">
                        {formatDate(txn.date)}
                      </td>
                      <td className="px-5 py-4 max-w-[250px]">
                        <div className="font-bold text-white truncate">{txn.description}</div>
                        {txn.source === "bank" && (
                          <div className="text-xs text-white/40 truncate font-mono mt-0.5" title={txn.originalDescription || ""}>
                            {txn.originalDescription}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {txn.needsReview ? (
                          <div className="flex items-center text-chart-5 gap-1.5 text-xs font-bold bg-chart-5/10 w-fit px-2.5 py-1 rounded-full border border-chart-5/20 shadow-[0_0_10px_rgba(255,200,0,0.1)]">
                            <AlertCircle size={14} />
                            NEEDS REVIEW
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-white/90">{txn.category || "-"}</div>
                            <div className="text-xs text-white/50">{txn.subcategory || "-"}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold">
                        <span className={txn.amount < 0 ? "text-white" : "text-primary drop-shadow-[0_0_8px_rgba(28,216,210,0.5)]"}>
                          {txn.amount > 0 ? "+" : ""}{formatCurrency(txn.amount)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Badge variant={txn.status === "Posted" ? "outline" : "warning"}>
                          {txn.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/50 hover:text-primary hover:bg-primary/20" onClick={() => setEditingId(txn.id)}>
                            <Edit2 size={16} />
                          </Button>
                          <DeleteTxnButton id={txn.id} source={txn.source} queryParams={queryParams} />
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function AddEntryForm({ categories, queryParams, onDone }: { categories: any[]; queryParams: any; onDone: () => void }) {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [account, setAccount] = useState("Cash");
  const [note, setNote] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Entry added", description: "Your transaction was saved to the ledger." });
        onDone();
      },
      onError: (err: any) => {
        toast({ title: "Could not save", description: err.message || "Check the fields and try again.", variant: "destructive" });
      },
    },
  });

  const selectedCategoryObj = categories.find((c: any) => c.name === (kind === "income" ? "Income" : category));
  const subcategoryOptions = selectedCategoryObj?.subcategories.map((s: string) => ({ value: s, label: s })) || [];

  const handleSave = () => {
    const amt = Math.abs(parseFloat(amount));
    if (!description.trim() || !Number.isFinite(amt) || amt === 0 || !date) {
      toast({ title: "Missing fields", description: "Enter a date, description, and a non-zero amount.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        date,
        description: description.trim(),
        amount: kind === "income" ? amt : -amt,
        category: kind === "income" ? "Income" : category || undefined,
        subcategory: (kind === "income" ? subcategory || "Other" : subcategory) || undefined,
        account: account.trim() || "Cash",
        note: note.trim() || undefined,
      },
    });
  };

  return (
    <Card className="border-t-4 border-t-primary mb-6" data-testid="add-entry-form">
      <div className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-display text-xl font-bold text-white">New Manual Entry</h3>
          <div className="flex bg-black/20 p-1.5 rounded-xl border border-white/10 self-start sm:self-auto">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); setSubcategory(""); }}
                className={`px-5 py-2 text-sm font-bold rounded-lg capitalize transition-all duration-300 font-display ${
                  kind === k 
                    ? k === "expense" ? "bg-destructive/20 text-destructive shadow-[0_0_10px_rgba(255,50,50,0.2)] border border-destructive/30" : "bg-primary/20 text-primary shadow-[0_0_10px_rgba(28,216,210,0.2)] border border-primary/30"
                    : "text-white/50 hover:text-white border border-transparent"
                }`}
                data-testid={`toggle-${k}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-date" className="font-mono text-white/80" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === "income" ? "e.g. Paycheck, Side gig" : "e.g. Farmers market"} data-testid="input-description" />
          </div>
          <div className="space-y-2">
            <Label>Amount ($)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" data-testid="input-amount" className="font-mono text-lg font-bold" />
          </div>
          <div className="space-y-2">
            <Label>Account</Label>
            <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. Cash, Checking" data-testid="input-account" />
          </div>
          {kind === "expense" && (
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onChange={(val) => { setCategory(val); setSubcategory(""); }}
                options={categories.filter((c: any) => c.name !== "Income").map((c: any) => ({ value: c.name, label: c.name }))}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Subcategory</Label>
            {subcategoryOptions.length > 0 ? (
              <Select value={subcategory} onChange={setSubcategory} options={subcategoryOptions} />
            ) : (
              <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Custom..." />
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." />
          </div>
        </div>
        {kind === "expense" && !category && (
          <p className="text-sm text-chart-5 font-bold bg-chart-5/10 p-3 rounded-lg border border-chart-5/20">No category selected — the entry will go to the review queue so you can categorize it later.</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button onClick={handleSave} disabled={createMutation.isPending} data-testid="button-save-entry" className="w-full sm:w-auto">
            {createMutation.isPending ? "Saving..." : kind === "income" ? "Add Income" : "Add Expense"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TransactionEditRow({ transaction, categories, onCancel, onComplete, queryParams }: any) {
  const [category, setCategory] = useState(transaction.category || "");
  const [subcategory, setSubcategory] = useState(transaction.subcategory || "");
  const [include, setInclude] = useState(transaction.include);
  const [note, setNote] = useState(transaction.note || "");
  const [saveRule, setSaveRule] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const updateMutation = useUpdateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(queryParams) });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ title: "Transaction updated", description: "Categorization saved." });
        onComplete();
      }
    }
  });

  const selectedCategoryObj = categories.find((c: any) => c.name === category);
  const subcategoryOptions = selectedCategoryObj?.subcategories.map((s: string) => ({ value: s, label: s })) || [];

  const handleSave = () => {
    updateMutation.mutate({
      id: transaction.id,
      data: {
        category,
        subcategory,
        include,
        note: note || null,
        saveRule,
        rulePattern: saveRule ? transaction.originalDescription || transaction.description : undefined
      }
    });
  };

  return (
    <tr className="bg-primary/10 border-y-2 border-primary/30 relative z-20 shadow-[0_0_30px_rgba(28,216,210,0.1)]">
      <td className="px-5 py-5 font-mono text-white/60 align-top">
        {formatDate(transaction.date)}
      </td>
      <td className="px-5 py-5 align-top">
        <div className="font-bold text-white text-lg">{transaction.description}</div>
        <div className="font-mono text-white/70 mt-1">{formatCurrency(transaction.amount)}</div>
        <div className="mt-4 flex items-center gap-3 bg-black/20 w-fit px-3 py-1.5 rounded-lg border border-white/10">
          <input 
            type="checkbox" 
            id={`include-${transaction.id}`} 
            checked={include} 
            onChange={(e) => setInclude(e.target.checked)} 
            className="rounded border-white/20 bg-black/40 text-primary focus:ring-primary focus:ring-offset-background h-5 w-5 appearance-none checked:bg-primary checked:border-primary transition-all relative
            before:content-['✓'] before:absolute before:text-black before:text-xs before:font-bold before:left-[3px] before:top-[1px] before:opacity-0 checked:before:opacity-100"
          />
          <Label htmlFor={`include-${transaction.id}`} className="cursor-pointer">Include in Budget</Label>
        </div>
      </td>
      <td colSpan={2} className="px-5 py-5 align-top">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select 
                value={category} 
                onChange={(val) => { setCategory(val); setSubcategory(""); }} 
                options={categories.map((c: any) => ({ value: c.name, label: c.name }))} 
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
                  placeholder="Custom..." 
                />
              )}
            </div>
          </div>
          <Input 
            value={note} 
            onChange={e => setNote(e.target.value)} 
            placeholder="Add a note..." 
          />
        </div>
      </td>
      <td colSpan={2} className="px-5 py-5 align-top text-right">
        <div className="flex flex-col items-end gap-2 h-full justify-between">
          <div className="flex items-center gap-3 bg-black/20 px-3 py-1.5 rounded-lg border border-white/10 mb-4">
            <input 
              type="checkbox" 
              id={`rule-${transaction.id}`} 
              checked={saveRule} 
              onChange={(e) => setSaveRule(e.target.checked)} 
              className="rounded border-white/20 bg-black/40 text-primary focus:ring-primary focus:ring-offset-background h-5 w-5 appearance-none checked:bg-primary checked:border-primary transition-all relative
              before:content-['✓'] before:absolute before:text-black before:text-xs before:font-bold before:left-[3px] before:top-[1px] before:opacity-0 checked:before:opacity-100"
            />
            <Label htmlFor={`rule-${transaction.id}`} className="cursor-pointer whitespace-nowrap">Save as Rule</Label>
          </div>
          <div className="flex justify-end gap-3 mt-auto">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>Save changes</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function DeleteTxnButton({ id, source, queryParams }: { id: number, source: string, queryParams: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const deleteMutation = useDeleteTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({
          title: "Deleted",
          description:
            source === "bank"
              ? "Imported CSV transaction and its linked spending entry removed."
              : "Transaction removed (and its linked imported row, if any).",
        });
      }
    }
  });

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-9 w-9 text-white/50 hover:text-destructive hover:bg-destructive/20" 
      onClick={() => {
        if (
          confirm(
            source === "bank"
              ? "Delete this imported CSV transaction? Its linked spending entry will be removed too, so dashboard and reconciliation stay in sync."
              : "Delete this transaction? If it is linked to an imported CSV row, that row will be removed too.",
          )
        ) {
          deleteMutation.mutate({ id });
        }
      }}
      disabled={deleteMutation.isPending}
    >
      <Trash2 size={16} />
    </Button>
  );
}