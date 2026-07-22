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
import {
  Loader2,
  ShoppingCart,
  CalendarClock,
  HandCoins,
  Clock,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  fetchFinanceiro,
  computeKpisContasReceber,
  groupReceitaPorApropriacao,
  distinctAnos,
  filterFinanceiro,
  filterByDescricao,
  MESES,
  type FinanceiroRow,
} from '@/services/cash-flow'

const CORES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

const OUTROS = 'Outros'

function KpiCard({
  title,
  value,
  icon: Icon,
  tone = 'default',
  info,
}: {
  title: string
  value: string
  icon: typeof ShoppingCart
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

export default function ContasReceberFoco() {
  const [rows, setRows] = useState<FinanceiroRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ano, setAno] = useState<string | null>(null)
  const [mes, setMes] = useState<string | null>(null)
  const [apropriacaoSelecionada, setApropriacaoSelecionada] = useState<string | null>(null)

  useEffect(() => {
    fetchFinanceiro()
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Não foi possível carregar os dados.'))
      .finally(() => setIsLoading(false))
  }, [])

  const anos = useMemo(() => distinctAnos(rows), [rows])
  const filtradas = useMemo(() => filterFinanceiro(rows, ano, mes), [rows, ano, mes])
  const filtradasPorCategoria = useMemo(
    () => filterByDescricao(filtradas, apropriacaoSelecionada),
    [filtradas, apropriacaoSelecionada],
  )
  const kpis = useMemo(
    () => computeKpisContasReceber(filtradasPorCategoria),
    [filtradasPorCategoria],
  )
  const apropriacao = useMemo(() => groupReceitaPorApropriacao(filtradas), [filtradas])

  const toggleApropriacao = (descricao: string) => {
    if (descricao === OUTROS) return
    setApropriacaoSelecionada((prev) => (prev === descricao ? null : descricao))
  }

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
            Agenda de Recebimentos
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Segmentado por forma de recebimento (Descrição Apropriação).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {apropriacaoSelecionada && (
            <FilterChip
              label={apropriacaoSelecionada}
              onClear={() => setApropriacaoSelecionada(null)}
            />
          )}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Vendas à Vista"
          value={formatCurrency(kpis.vendasAVista)}
          icon={HandCoins}
        />
        <KpiCard
          title="Vendas a Prazo"
          value={formatCurrency(kpis.vendasAPrazo)}
          icon={CalendarClock}
        />
        <KpiCard
          title="Recebimentos Venda a Prazo"
          value={formatCurrency(kpis.recebimentosVendaAPrazo)}
          icon={ShoppingCart}
        />
        <KpiCard
          title="Em Aberto (Receber)"
          value={formatCurrency(kpis.emAbertoReceber)}
          icon={Clock}
          tone="warning"
          info="Valor acumulado total em aberto, não filtrado pelo período selecionado acima."
        />
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Receita Realizada por Descrição Apropriação</CardTitle>
        </CardHeader>
        <CardContent>
          {apropriacao.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Sem dados para este período.
            </p>
          ) : (
            <ChartContainer config={{}} className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={apropriacao}
                    dataKey="total"
                    nameKey="descricao"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                    cursor="pointer"
                    onClick={(d: any) => {
                      const descricao = d?.descricao as string | undefined
                      if (descricao) toggleApropriacao(descricao)
                    }}
                  >
                    {apropriacao.map((d, i) => (
                      <Cell
                        key={d.descricao}
                        fill={CORES[i % CORES.length]}
                        className="transition-opacity duration-200"
                        opacity={
                          apropriacaoSelecionada && apropriacaoSelecionada !== d.descricao
                            ? 0.35
                            : 1
                        }
                        stroke={
                          apropriacaoSelecionada === d.descricao
                            ? 'hsl(var(--foreground))'
                            : undefined
                        }
                        strokeWidth={apropriacaoSelecionada === d.descricao ? 2 : 0}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Clique numa fatia para filtrar os KPIs por essa apropriação ("Outros" agrega várias
            categorias e não é filtrável individualmente).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
