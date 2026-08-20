import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Upload, 
  ListOrdered, 
  Calculator, 
  CheckSquare, 
  Settings, 
  Download,
  Command,
  Menu,
  X,
  LogOut
} from "lucide-react";
import { useGetSettings, useListMonths, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useClerk, useUser } from "@clerk/react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const [location] = useLocation();
  const { data: settings } = useGetSettings();
  const { data: months } = useListMonths();
  const queryClient = useQueryClient();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const updateSettingsMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reconciliation"] });
        queryClient.invalidateQueries({ queryKey: ["/api/plan"] });
      }
    }
  });
  
  const navItems = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/plan", label: "Budget Plan", icon: Calculator },
    { href: "/transactions", label: "Ledger", icon: ListOrdered },
    { href: "/import", label: "Import CSV", icon: Upload },
    { href: "/reconciliation", label: "Reconciliation", icon: CheckSquare },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const handleExport = () => {
    window.open(`${import.meta.env.BASE_URL}api/export`, "_blank");
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex min-h-[100dvh] w-full bg-background relative overflow-hidden dark text-foreground">
      {/* Ambient background orbs */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
      <div className="fixed top-[40%] right-[10%] w-[30%] h-[30%] bg-accent/20 rounded-full blur-[100px] pointer-events-none mix-blend-screen" />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-xl border-b border-white/10 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-primary font-display font-bold text-xl">
          <Command size={24} className="text-accent" />
          Ledger
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-white/80 hover:text-white">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 ease-in-out
        md:translate-x-0 glass-panel border-r-white/10 flex flex-col
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 md:h-24 p-6 flex items-center gap-3 border-b border-white/5">
          <div className="h-10 w-10 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(28,216,210,0.5)]">
            <Command size={22} />
          </div>
          <span className="font-display text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">Ledger</span>
        </div>
        
        <div className="px-6 py-5 flex flex-col gap-2 border-b border-white/5">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-1">Active Cycle</span>
          {months && months.length > 0 ? (
            <div className="relative">
              <select 
                value={settings?.selectedMonth || ""}
                onChange={(e) => updateSettingsMutation.mutate({ data: { selectedMonth: e.target.value } })}
                disabled={updateSettingsMutation.isPending}
                className="w-full bg-white/5 border border-white/10 text-white font-display text-lg rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer appearance-none transition-all hover:bg-white/10"
              >
                {months.map(m => <option key={m} value={m} className="bg-background text-white">{m}</option>)}
                {settings?.selectedMonth && !months.includes(settings.selectedMonth) && (
                  <option value={settings.selectedMonth} className="bg-background text-white">{settings.selectedMonth}</option>
                )}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                ▼
              </div>
            </div>
          ) : (
            <div className="w-full bg-white/5 border border-white/10 text-white/50 font-display text-lg rounded-xl px-4 py-2.5 animate-pulse">
              Loading...
            </div>
          )}
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                  isActive 
                    ? "bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] border border-white/10" 
                    : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"
                }`}
              >
                <item.icon size={20} className={`transition-all duration-300 ${isActive ? "text-accent drop-shadow-[0_0_8px_rgba(28,216,210,0.8)] scale-110" : "opacity-70 group-hover:scale-110 group-hover:text-white"}`} />
                <span className={`font-medium ${isActive ? 'font-semibold' : ''}`}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-6 border-t border-white/5">
          <div className="mb-3 flex items-center gap-3 px-1 text-white/70">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">{(user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "L").slice(0, 1).toUpperCase()}</div>
            <span className="min-w-0 flex-1 truncate text-sm">{user?.firstName ?? user?.primaryEmailAddress?.emailAddress}</span>
            <button type="button" aria-label="Sign out" onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><LogOut size={16} /></button>
          </div>
          <button 
            onClick={handleExport}
            className="flex w-full items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary/20 to-secondary/20 hover:from-primary/40 hover:to-secondary/40 border border-white/10 text-white rounded-xl transition-all duration-300 font-medium text-sm group shadow-[0_0_15px_rgba(0,0,0,0.2)] hover:shadow-[0_0_20px_rgba(138,43,226,0.4)]"
          >
            <Download size={16} className="group-hover:-translate-y-0.5 transition-transform" />
            Export Workbook
          </button>
        </div>
      </aside>

      {/* Main Content Overlay for Mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-72 flex flex-col min-w-0 pt-16 md:pt-0 relative z-10 overflow-x-hidden">
        <div className="flex-1 p-4 sm:p-6 md:p-10 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

