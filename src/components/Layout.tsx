import { Outlet, Navigate } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { useAuth } from '@/hooks/use-auth'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { hexToHSL } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export default function Layout() {
  const { session, loading, empresaId } = useAuth()

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
