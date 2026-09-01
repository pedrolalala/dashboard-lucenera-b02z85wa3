import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import FilterChip from '@/components/FilterChip'
import PeriodFilter from '@/components/PeriodFilter'
import PlanilhaTabela from '@/components/PlanilhaTabela'
import { COLUNAS_FINANCEIRO } from '@/components/colunasFinanceiro'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Loader2,
  TrendingUp,
  Wallet,
  PiggyBank,
  AlertTriangle,
  Activity,
  Scale,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  fetchFinanceiro,
  computeKpisVisaoGeral,
  computeFluxoDiario,
  computeCustoFixoVariavel,
  computePontoEquilibrio,
  filterFinanceiro,
  filterByTipoCusto,
  periodoAnterior,
  rangePreset,
  type FinanceiroRow,
  type Periodo,
} from '@/services/cash-flow'
import { fetchNecessidadeCompra, computeGastoFuturoInevitavel } from '@/services/necessidade-compra'

const chartConfig = {
  resultado: { label: 'Resultado Diário', color: 'hsl(var(--chart-1))' },
  saldoAcumulado: { label: 'Saldo Acumulado', color: 'hsl(var(--chart-3))' },
}

type TipoCusto = 'fixo' | 'variavel' | 'outro'

const CORES_CUSTO: Record<TipoCusto, string> = {
  fixo: 'hsl(var(--chart-2))',
  variavel: 'hsl(var(--chart-1))',
  outro: 'hsl(var(--chart-4))',
}

const LABEL_CUSTO: Record<TipoCusto, string> = {
  fixo: 'Fixo',
  variavel: 'Variável',
  outro: 'Outro',
}

function DeltaBadge({
  atual,
  anterior,
  invert = false,
}: {
  atual: number
  anterior: number
  invert?: boolean
}) {
  if (!anterior) return null
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100
  const subiu = pct >= 0
  const positivo = invert ? !subiu : subiu
  const Icon = subiu ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        positivo ? 'text-emerald-500' : 'text-destructive',
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}% vs período anterior
    </span>
  )
}

function KpiCard({
  title,
  value,
  icon: Icon,
  highlight,
  delta,
}: {
  title: string
  value: string
  icon: typeof Wallet
  highlight?: boolean
  delta?: React.ReactNode
}) {
  return (
    <Card
      className={cn(
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        highlight ? 'border-primary/60 shadow-md' : 'border-border/60 shadow-sm',
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={highlight ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-muted-foreground'} />
      </CardHeader>
      <CardContent>
        <div className={highlight ? 'text-2xl font-bold text-primary' : 'text-2xl font-bold'}>
          {value}
        </div>
        {delta && <div className="mt-1">{delta}</div>}
      </CardContent>
    </Card>
  )
}

export default function Index() {
  const [rows, setRows] = useState<FinanceiroRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // SPEC-041: abre no mês atual. SPEC-126: filtro agora é intervalo livre De/Até
  // + escolha da coluna de data (pagamento por padrão, para "realizado").
  const [periodo, setPeriodo] = useState<Periodo>(() => ({
    ...rangePreset('mes-atual'),
    campo: 'dt_pagamento',
  }))
  const [tipoCustoSelecionado, setTipoCustoSelecionado] = useState<TipoCusto | null>(null)
  const [gastoFuturoInevitavel, setGastoFuturoInevitavel] = useState<number | null>(null)

  useEffect(() => {
    fetchFinanceiro()
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Não foi possível carregar os dados financeiros.'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    fetchNecessidadeCompra()
      .then((necessidadeRows) => setGastoFuturoInevitavel(computeGastoFuturoInevitavel(necessidadeRows)))
      .catch(() => setGastoFuturoInevitavel(null))
  }, [])

  const filtradas = useMemo(() => filterFinanceiro(rows, periodo), [rows, periodo])
  const filtradasPorCategoria = useMemo(
    () => filterByTipoCusto(filtradas, tipoCustoSelecionado),
    [filtradas, tipoCustoSelecionado],
  )

  // Receitas Realizadas e Resultado Operacional sempre no total geral (decisão
  // do usuário 16/07 — clique numa categoria de despesa não zera Receitas).
  const kpis = useMemo(() => computeKpisVisaoGeral(filtradas), [filtradas])
  const kpisDespesaFiltrada = useMemo(
    () => computeKpisVisaoGeral(filtradasPorCategoria),
    [filtradasPorCategoria],
  )
  const fluxo = useMemo(
    () => computeFluxoDiario(filtradas, filtradasPorCategoria),
    [filtradas, filtradasPorCategoria],
  )
  const custoFixoVariavel = useMemo(() => computeCustoFixoVariavel(filtradas), [filtradas])
  const pontoEquilibrio = useMemo(() => computePontoEquilibrio(filtradas), [filtradas])
  const dadosCustoFixoVariavel = useMemo(
    () =>
      (['fixo', 'variavel', 'outro'] as const)
        .map((chave) => ({
          chave,
          nome: LABEL_CUSTO[chave],
          valor: custoFixoVariavel[chave],
          cor: CORES_CUSTO[chave],
        }))
        .filter((d) => d.valor > 0),
    [custoFixoVariavel],
  )

  // Comparativo vs período anterior — janela de mesmo tamanho imediatamente
  // antes do intervalo. Só quando há intervalo fechado (De e Até definidos).
  const anterior = useMemo(() => periodoAnterior(periodo), [periodo])
  const kpisAnterior = useMemo(() => {
    if (!anterior) return null
    return computeKpisVisaoGeral(filterFinanceiro(rows, anterior))
  }, [rows, anterior])

  const margemOperacional =
    kpis.receitasRealizadas > 0 ? (kpis.resultadoOperacional / kpis.receitasRealizadas) * 100 : null

  const toggleTipoCusto = (chave: TipoCusto) =>
    setTipoCustoSelecionado((prev) => (prev === chave ? null : chave))

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
          <p className="font-medium">Erro ao carregar dados financeiros</p>
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
            Fluxo de Caixa Realizado
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Fluxo de caixa realizado — dados ao vivo do Supabase (v_financeiro_realizado).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {tipoCustoSelecionado && (
            <FilterChip
              label={LABEL_CUSTO[tipoCustoSelecionado]}
              onClear={() => setTipoCustoSelecionado(null)}
            />
          )}
          <PeriodFilter value={periodo} onChange={setPeriodo} />
        </div>
      </div>

      {/* Hero: o dado mais importante para a Diretoria (bottom-line) lido primeiro. */}
      <Card className="border-2 border-primary/50 bg-gradient-to-br from-primary/10 via-card to-card shadow-lg transition-all duration-200 hover:shadow-xl">
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Resultado Operacional
              </p>
              <p className="text-4xl font-bold text-primary mt-1">
                {formatCurrency(kpis.resultadoOperacional)}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                {margemOperacional !== null && (
                  <span className="text-xs text-muted-foreground">
                    Margem operacional:{' '}
                    <span className="font-semibold text-foreground">
                      {margemOperacional.toFixed(1)}%
                    </span>
                  </span>
                )}
                {kpisAnterior && (
                  <DeltaBadge
                    atual={kpis.resultadoOperacional}
                    anterior={kpisAnterior.resultadoOperacional}
                  />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Receitas Realizadas"
          value={formatCurrency(kpis.receitasRealizadas)}
          icon={TrendingUp}
          delta={
            kpisAnterior && (
              <DeltaBadge
                atual={kpis.receitasRealizadas}
                anterior={kpisAnterior.receitasRealizadas}
              />
            )
          }
        />
        <KpiCard
          title={
            tipoCustoSelecionado
              ? `Despesa Operacional (${LABEL_CUSTO[tipoCustoSelecionado]})`
              : 'Despesa Operacional Total'
          }
          value={formatCurrency(kpisDespesaFiltrada.despesaOperacionalTotal)}
          icon={Wallet}
          highlight={!!tipoCustoSelecionado}
          delta={
            !tipoCustoSelecionado &&
            kpisAnterior && (
              <DeltaBadge
                atual={kpis.despesaOperacionalTotal}
                anterior={kpisAnterior.despesaOperacionalTotal}
                invert
              />
            )
          }
        />
        <KpiCard
          title="Distribuição de Lucro"
          value={formatCurrency(kpis.distribuicaoLucroTotal)}
          icon={PiggyBank}
          delta={
            kpisAnterior && (
              <DeltaBadge
                atual={kpis.distribuicaoLucroTotal}
                anterior={kpisAnterior.distribuicaoLucroTotal}
              />
            )
          }
        />
      </div>

      {/*
        SPEC-041 (reunião 21/07/2026, Filippo): "Necessidade de Compra" é um gasto
        futuro inevitável — nunca deve ser somado ao Resultado Operacional/KPIs
        realizados acima. Card separado e com tom visual distinto (violeta) para
        deixar essa distinção óbvia.
      */}
      <Card className="border-2 border-violet-500/40 bg-violet-500/5 shadow-sm transition-all duration-200 hover:shadow-md">
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
              <ShoppingCart className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Necessidade de Compra (Gasto Futuro Inevitável)
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Déficit líquido de estoque a repor, valorizado ao custo — separado do fluxo de
                caixa realizado acima.
              </p>
            </div>
          </div>
          <p className="text-2xl font-bold text-violet-500">
            {gastoFuturoInevitavel === null ? '—' : formatCurrency(gastoFuturoInevitavel)}
          </p>
        </CardContent>
      </Card>

      <Card
        className={cn(
          'border-2 shadow-sm transition-colors duration-200',
          pontoEquilibrio.atingiuPontoEquilibrio
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-destructive/50 bg-destructive/5',
        )}
      >
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {pontoEquilibrio.atingiuPontoEquilibrio ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-8 w-8 text-destructive shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5" /> Ponto de Equilíbrio (Custo Fixo)
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receita precisa cobrir {formatCurrency(pontoEquilibrio.custoFixo)} de custo fixo no
                período — aproximação simplificada, não considera margem por produto. Sempre no
                total geral, independente do filtro de categoria.
              </p>
            </div>
          </div>
          <div className="text-right">
            <p
              className={cn(
                'text-2xl font-bold',
                pontoEquilibrio.atingiuPontoEquilibrio ? 'text-emerald-500' : 'text-destructive',
              )}
            >
              {pontoEquilibrio.resultado >= 0 ? '+' : ''}
              {formatCurrency(pontoEquilibrio.resultado)}
            </p>
            <p className="text-xs text-muted-foreground">
              {pontoEquilibrio.atingiuPontoEquilibrio
                ? 'Acima do ponto de equilíbrio'
                : 'Abaixo do ponto de equilíbrio'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Custo Operacional: Fixo × Variável</CardTitle>
        </CardHeader>
        <CardContent>
          {dadosCustoFixoVariavel.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Sem dados de custo operacional para este período.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dadosCustoFixoVariavel}
                    dataKey="valor"
                    nameKey="nome"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    cursor="pointer"
                    onClick={(d: any) => {
                      const chave = d?.chave as TipoCusto | undefined
                      if (chave) toggleTipoCusto(chave)
                    }}
                  >
                    {dadosCustoFixoVariavel.map((d) => (
                      <Cell
                        key={d.chave}
                        fill={d.cor}
                        className="transition-opacity duration-200"
                        opacity={
                          tipoCustoSelecionado && tipoCustoSelecionado !== d.chave ? 0.35 : 1
                        }
                        stroke={
                          tipoCustoSelecionado === d.chave ? 'hsl(var(--foreground))' : undefined
                        }
                        strokeWidth={tipoCustoSelecionado === d.chave ? 2 : 0}
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
            Clique numa fatia para filtrar a Despesa Operacional Total e o fluxo diário por esse
            tipo de custo. Classificação Fixo/Variável por centro de custo é um default proposto
            (reunião 13/07/2026), pendente de validação.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Saldo Acumulado Realizado (Operacional)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fluxo} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-saldoAcumulado)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-saldoAcumulado)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis
                  dataKey="dia"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  minTickGap={40}
                />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="saldoAcumulado"
                  stroke="var(--color-saldoAcumulado)"
                  strokeWidth={2}
                  fill="url(#colorSaldo)"
                  animationDuration={300}
                />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
          {tipoCustoSelecionado && (
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Despesa considera só "{LABEL_CUSTO[tipoCustoSelecionado]}" — Receita permanece no
              total geral.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            Resultado Diário (Receita − Despesa Operacional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fluxo} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis
                  dataKey="dia"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  minTickGap={40}
                />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="resultado"
                  stroke="var(--color-resultado)"
                  strokeWidth={2}
                  fill="var(--color-resultado)"
                  fillOpacity={0.15}
                  animationDuration={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <PlanilhaTabela
        titulo="Planilha — lançamentos do período"
        descricao="Todas as linhas de v_financeiro_realizado no intervalo e perfil selecionados. Confira com o export do Connect / a planilha do Sérgio; a coluna Duplicata é a chave de match. Baixe o CSV para comparar."
        colunas={COLUNAS_FINANCEIRO}
        rows={filtradas}
        nomeArquivo="fluxo-caixa"
        chaveLinha={(r) => r.id}
      />
    </div>
  )
}
