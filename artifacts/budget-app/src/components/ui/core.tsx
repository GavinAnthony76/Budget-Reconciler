import { ReactNode } from "react";
import { format } from "date-fns";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch (e) {
    return dateStr;
  }
}

export function PageHeader({ title, description, action }: { title: string, description?: string, action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10 relative z-10">
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-4xl md:text-5xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/70 tracking-tight drop-shadow-sm">{title}</h1>
        {description && <p className="text-white/60 mt-3 text-lg max-w-2xl font-medium">{description}</p>}
      </div>
      {action && <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon, action }: { title: string, description: string, icon: any, action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center glass-panel rounded-2xl relative overflow-hidden group">
      {/* Decorative gradient orb for empty state */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-primary/20 rounded-full blur-[50px] group-hover:bg-primary/30 transition-all duration-700 pointer-events-none" />
      
      <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-primary mb-6 shadow-[0_0_20px_rgba(28,216,210,0.15)] relative z-10">
        <Icon size={32} />
      </div>
      <h3 className="text-xl font-display font-bold text-white mb-2 relative z-10">{title}</h3>
      <p className="text-white/60 max-w-md mb-8 relative z-10">{description}</p>
      <div className="relative z-10">{action}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/10 border border-white/5 ${className}`} />;
}

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`glass-card rounded-2xl relative overflow-hidden group ${className}`} style={style}>
      {/* Interactive hover glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="relative z-10 h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-6 py-5 border-b border-white/10 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`font-display text-xl font-bold tracking-wide text-white ${className}`}>{children}</h3>;
}

export function CardContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-6 flex-1 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-6 py-4 bg-black/20 border-t border-white/10 mt-auto ${className}`}>{children}</div>;
}

export function Button({ 
  children, 
  variant = "primary", 
  size = "md",
  className = "",
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
}) {
  const baseClass = "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";
  
  const variants = {
    primary: "bg-gradient-to-r from-primary to-[#7000FF] hover:from-primary/90 hover:to-[#7000FF]/90 text-white shadow-[0_0_20px_rgba(28,216,210,0.3)] hover:shadow-[0_0_25px_rgba(28,216,210,0.5)] border border-white/10",
    secondary: "bg-gradient-to-r from-secondary to-[#FF007F] hover:from-secondary/90 hover:to-[#FF007F]/90 text-white shadow-[0_0_20px_rgba(255,0,127,0.3)] hover:shadow-[0_0_25px_rgba(255,0,127,0.5)] border border-white/10",
    outline: "bg-white/5 border border-white/20 text-white hover:bg-white/10 hover:border-white/30 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]",
    ghost: "text-white/70 hover:text-white hover:bg-white/10",
    destructive: "bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30 hover:border-destructive/50 hover:shadow-[0_0_15px_rgba(255,50,50,0.3)]",
  };
  
  const sizes = {
    sm: "h-9 px-4 text-xs",
    md: "h-11 px-5 py-2",
    lg: "h-14 px-8 text-lg rounded-2xl",
    icon: "h-11 w-11",
  };
  
  return (
    <button 
      className={`${baseClass} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input 
      className={`flex h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] ${className}`}
      {...props}
    />
  );
}

export function Label({ className = "", children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label 
      className={`text-sm font-semibold text-white/80 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}

export function Select({ 
  value, 
  onChange, 
  options, 
  className = "",
  placeholder = "Select an option",
  disabled = false
}: { 
  value: string; 
  onChange: (value: string) => void; 
  options: {value: string, label: string}[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`flex h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50 appearance-none transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] ${className}`}
      >
        <option value="" disabled className="bg-background text-white/50">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-background text-white">{opt.label}</option>
        ))}
      </select>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
        ▼
      </div>
    </div>
  );
}

export function Badge({ 
  children, 
  variant = "default",
  className = ""
}: { 
  children: ReactNode; 
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  className?: string;
}) {
  const baseClass = "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold transition-colors uppercase tracking-wider font-mono";
  
  const variants = {
    default: "bg-primary/20 text-primary border border-primary/30 shadow-[0_0_10px_rgba(28,216,210,0.2)]",
    secondary: "bg-secondary/20 text-secondary border border-secondary/30 shadow-[0_0_10px_rgba(255,0,127,0.2)]",
    destructive: "bg-destructive/20 text-destructive border border-destructive/30 shadow-[0_0_10px_rgba(255,50,50,0.2)]",
    outline: "bg-white/5 text-white/80 border border-white/20",
    success: "bg-chart-4/20 text-chart-4 border border-chart-4/30 shadow-[0_0_10px_rgba(0,255,100,0.2)]",
    warning: "bg-chart-5/20 text-chart-5 border border-chart-5/30 shadow-[0_0_10px_rgba(255,200,0,0.2)]",
  };
  
  return (
    <div className={`${baseClass} ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}
