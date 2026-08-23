import { useState, useRef } from "react";
import { useImportCsv, useListTransactions, useUpdateTransaction, useGetSettings, useListCategories, getListTransactionsQueryKey, useListImports, getListImportsQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate, PageHeader, EmptyState, Skeleton, Card, CardContent, Button, Select, Label, Input } from "@/components/ui/core";
import { UploadCloud, CheckCircle, FileText, ArrowRight, History, Landmark } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ImportReview() {
  const { data: settings } = useGetSettings();
  const selectedMonth = settings?.selectedMonth;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const importMutation = useImportCsv({
    mutation: {
      onSuccess: (data) => {
        setImportResult(data);
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ 
          title: "Import Successful", 
          description: `Added ${data.added} transactions${data.account ? ` to ${data.account}` : ""}. ${data.needsReview} need review.` 
        });
      },
      onError: (err: any) => {
        toast({ 
          title: "Import Failed", 
          description: err.message || "Could not parse CSV file.",
          variant: "destructive"
        });
      }
    }
  });

  const handleFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      importMutation.mutate({ data: { csvContent: content, fileName: file.name } });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PageHeader 
        title="Import CSV" 
        description="Bring bank statement CSVs into Ledger"
      />

      <div className="glass-panel border-l-4 border-l-secondary rounded-2xl p-5 relative overflow-hidden group mb-8">
        <div className="absolute inset-0 bg-secondary/5 opacity-50 group-hover:opacity-100 transition-opacity" />
        <div className="text-sm text-white/80 max-w-3xl flex items-start gap-3 relative z-10">
          <div className="h-8 w-8 bg-secondary/20 text-secondary rounded-lg flex items-center justify-center shrink-0">
            <Landmark size={16} />
          </div>
          <span className="mt-1 leading-relaxed">
            Upload CSV files from as many bank accounts as you like — each file is
            matched to its account automatically (Account 1, Account 2, …) so
            overlapping downloads dedupe correctly and identical transactions
            from different accounts are all kept.
          </span>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="relative z-10">
        <div 
          className={`relative border-2 border-dashed rounded-3xl p-12 sm:p-20 text-center transition-all duration-300 overflow-hidden ${
            isDragging 
              ? "border-primary bg-primary/10 scale-[1.02] shadow-[0_0_30px_rgba(28,216,210,0.2)]" 
              : "border-white/20 bg-white/5 hover:border-primary/50 hover:bg-white/10 hover:shadow-lg"
          } ${importMutation.isPending ? "opacity-50 pointer-events-none" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          {isDragging && <div className="absolute inset-0 bg-primary/20 blur-[50px] pointer-events-none" />}
          
          <div className={`h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-6 transition-all duration-500 relative z-10 ${isDragging ? "bg-primary/30 text-primary scale-110 shadow-[0_0_20px_rgba(28,216,210,0.5)]" : "bg-white/10 text-white/60"}`}>
            <UploadCloud size={40} className={isDragging ? "animate-bounce" : ""} />
          </div>
          <h3 className="font-display text-2xl font-bold mb-3 text-white relative z-10">Drop a bank CSV here</h3>
          <p className="text-white/50 mb-8 max-w-md mx-auto text-lg relative z-10">
            We'll automatically identify duplicates, match existing rules, and queue new items.
          </p>
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }} 
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending} size="lg" className="relative z-10 shadow-[0_0_20px_rgba(28,216,210,0.4)]">
            {importMutation.isPending ? "Parsing CSV..." : "Browse Files"}
          </Button>
        </div>
      </div>

      {/* Results Banner */}
      {importResult && (
        <div className="glass-panel border border-white/20 rounded-2xl p-6 md:p-8 shadow-xl flex flex-col lg:flex-row items-center justify-between gap-8 animate-in slide-in-from-bottom-4 duration-500 z-10 relative overflow-hidden">
          <div className="absolute inset-0 bg-chart-4/5 pointer-events-none" />
          <div className="flex items-center gap-5 w-full lg:w-auto relative z-10">
            <div className="h-16 w-16 bg-chart-4/20 text-chart-4 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,255,100,0.2)]">
              <CheckCircle size={32} />
            </div>
            <div>
              <h4 className="font-display text-2xl font-bold text-white mb-1">Import Complete</h4>
              <p className="text-white/60 font-medium">Processed <span className="font-mono text-white">{importResult.totalRows}</span> rows</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 w-full lg:w-auto relative z-10">
            <div className="bg-black/20 p-4 rounded-xl border border-white/5 text-center">
              <div className="text-3xl font-mono font-bold text-white mb-1">{importResult.added}</div>
              <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Added</div>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-white/5 text-center">
              <div className="text-3xl font-mono font-bold text-chart-4 mb-1">{importResult.autoCategorized}</div>
              <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Auto-Matched</div>
            </div>
            <div className="bg-black/20 p-4 rounded-xl border border-white/5 text-center">
              <div className="text-3xl font-mono font-bold text-white/40 mb-1">{importResult.duplicates}</div>
              <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Skipped Dupes</div>
            </div>
            <div className="bg-chart-5/10 p-4 rounded-xl border border-chart-5/20 text-center shadow-[0_0_15px_rgba(255,200,0,0.1)]">
              <div className="text-3xl font-mono font-bold text-chart-5 mb-1">{importResult.needsReview}</div>
              <div className="text-[10px] text-chart-5/70 uppercase tracking-widest font-bold">Needs Review</div>
            </div>
          </div>
        </div>
      )}

      {/* Review Queue */}
      <ReviewQueue month={selectedMonth} />

      {/* Import history */}
      <ImportHistory selectedMonth={selectedMonth} />
    </div>
  );
}

function ImportHistory({ selectedMonth }: { selectedMonth?: string }) {
  const { data: imports, isLoading } = useListImports();
  if (isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (!imports || imports.length === 0) return null;

  const monthSources = selectedMonth
    ? imports.filter((b) => b.months.includes(selectedMonth) && b.added > 0)
    : [];
  const monthAccounts = [...new Set(monthSources.map((b) => b.account))];

  return (
    <div className="space-y-6 mt-12 relative z-10" data-testid="import-history">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center text-white/70">
          <History size={20} />
        </div>
        <h3 className="font-display text-2xl font-bold text-white">Import History</h3>
      </div>

      {selectedMonth && monthSources.length > 0 && (
        <div className="glass-panel border-white/10 rounded-xl px-5 py-4 text-sm text-white/60" data-testid="month-sources">
          <span className="font-bold text-white font-display text-base tracking-wide">{selectedMonth}</span>{" "}
          includes transactions from {monthSources.length} file{monthSources.length === 1 ? "" : "s"} across{" "}
          <span className="font-bold text-white/90">{monthAccounts.length} account{monthAccounts.length === 1 ? "" : "s"}</span> ({monthAccounts.join(", ")}).
        </div>
      )}

      <div className="glass-panel border-white/10 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/50 font-display">
              <th className="px-5 py-4 font-bold">File</th>
              <th className="px-5 py-4 font-bold">Account</th>
              <th className="px-5 py-4 font-bold">Imported</th>
              <th className="px-5 py-4 font-bold">Months Covered</th>
              <th className="px-5 py-4 font-bold text-right">Added</th>
              <th className="px-5 py-4 font-bold text-right">Dupes Skipped</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {imports.map((b) => (
              <tr key={b.id} className="hover:bg-white/5 transition-colors" data-testid={`import-row-${b.id}`}>
                <td className="px-5 py-4 font-mono text-white/80 max-w-[220px] truncate" title={b.fileName || undefined}>
                  {b.fileName || "(pasted)"}
                </td>
                <td className="px-5 py-4">
                  <span className="bg-primary/20 text-primary border border-primary/30 px-3 py-1 rounded-full text-xs font-bold font-display uppercase tracking-wider">{b.account}</span>
                </td>
                <td className="px-5 py-4 text-white/50 font-mono">{formatDate(b.importedAt.slice(0, 10))}</td>
                <td className="px-5 py-4 text-white/70">{b.months.join(", ") || "—"}</td>
                <td className="px-5 py-4 text-right font-mono font-bold text-white">{b.added}</td>
                <td className="px-5 py-4 text-right font-mono text-white/40">{b.duplicates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewQueue({ month }: { month?: string }) {
  const queryParams = { month, needsReview: true };
  const { data: transactions, isLoading } = useListTransactions(
    queryParams,
    { query: { enabled: !!month, queryKey: getListTransactionsQueryKey(queryParams) } }
  );
  
  const { data: categories } = useListCategories();

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  if (!transactions || transactions.length === 0) {
    return (
      <EmptyState 
        icon={FileText}
        title="Inbox Zero"
        description="All imported transactions have been categorized."
      />
    );
  }

  return (
    <div className="space-y-6 mt-12 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-chart-5/20 text-chart-5 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(255,200,0,0.2)]">
            <FileText size={20} />
          </div>
          <h3 className="font-display text-2xl font-bold text-white">Review Queue</h3>
        </div>
        <span className="bg-chart-5/20 text-chart-5 border border-chart-5/30 px-4 py-1.5 rounded-full text-sm font-bold font-display tracking-wide shadow-[0_0_15px_rgba(255,200,0,0.1)]">
          {transactions.length} remaining
        </span>
      </div>
      
      <div className="space-y-5">
        {transactions.map(txn => (
          <ReviewCard key={txn.id} transaction={txn} categories={categories || []} queryParams={queryParams} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ transaction, categories, queryParams }: { transaction: any, categories: any[], queryParams: any }) {
  const [category, setCategory] = useState(transaction.category || "");
  const [subcategory, setSubcategory] = useState(transaction.subcategory || "");
  const [saveRule, setSaveRule] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const updateMutation = useUpdateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(queryParams) });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ title: "Categorized", description: "Transaction removed from review queue." });
      }
    }
  });

  const selectedCategoryObj = categories.find((c: any) => c.name === category);
  const subcategoryOptions = selectedCategoryObj?.subcategories.map((s: string) => ({ value: s, label: s })) || [];

  const handleApprove = () => {
    if (!category || !subcategory) {
      toast({ title: "Missing fields", description: "Please select a category and subcategory.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: transaction.id,
      data: {
        category,
        subcategory,
        saveRule,
        rulePattern: saveRule ? transaction.originalDescription || transaction.description : undefined
      }
    });
  };

  const handleExclude = () => {
    updateMutation.mutate({
      id: transaction.id,
      data: { include: false }
    });
  };

  return (
    <Card className="border-l-4 border-l-chart-5 overflow-visible transition-shadow hover:shadow-[0_0_30px_rgba(255,200,0,0.15)] group bg-black/40">
      <div className="absolute inset-0 bg-chart-5/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
      <CardContent className="p-6 md:p-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Transaction Info */}
          <div className="lg:col-span-4">
            <div className="text-sm font-mono text-white/50 mb-2 font-bold">{formatDate(transaction.date)}</div>
            <div className="font-bold text-white text-xl leading-tight mb-1">{transaction.description}</div>
            <div className="text-xs text-white/40 truncate font-mono" title={transaction.originalDescription || ""}>
              {transaction.originalDescription}
            </div>
            <div className={`mt-4 font-mono text-3xl font-bold ${transaction.amount < 0 ? 'text-white text-glow' : 'text-primary drop-shadow-[0_0_10px_rgba(28,216,210,0.5)]'}`}>
              {formatCurrency(transaction.amount)}
            </div>
          </div>
          
          {/* Arrow visual connector on desktop */}
          <div className="hidden lg:flex lg:col-span-1 justify-center text-white/20">
            <ArrowRight size={32} />
          </div>
          
          {/* Form */}
          <div className="lg:col-span-7 flex flex-col sm:flex-row items-start gap-6">
            <div className="w-full space-y-4">
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
              <div className="flex items-center gap-3 bg-black/20 px-4 py-2.5 rounded-xl border border-white/10 w-fit">
                <input 
                  type="checkbox" 
                  id={`rule-${transaction.id}`} 
                  checked={saveRule} 
                  onChange={(e) => setSaveRule(e.target.checked)} 
                  className="rounded border-white/20 bg-black/40 text-primary focus:ring-primary focus:ring-offset-background h-5 w-5 appearance-none checked:bg-primary checked:border-primary transition-all relative
                  before:content-['✓'] before:absolute before:text-black before:text-xs before:font-bold before:left-[3px] before:top-[1px] before:opacity-0 checked:before:opacity-100"
                />
                <Label htmlFor={`rule-${transaction.id}`} className="text-sm cursor-pointer select-none font-medium">
                  Always categorize "{transaction.originalDescription || transaction.description}" like this
                </Label>
              </div>
            </div>
            
            <div className="flex sm:flex-col gap-3 w-full sm:w-auto shrink-0 sm:mt-8">
              <Button onClick={handleApprove} disabled={updateMutation.isPending} className="flex-1 shadow-[0_0_15px_rgba(28,216,210,0.3)]">
                Approve
              </Button>
              <Button variant="outline" onClick={handleExclude} disabled={updateMutation.isPending} className="flex-1">
                Exclude
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}