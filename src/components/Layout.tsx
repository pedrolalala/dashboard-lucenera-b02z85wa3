import { Outlet, Navigate } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { useAuth } from '@/hooks/use-auth'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { hexToHSL } from '@/lib/utils'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

function AcessoNegado() {
  const { signOut } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <ShieldAlert className="h-10 w-10 mx-auto text-destructive" />
        <h1 className="text-lg font-semibold">Acesso negado</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta não tem permissão para acessar o Dashboard Financeiro. Fale com um
          administrador se acredita que isso é um engano.
        </p>
        <Button variant="outline" className="w-full" onClick={() => signOut()}>
          Sair
        </Button>
      </div>
    </div>
  )
}

export default function Layout() {
  const { session, loading, empresaId, hasAccess } = useAuth()

  useEffect(() => {
    if (empresaId) {
      supabase
        .from('empresas')
        .select('cor_hex')
        .eq('id', empresaId)
        .single()
        .then(({ data }) => {
          if (data?.cor_hex) {
            document.documentElement.style.setProperty('--primary', hexToHSL(data.cor_hex))
          }
        })
    }
  }, [empresaId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (hasAccess === false) return <AcessoNegado />

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 p-4 md:p-8 overflow-auto bg-muted/30">
          <div className="mx-auto max-w-6xl animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
