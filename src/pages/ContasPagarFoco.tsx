import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import FilterChip from '@/components/FilterChip'
import { formatCurrency, cn } from '@/lib/utils'
import { Loader2, Package, Wallet, Clock, AlertTriangle, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import {
  fetchFinanceiro,
  computeKpisContasPagar,
  groupDespesaPorSubGrupo,
  computePrevistoPagarPorDia,
  distinctAnos,
  filterFinanceiro,
  filterByDescSubGrupo,
  filterByPerfil,
  MESES,
  type FinanceiroRow,
} from '@/services/cash-flow'

const chartConfig = {
  total: { label: 'Total', color: 'hsl(var(--chart-2))' },
  previsto: { label: 'Previsto', color: 'hsl(var(--chart-5))' },
}

function KpiCard({
  title,
  value,
  icon: Icon,
  tone = 'default',
  info,
}: {
  title: string
  value: string
  icon: typeof Package
  tone?: 'default' | 'warning'
  info?: string
}) {
  return (
    <Card
      className={cn(
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        tone === 'warning'
          ? 'border-amber-500/40 bg-amber-500/5 shadow-sm'
          : 'border-border/60 shadow-sm',
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          {title}
          {info && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px]">{info}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <Icon className={cn('h-4 w-4', tone === 'warning' ? 'text-amber-500' : 'text-primary')} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', tone === 'warning' && 'text-amber-500')}>
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ContasPagarFoco() {
  const [rows, setRows] = useState<FinanceiroRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // SPEC-041: default no mês/ano atuais, mas os Selects abaixo continuam editáveis.
  const [ano, setAno] = useState<string | null>(String(new Date().getFullYear()))
  const [mes, setMes] = useState<string | null>(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [perfil, setPerfil] = useState<string | null>(null)
  const [subGrupoSelecionado, setSubGrupoSelecionado] = useState<string | null>(null)

  useEffect(() => {
    fetchFinanceiro()
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Não foi possível carregar os dados.'))
      .finally(() => setIsLoading(false))
  }, [])

  const anos = useMemo(() => distinctAnos(rows), [rows])
  const filtradasPorPeriodo = useMemo(() => filterFinanceiro(rows, ano, mes), [rows, ano, mes])
  const filtradas = useMemo(
    () => filterByPerfil(filtradasPorPeriodo, perfil),
    [filtradasPorPeriodo, perfil],
  )
  const filtradasPorCategoria = useMemo(
    () => filterByDescSubGrupo(filtradas, subGrupoSelecionado),
    [filtradas, subGrupoSelecionado],
  )
  const kpis = useMemo(() => computeKpisContasPagar(filtradasPorCategoria), [filtradasPorCategoria])
  // "Em Aberto" é sempre o total acumulado, nunca filtrado por Ano/Mês (decisão
  // reafirmada 22/07/2026 — evita a sensação de que os números "não batem").
  const kpisTotal = useMemo(() => computeKpisContasPagar(rows), [rows])
  const subGrupos = useMemo(() => groupDespesaPorSubGrupo(filtradas), [filtradas])
  const previsto = useMemo(
    () => computePrevistoPagarPorDia(filtradasPorCategoria).slice(0, 60),
    [filtradasPorCategoria],
  )

  const toggleSubGrupo = (grupo: string) =>
    setSubGrupoSelecionado((prev) => (prev === grupo ? null : grupo))

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-10 flex flex-col items-center text-center gap-2">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p className="font-medium">Erro ao carregar dados</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light uppercase tracking-widest text-foreground">
            Agenda de Pagamentos
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Segmentado por centro de custo (DescSubGrupo).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {subGrupoSelecionado && (
            <FilterChip label={subGrupoSelecionado} onClear={() => setSubGrupoSelecionado(null)} />
          )}
          <Select
            value={perfil ?? 'todos'}
            onValueChange={(v) => setPerfil(v === 'todos' ? null : v)}
          >
            <SelectTrigger className="w-[140px] text-foreground">
              <SelectValue placeholder="Perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ribeirao">Ribeirão</SelectItem>
              <SelectItem value="sao_paulo">São Paulo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ano ?? 'todos'} onValueChange={(v) => setAno(v === 'todos' ? null : v)}>
            <SelectTrigger className="w-[120px] text-foreground">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os anos</SelectItem>
              {anos.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mes ?? 'todos'} onValueChange={(v) => setMes(v === 'todos' ? null : v)}>
            <SelectTrigger className="w-[150px] text-foreground">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {MESES.map((label, i) => (
                <SelectItem key={label} value={String(i + 1).padStart(2, '0')}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Despesas com Material"
          value={formatCurrency(kpis.despesasComMaterial)}
          icon={Package}
        />
        <KpiCard
          title="Custo Operacional"
          value={formatCurrency(kpis.custoOperacional)}
          icon={Wallet}
        />
        <KpiCard
          title="Em Aberto (Pagar)"
          value={formatCurrency(kpisTotal.emAbertoPagar)}
          icon={Clock}
          tone="warning"
          info="Valor acumulado total em aberto, não filtrado pelo período selecionado acima."
        />
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Despesa Operacional por Centro de Custo</CardTitle>
        </CardHeader>
        <CardContent>
          {subGrupos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Sem dados para este período.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={subGrupos}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                  onClick={(e: any) => {
                    const grupo = e?.activePayload?.[0]?.payload?.desc_sub_grupo
                    if (grupo) toggleSubGrupo(grupo)
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="desc_sub_grupo"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={140}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} cursor="pointer">
                    {subGrupos.map((s) => (
                      <Cell
                        key={s.desc_sub_grupo}
                        fill="var(--color-total)"
                        className="transition-opacity duration-200"
                        opacity={
                          subGrupoSelecionado && subGrupoSelecionado !== s.desc_sub_grupo ? 0.35 : 1
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Clique numa barra (ou numa linha da tabela abaixo) para filtrar os KPIs e o previsto em
            aberto por esse centro de custo.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Previsto em Aberto por Data de Vencimento</CardTitle>
        </CardHeader>
        <CardContent>
          {previsto.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Nenhum valor em aberto nesta seleção.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={previsto} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis
                    dataKey="dia"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    minTickGap={30}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="previsto"
                    stroke="var(--color-previsto)"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={300}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Centros de custo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">DescSubGrupo</th>
                <th className="text-right px-4 py-2">Despesa Operacional</th>
              </tr>
            </thead>
            <tbody>
              {subGrupos.map((s) => (
                <tr
                  key={s.desc_sub_grupo}
                  onClick={() => toggleSubGrupo(s.desc_sub_grupo)}
                  className={cn(
                    'border-t border-border/40 cursor-pointer hover:bg-muted/20 transition-colors',
                    subGrupoSelecionado === s.desc_sub_grupo && 'bg-primary/10',
                  )}
                >
                  <td className="px-4 py-2">{s.desc_sub_grupo}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
