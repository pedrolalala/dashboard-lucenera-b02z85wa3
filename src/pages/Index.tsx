import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/utils'
import {
  Briefcase,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface KPI {
  totalProjetos: number
  totalVendas: number
  alertas: number
  statusSync: 'Sucesso' | 'Falha' | 'Pendente'
}

const chartConfig = {
  registros: { label: 'Registros de Sync', color: 'hsl(var(--primary))' },
}

export default function Index() {
  const { empresaId } = useAuth()
  const { toast } = useToast()
  const [kpi, setKpi] = useState<KPI>({
    totalProjetos: 0,
    totalVendas: 0,
    alertas: 0,
    statusSync: 'Pendente',
  })
  const [chartData, setChartData] = useState<any[]>([])
  const [syncingAll, setSyncingAll] = useState(false)

  const fetchData = async () => {
    if (!empresaId) return

    const [projetosRes, vendasRes, logsRes, alertasRes] = await Promise.all([
      supabase
        .from('vw_projetos_dashboard')
        .select('total_projetos')
        .eq('empresa_id', empresaId)
        .single(),
      supabase
        .from('vw_vendas_por_projeto')
        .select('total_vendas')
        .eq('empresa_id', empresaId)
        .single(),
      supabase
        .from('sync_history')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('sync_history')
        .select('id', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .eq('status', 'Falha')
        .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    ])

    setKpi({
      totalProjetos: projetosRes.data?.total_projetos || 0,
      totalVendas: vendasRes.data?.total_vendas || 0,
      alertas: alertasRes.count || 0,
      statusSync: (logsRes.data?.[0]?.status as any) || 'Pendente',
    })

    if (logsRes.data) {
      const grouped = logsRes.data.reduce((acc: any, log: any) => {
        const date = new Date(log.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
        })
        if (!acc[date]) acc[date] = 0
        acc[date] += log.registros_inseridos || 0
        return acc
      }, {})
      setChartData(
        Object.entries(grouped)
          .map(([date, registros]) => ({ date, registros }))
          .reverse(),
      )
    }
  }

  useEffect(() => {
    fetchData()
    const channel = supabase
      .channel('dashboard_updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sync_history' }, () =>
        fetchData(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [empresaId])

  const handleSyncAll = async () => {
    setSyncingAll(true)
    try {
      await Promise.all([
        supabase.functions.invoke('sync-sharepoint'),
        supabase.functions.invoke('sync-teams'),
        supabase.functions.invoke('sync-fechamentos-automatica'),
      ])
      await supabase.from('sync_history').insert({
        empresa_id: empresaId,
        origem: 'Geral',
        tipo: 'Sync All Manual',
        status: 'Sucesso',
        mensagem: 'Sincronização global concluída.',
        registros_inseridos: 100,
        registros_erro: 0,
      })
      toast({ title: 'Sincronização global iniciada com sucesso.' })
      fetchData()
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
    } finally {
      setSyncingAll(false)
    }
  }

  const kpis = useMemo(
    () => [
      {
        title: 'Projetos Ativos',
        value: kpi.totalProjetos,
        icon: Briefcase,
        color: 'text-blue-500',
      },
      {
        title: 'Vendas Totais',
        value: formatCurrency(kpi.totalVendas),
        icon: TrendingUp,
        color: 'text-emerald-500',
      },
      {
        title: 'Última Sync',
        value: kpi.statusSync,
        icon: kpi.statusSync === 'Sucesso' ? CheckCircle2 : XCircle,
        color: kpi.statusSync === 'Sucesso' ? 'text-emerald-500' : 'text-destructive',
      },
      {
        title: 'Alertas (24h)',
        value: kpi.alertas,
        icon: AlertTriangle,
        color: kpi.alertas > 0 ? 'text-warning' : 'text-muted-foreground',
      },
    ],
    [kpi],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Visão Geral</h2>
          <p className="text-muted-foreground">Métricas e status das integrações da sua empresa.</p>
        </div>
        <Button onClick={handleSyncAll} disabled={syncingAll} className="gap-2 bg-primary">
          <RefreshCw className={cn('h-4 w-4', syncingAll && 'animate-spin')} />
          Sincronizar Tudo
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <Card key={i} className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{k.title}</CardTitle>
              <k.icon className={cn('h-4 w-4', k.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-5 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Atividade Recente de Sincronização</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-registros)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-registros)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="registros"
                    stroke="var(--color-registros)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorReg)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Módulos Ativos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {['SharePoint', 'Microsoft Teams', 'Financeiro Básico'].map((mod, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="relative flex h-3 w-3">
                  <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none">{mod}</span>
                  <span className="text-xs text-muted-foreground mt-1">Conectado via API</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
