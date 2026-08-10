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
  const [account, setAccount] = useState("Checking");

  const importMutation = useImportCsv({
    mutation: {
      onSuccess: (data) => {
        setImportResult(data);
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ 
          title: "Import Successful", 
          description: `Added ${data.added} transactions. ${data.needsReview} need review.` 
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
      importMutation.mutate({ data: { csvContent: content, fileName: file.name, account: account.trim() || "Checking" } });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader 
        title="Import & Review" 
        description="Upload bank statements and categorize new transactions"
      />

      {/* Account picker: files may come from several bank accounts */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-4">
        <div className="space-y-1 w-full sm:w-64">
          <Label htmlFor="import-account" className="text-xs flex items-center gap-1.5">
            <Landmark size={14} /> Importing for account
          </Label>
          <Input
            id="import-account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="e.g. Checking, USAA Savings"
          />
        </div>
        <p className="text-xs text-muted-foreground max-w-md pb-2">
          Uploading files from more than one bank account? Set the account name
          before each upload so overlapping files dedupe within the same account
          without dropping identical transactions from a different account.
        </p>
      </div>

      {/* Upload Zone */}
      <div 
        className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
          isDragging 
            ? "border-primary bg-primary/5 scale-[1.02]" 
            : "border-border hover:border-primary/50 hover:bg-muted/30"
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
        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary">
          <UploadCloud size={32} />
        </div>
        <h3 className="font-serif text-xl font-semibold mb-2">Drag & Drop Bank CSV</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Upload your bank statement. We'll automatically identify duplicates, match existing rules, and queue new items for review.
        </p>
        <input 
          type="file" 
          accept=".csv" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
          }} 
        />
        <Button onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}>
          {importMutation.isPending ? "Processing..." : "Select File"}
        </Button>
      </div>

      {/* Results Banner */}
      {importResult && (
        <div className="bg-card border border-card-border rounded-lg p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full flex items-center justify-center">
              <CheckCircle size={24} />
            </div>
            <div>
              <h4 className="font-serif text-lg font-semibold text-foreground">Import Complete</h4>
              <p className="text-sm text-muted-foreground">Processed {importResult.totalRows} rows</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center md:text-left w-full md:w-auto">
            <div>
              <div className="text-2xl font-mono font-bold text-foreground">{importResult.added}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Added</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-foreground">{importResult.autoCategorized}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Auto-Matched</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-foreground">{importResult.duplicates}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Skipped (Dupes)</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-500">{importResult.needsReview}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Needs Review</div>
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
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!imports || imports.length === 0) return null;

  const monthSources = selectedMonth
    ? imports.filter((b) => b.months.includes(selectedMonth) && b.added > 0)
    : [];
  const monthAccounts = [...new Set(monthSources.map((b) => b.account))];

  return (
    <div className="space-y-4 mt-8" data-testid="import-history">
      <div className="flex items-center gap-2">
        <History size={18} className="text-muted-foreground" />
        <h3 className="font-serif text-xl font-semibold text-foreground">Import History</h3>
      </div>

      {selectedMonth && monthSources.length > 0 && (
        <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground" data-testid="month-sources">
          <span className="font-medium text-foreground">{selectedMonth}</span>{" "}
          includes transactions from {monthSources.length} file{monthSources.length === 1 ? "" : "s"} across{" "}
          {monthAccounts.length} account{monthAccounts.length === 1 ? "" : "s"} ({monthAccounts.join(", ")}).
        </div>
      )}

      <div className="bg-card border border-card-border rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Imported</th>
              <th className="px-4 py-3 font-medium">Months Covered</th>
              <th className="px-4 py-3 font-medium text-right">Added</th>
              <th className="px-4 py-3 font-medium text-right">Dupes Skipped</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((b) => (
              <tr key={b.id} className="border-b border-border/50 last:border-0" data-testid={`import-row-${b.id}`}>
                <td className="px-4 py-3 font-mono text-xs max-w-[220px] truncate" title={b.fileName || undefined}>
                  {b.fileName || "(pasted)"}
                </td>
                <td className="px-4 py-3">
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">{b.account}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(b.importedAt.slice(0, 10))}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.months.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-right font-mono">{b.added}</td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">{b.duplicates}</td>
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

  if (isLoading) return <Skeleton className="h-64 w-full" />;

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
    <div className="space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl font-semibold text-foreground">Review Queue</h3>
        <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 rounded-full text-sm font-medium">
          {transactions.length} remaining
        </span>
      </div>
      
      <div className="space-y-4">
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
    <Card className="border-l-4 border-l-amber-400 overflow-visible transition-shadow hover:shadow-md">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Transaction Info */}
          <div className="lg:col-span-4">
            <div className="text-sm font-mono text-muted-foreground mb-1">{formatDate(transaction.date)}</div>
            <div className="font-medium text-lg leading-tight mb-1">{transaction.description}</div>
            <div className="text-xs text-muted-foreground truncate opacity-70 font-mono" title={transaction.originalDescription || ""}>
              {transaction.originalDescription}
            </div>
            <div className={`mt-2 font-mono text-xl font-bold ${transaction.amount < 0 ? 'text-foreground' : 'text-primary'}`}>
              {formatCurrency(transaction.amount)}
            </div>
          </div>
          
          {/* Arrow visual connector on desktop */}
          <div className="hidden lg:flex lg:col-span-1 justify-center text-muted-foreground/30">
            <ArrowRight size={24} />
          </div>
          
          {/* Form */}
          <div className="lg:col-span-7 flex flex-col sm:flex-row items-start gap-4">
            <div className="w-full space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select 
                    value={category} 
                    onChange={(val) => { setCategory(val); setSubcategory(""); }} 
                    options={categories.map((c: any) => ({ value: c.name, label: c.name }))} 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subcategory</Label>
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
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id={`rule-${transaction.id}`} 
                  checked={saveRule} 
                  onChange={(e) => setSaveRule(e.target.checked)} 
                  className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                />
                <Label htmlFor={`rule-${transaction.id}`} className="text-sm cursor-pointer select-none">
                  Always categorize "{transaction.originalDescription || transaction.description}" like this
                </Label>
              </div>
            </div>
            
            <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0 sm:mt-5">
              <Button onClick={handleApprove} disabled={updateMutation.isPending} className="flex-1">
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