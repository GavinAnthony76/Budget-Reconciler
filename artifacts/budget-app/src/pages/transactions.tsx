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
        <PageHeader title="Transactions" description="Ledger entries" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  const filteredData = transactions?.filter(t => {
    // In the combined view, imported purchases exist as a linked pair (bank
    // row + ledger mirror). Show only one row per real transaction: hide the
    // mirror — edits/deletes on the bank row propagate to it automatically.
    if (filterType === "all" && t.source === "manual" && t.linkedBankId != null) return false;
    return (
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      (t.originalDescription && t.originalDescription.toLowerCase().includes(search.toLowerCase())) ||
      (t.category && t.category.toLowerCase().includes(search.toLowerCase()))
    );
  }) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <PageHeader 
          title="Transactions" 
          description={`Ledger for ${selectedMonth}`}
        />
        <Button onClick={() => setShowAdd((v) => !v)} data-testid="button-add-entry">
          <Plus size={16} className="mr-1.5" /> Add Entry
        </Button>
      </div>

      {showAdd && (
        <AddEntryForm
          categories={categories || []}
          queryParams={queryParams}
          onDone={() => setShowAdd(false)}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex bg-muted/50 p-1 rounded-md overflow-x-auto">
          {[
            { id: "all", label: "All" },
            { id: "review", label: "Needs Review" },
            { id: "bank", label: "Bank Data" },
            { id: "manual", label: "Ledger" }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id as any)}
              className={`px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                filterType === f.id 
                  ? "bg-background shadow-sm text-foreground" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
          <Input 
            className="pl-9" 
            placeholder="Search transactions..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {filteredData.length === 0 ? (
          <EmptyState 
            icon={Receipt}
            title="No transactions found"
            description="There are no transactions matching your current filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
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
                    <tr key={txn.id} className={`hover:bg-muted/10 transition-colors group ${!txn.include ? 'opacity-50 bg-muted/20' : ''}`}>
                      <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                        {formatDate(txn.date)}
                      </td>
                      <td className="px-4 py-3 max-w-[250px]">
                        <div className="font-medium truncate">{txn.description}</div>
                        {txn.source === "bank" && (
                          <div className="text-xs text-muted-foreground truncate" title={txn.originalDescription || ""}>
                            {txn.originalDescription}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {txn.needsReview ? (
                          <div className="flex items-center text-amber-600 dark:text-amber-500 gap-1.5 text-xs font-medium">
                            <AlertCircle size={14} />
                            Needs Review
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium">{txn.category || "-"}</div>
                            <div className="text-xs text-muted-foreground">{txn.subcategory || "-"}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium whitespace-nowrap">
                        <span className={txn.amount < 0 ? "text-foreground" : "text-primary"}>
                          {formatCurrency(txn.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={txn.status === "Posted" ? "outline" : "warning"} className="font-mono font-normal">
                          {txn.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditingId(txn.id)}>
                            <Edit2 size={14} />
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
        // Income is stored positive; spending negative — same as the workbook
        amount: kind === "income" ? amt : -amt,
        category: kind === "income" ? "Income" : category || undefined,
        subcategory: (kind === "income" ? subcategory || "Other" : subcategory) || undefined,
        account: account.trim() || "Cash",
        note: note.trim() || undefined,
      },
    });
  };

  return (
    <Card className="border-l-4 border-l-primary" data-testid="add-entry-form">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg font-semibold">New Manual Entry</h3>
          <div className="flex bg-muted/50 p-1 rounded-md">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); setSubcategory(""); }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
                  kind === k ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`toggle-${k}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-date" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === "income" ? "e.g. Paycheck, Side gig" : "e.g. Farmers market"} data-testid="input-description" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount ($)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" data-testid="input-amount" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Account</Label>
            <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. Cash, Checking" data-testid="input-account" />
          </div>
          {kind === "expense" && (
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select
                value={category}
                onChange={(val) => { setCategory(val); setSubcategory(""); }}
                options={categories.filter((c: any) => c.name !== "Income").map((c: any) => ({ value: c.name, label: c.name }))}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Subcategory</Label>
            {subcategoryOptions.length > 0 ? (
              <Select value={subcategory} onChange={setSubcategory} options={subcategoryOptions} />
            ) : (
              <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Custom..." />
            )}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." />
          </div>
        </div>
        {kind === "expense" && !category && (
          <p className="text-xs text-amber-600 dark:text-amber-500">No category selected — the entry will go to the review queue so you can categorize it later.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button onClick={handleSave} disabled={createMutation.isPending} data-testid="button-save-entry">
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
    <tr className="bg-primary/5 ring-1 ring-primary/20 shadow-sm relative z-10">
      <td className="px-4 py-4 font-mono text-muted-foreground align-top">
        {formatDate(transaction.date)}
      </td>
      <td className="px-4 py-4 align-top">
        <div className="font-medium">{transaction.description}</div>
        <div className="text-xs text-muted-foreground mt-1">{formatCurrency(transaction.amount)}</div>
        <div className="mt-3 flex items-center gap-2">
          <input 
            type="checkbox" 
            id={`include-${transaction.id}`} 
            checked={include} 
            onChange={(e) => setInclude(e.target.checked)} 
            className="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <Label htmlFor={`include-${transaction.id}`}>Include in Budget</Label>
        </div>
      </td>
      <td colSpan={2} className="px-4 py-4 align-top">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Category</Label>
              <Select 
                value={category} 
                onChange={(val) => { setCategory(val); setSubcategory(""); }} 
                options={categories.map((c: any) => ({ value: c.name, label: c.name }))} 
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Subcategory</Label>
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
            className="text-sm"
          />
        </div>
      </td>
      <td colSpan={2} className="px-4 py-4 align-top text-right">
        <div className="flex flex-col items-end gap-2 h-full justify-between">
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id={`rule-${transaction.id}`} 
              checked={saveRule} 
              onChange={(e) => setSaveRule(e.target.checked)} 
              className="rounded border-input text-primary focus:ring-primary h-4 w-4"
            />
            <Label htmlFor={`rule-${transaction.id}`} className="text-xs whitespace-nowrap">Save as Rule</Label>
          </div>
          <div className="flex justify-end gap-2 mt-auto">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>Save</Button>
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
              ? "Bank transaction and its linked spending entry removed."
              : "Transaction removed (and its linked bank row, if any).",
        });
      }
    }
  });

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-8 w-8 text-muted-foreground hover:text-destructive" 
      onClick={() => {
        if (
          confirm(
            source === "bank"
              ? "Delete this bank transaction? Its linked spending entry will be removed too, so dashboard and reconciliation stay in sync."
              : "Delete this transaction? If it is linked to an imported bank row, that row will be removed too.",
          )
        ) {
          deleteMutation.mutate({ id });
        }
      }}
      disabled={deleteMutation.isPending}
    >
      <Trash2 size={14} />
    </Button>
  );
}