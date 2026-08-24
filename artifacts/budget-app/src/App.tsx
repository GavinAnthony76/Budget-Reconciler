import { type ReactNode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Redirect,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import ImportReview from "@/pages/import";
import Transactions from "@/pages/transactions";
import BudgetPlan from "@/pages/plan";
import Reconciliation from "@/pages/reconciliation";
import Settings from "@/pages/settings";
import Investments from "@/pages/investments";
import Savings from "@/pages/savings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`,
  },
  variables: {
    colorPrimary: '#62E6C3',
    colorForeground: '#ffffff',
    colorMutedForeground: '#b8b8d1',
    colorDanger: '#ff5f70',
    colorBackground: '#0D202C',
    colorInput: '#17303D',
    colorInputForeground: '#ffffff',
    colorNeutral: '#3d3d59',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    borderRadius: '14px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#17172a] rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10 shadow-2xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-white font-bold',
    headerSubtitle: 'text-white/65',
    socialButtonsBlockButtonText: 'text-white',
    formFieldLabel: 'text-white/80',
    footerActionLink: 'text-[#9AF4D7]',
    footerActionText: 'text-white/60',
    dividerText: 'text-white/45',
    identityPreviewEditButton: 'text-[#9AF4D7]',
    formFieldSuccessText: 'text-emerald-300',
    alertText: 'text-white',
    logoBox: 'mb-3',
    logoImage: 'h-12 w-12',
    socialButtonsBlockButton: 'bg-white/5 border-white/10 hover:bg-white/10',
    formButtonPrimary: 'bg-gradient-to-r from-[#62E6C3] to-[#8178F8] text-[#081B2A] hover:opacity-95',
    formFieldInput: 'bg-[#17303D] border-white/10 text-white',
    footerAction: 'bg-black/20',
    dividerLine: 'bg-white/10',
    alert: 'bg-red-500/10 border-red-400/25',
    otpCodeFieldInput: 'bg-[#24243b] border-white/10 text-white',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function Welcome() {
  return (
    <main className="min-h-[100dvh] bg-background text-white flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-primary/25 blur-[120px]" />
      <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />
      <section className="glass-panel relative w-full max-w-xl p-8 sm:p-12 rounded-3xl border border-white/10 text-center shadow-2xl">
         <img src={`${basePath}/logo.png`} alt="Ledger" className="mx-auto h-16 w-16 mb-7 drop-shadow-[0_0_25px_rgba(98,230,195,0.35)]" />
        <p className="text-primary font-mono text-xs uppercase tracking-[0.25em] mb-4">Private household finance</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">Your money, clearly organized.</h1>
        <p className="mt-5 text-white/65 leading-7">Ledger keeps your budget, spending plan, and transaction history private and ready for you.</p>
        <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
          <a href={`${basePath}/sign-in`} className="rounded-xl bg-gradient-to-r from-primary to-accent px-6 py-3 font-semibold text-white shadow-[0_0_24px_rgba(168,85,247,0.35)]">Sign in to Ledger</a>
          <a href={`${basePath}/sign-up`} className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white hover:bg-white/10">Create account</a>
        </div>
      </section>
    </main>
  );
}

function SignInPage() {
  return <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) queryClient.clear();
    previousUserId.current = userId;
  }), [addListener]);
  return null;
}

function PrivateRouter() {
  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/import" component={ImportReview} />
          <Route path="/transactions" component={Transactions} />
          <Route path="/plan" component={BudgetPlan} />
          <Route path="/reconciliation" component={Reconciliation} />
          <Route path="/savings" component={Savings} />
          <Route path="/investments" component={Investments} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={() => <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Welcome /></Show></>} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route>
        <Show when="signed-in"><PrivateRouter /></Show>
        <Show when="signed-out"><Redirect to="/" /></Show>
      </Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider><Routes /><Toaster /></TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;