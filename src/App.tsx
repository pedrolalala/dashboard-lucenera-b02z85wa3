import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Layout from './components/Layout'
import { AuthProvider } from './hooks/use-auth'

// SPEC-123: code-splitting por rota (mesmo padrão já em produção no RH,
// dashboard-rh-lucenera-5fe9c/src/App.tsx).
const Index = lazy(() => import('./pages/Index'))
const ContasReceberFoco = lazy(() => import('./pages/ContasReceberFoco'))
const ContasPagarFoco = lazy(() => import('./pages/ContasPagarFoco'))
const FluxoFuturo = lazy(() => import('./pages/FluxoFuturo'))
const Pendencias3112 = lazy(() => import('./pages/Pendencias3112'))
const Transacoes = lazy(() => import('./pages/Transacoes'))
const Estoque = lazy(() => import('./pages/Estoque'))
const Showroom = lazy(() => import('./pages/Showroom'))
const Sync = lazy(() => import('./pages/Sync'))
const Logs = lazy(() => import('./pages/Logs'))
const Settings = lazy(() => import('./pages/Settings'))
const Login = lazy(() => import('./pages/Login'))
const NotFound = lazy(() => import('./pages/NotFound'))

const LoadingFallback = () => (
  <div className="h-screen w-screen flex items-center justify-center">
    <div className="animate-pulse text-muted-foreground">Carregando...</div>
  </div>
)

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/contas-receber-foco" element={<ContasReceberFoco />} />
              <Route path="/contas-pagar-foco" element={<ContasPagarFoco />} />
              <Route path="/fluxo-futuro" element={<FluxoFuturo />} />
              <Route path="/pendencias-31-12" element={<Pendencias3112 />} />
              <Route path="/transacoes" element={<Transacoes />} />
              <Route path="/estoque" element={<Estoque />} />
              <Route path="/showroom" element={<Showroom />} />
              <Route path="/sync" element={<Sync />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </TooltipProvider>
    </BrowserRouter>
  </AuthProvider>
)

export default App
