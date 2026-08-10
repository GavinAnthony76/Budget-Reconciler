import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Upload, 
  ListOrdered, 
  Calculator, 
  CheckSquare, 
  Settings, 
  Download,
  BookOpen
} from "lucide-react";
import { useGetSettings, useListMonths, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: settings } = useGetSettings();
  const { data: months } = useListMonths();
  const queryClient = useQueryClient();
  const updateSettingsMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reconciliation"] });
      }
    }
  });
  
  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/plan", label: "Budget Plan", icon: Calculator },
    { href: "/transactions", label: "Transactions", icon: ListOrdered },
    { href: "/import", label: "Import & Review", icon: Upload },
    { href: "/reconciliation", label: "Reconciliation", icon: CheckSquare },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const handleExport = () => {
    window.open(`${import.meta.env.BASE_URL}api/export`, "_blank");
  };

  return (
    <div className="flex min-h-[100dvh] w-full bg-background flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-sidebar text-sidebar-foreground flex flex-col md:fixed md:inset-y-0 z-10 border-r border-sidebar-border shadow-xl">
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border/50">
          <div className="h-8 w-8 bg-sidebar-primary rounded-sm flex items-center justify-center text-sidebar-primary-foreground">
            <BookOpen size={20} />
          </div>
          <span className="font-serif text-xl tracking-wide font-semibold text-sidebar-primary">Ledger</span>
        </div>
        
        <div className="px-6 py-4 flex flex-col gap-1 border-b border-sidebar-border/50">
          <span className="text-xs font-mono uppercase tracking-wider text-sidebar-foreground/60 mb-1">Active Period</span>
          {months && months.length > 0 ? (
            <select 
              value={settings?.selectedMonth || ""}
              onChange={(e) => updateSettingsMutation.mutate({ data: { selectedMonth: e.target.value } })}
              disabled={updateSettingsMutation.isPending}
              className="bg-sidebar-accent/50 text-sidebar-foreground font-serif text-lg border-none rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-sidebar-primary cursor-pointer appearance-none"
            >
              {months.map(m => <option key={m} value={m} className="text-foreground bg-background">{m}</option>)}
              {settings?.selectedMonth && !months.includes(settings.selectedMonth) && (
                <option value={settings.selectedMonth} className="text-foreground bg-background">{settings.selectedMonth}</option>
              )}
            </select>
          ) : (
            <span className="font-serif text-lg text-sidebar-primary">{settings?.selectedMonth || "Loading..."}</span>
          )}
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm" 
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon size={18} className={isActive ? "text-sidebar-primary" : "opacity-70"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border/50">
          <button 
            onClick={handleExport}
            className="flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-sidebar-primary/10 text-sidebar-primary hover:bg-sidebar-primary hover:text-sidebar-primary-foreground rounded-md transition-colors font-medium text-sm"
          >
            <Download size={16} />
            Export Workbook
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 flex flex-col min-w-0">
        <div className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
