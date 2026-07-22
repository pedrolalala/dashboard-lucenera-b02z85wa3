import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Landmark,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  RefreshCw,
  History,
  Settings,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const itemsFinanceiro = [
  { title: 'Fluxo de Caixa Realizado (Mês Atual)', url: '/', icon: LayoutDashboard },
  { title: 'Agenda de Recebimentos', url: '/contas-receber-foco', icon: ArrowDownCircle },
  { title: 'Agenda de Pagamentos', url: '/contas-pagar-foco', icon: ArrowUpCircle },
]

const itemsEstoque = [{ title: 'Estoque', url: '/estoque', icon: Boxes }]

const itemsSistema = [
  { title: 'Sincronização', url: '/sync', icon: RefreshCw },
  { title: 'Histórico', url: '/logs', icon: History },
  { title: 'Configurações', url: '/settings', icon: Settings },
]

type NavItem = { title: string; url: string; icon: React.ElementType }

function NavGroup({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
            <Link to={item.url} className="flex items-center gap-3 py-2 transition-colors">
              <item.icon size={18} />
              <span className="font-medium">{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

export function AppSidebar() {
  const { pathname } = useLocation()

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="flex flex-row items-center gap-3 p-4 border-b border-sidebar-border/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Landmark size={18} />
        </div>
        <span className="text-lg font-semibold tracking-tight">Dashboard Lucenera</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider mt-4">
            Financeiro
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavGroup items={itemsFinanceiro} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider mt-2">
            Operações
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavGroup items={itemsEstoque} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider mt-2">
            Sistema
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavGroup items={itemsSistema} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/50">
        <div className="p-4 text-xs text-muted-foreground font-medium text-center">
          © 2026 Lucenera
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
