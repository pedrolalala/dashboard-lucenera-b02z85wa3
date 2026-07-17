import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import ContasReceberFoco from './pages/ContasReceberFoco'
import ContasPagarFoco from './pages/ContasPagarFoco'
import Estoque from './pages/Estoque'
import Sync from './pages/Sync'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import { AuthProvider } from './hooks/use-auth'

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/contas-receber-foco" element={<ContasReceberFoco />} />
            <Route path="/contas-pagar-foco" element={<ContasPagarFoco />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/sync" element={<Sync />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AuthProvider>
)

export default App
