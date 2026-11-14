import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import FilterChip from '@/components/FilterChip'
import PeriodFilter from '@/components/PeriodFilter'
import MesSelect from '@/components/MesSelect'
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
  computeInvestimentoRealizado,
  computeCustosPorCategoria,
  type CategoriaCustoId,
  filterFinanceiro,
  filterByTipoCusto,
  periodoAnterior,
  rangePreset,
  mesesPresentes,
  intervaloDoMes,
  mesDoPeriodo,
  type FinanceiroRow,
  type Periodo,
} from '@/services/cash-flow'
import { fetchNecessidadeCompra, computeGastoFuturoInevitavel } from '@/services/necessidade-compra'
import { supabase } from '@/lib/supabase/client'

const chartConfig = {
  resultado: { label: 'Resultado Diário', color: 'hsl(var(--chart-1))' },
  saldoAcumulado: { label: 'Saldo Acumulado', color: 'hsl(var(--chart-3))' },
}

type TipoCusto = 'fixo' | 'variavel'

const CORES_CUSTO: Record<TipoCusto, string> = {
  fixo: 'hsl(var(--chart-2))',
  variavel: 'hsl(var(--chart-1))',
}

const LABEL_CUSTO: Record<TipoCusto, string> = {
  fixo: 'Fixo',
  variavel: 'Variável',
}

// SPEC-286: uma cor fixa por categoria, para a fatia não mudar de cor quando muda o período.
const CORES_CATEGORIA: Record<CategoriaCustoId, string> = {
  produtos: '#1e293b',
  impostos: '#b45309',
  comissoes: '#0f766e',
  rt: '#7c3aed',
  fretes: '#0369a1',
  pessoal: '#d4a72c',
  estrutura: '#64748b',
  veiculos: '#be123c',
  marketing: '#db2777',
  socios: '#4d7c0f',
  investimentos: '#0891b2',
  outros: '#a8a29e',
}

/** Eixo dos gráficos: valor curto ("250 mil", "1,2 mi") para caber sem cortar. */
function formatEixo(v: number): string {
  const abs = Math.abs(v)
  const sinal = v < 0 ? '-' : ''
  if (abs >= 1_000_000)
    return `${sinal}${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000) return `${sinal}${Math.round(abs / 1_000).toLocaleString('pt-BR')} mil`
  return `${sinal}${Math.round(abs)}`
}

const formatPct = (fracao: number) =>
  `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

// SPEC-286: o ponto de equilíbrio usa sempre os últimos 12 meses FECHADOS, não o filtro da tela.
// Um mês em andamento (o padrão da tela) tem receita e despesa pela metade e daria um número sem
// sentido; 12 meses pegam 13º, férias e a sazonalidade das vendas.
const MESES_EQUILIBRIO = 12

function janelaEquilibrio(): { de: string; ate: string; rotulo: string } {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - MESES_EQUILIBRIO, 1)
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const mesAno = (d: Date) =>
    d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')
  return { de: iso(inicio), ate: iso(fim), rotulo: `${mesAno(inicio)} a ${mesAno(fim)}` }
}

// SPEC-286: rótulo fora da fatia ("Produtos 46,5%") com linha de chamada. Fatia com menos de 3%
// fica sem rótulo no gráfico (os textos se sobreporiam) — ela aparece na legenda ao lado.
const PCT_MINIMO_ROTULO = 0.03

function rotuloFatia(props: any) {
  const { cx, cy, midAngle, outerRadius, percent, name } = props
  if (percent < PCT_MINIMO_ROTULO) return null
  const rad = (-midAngle * Math.PI) / 180
  const r = outerRadius + 26
  const x = cx + r * Math.cos(rad)
  const y = cy + r * Math.sin(rad)
  return (
    <text
      x={x}
      y={y}
      textAnchor={x >= cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="fill-foreground"
      fontSize={12}
    >
      {name} {formatPct(percent)}
    </text>
  )
}

function linhaFatia(props: any) {
  const pontos = props.points as { x: number; y: number }[] | undefined
  if (props.percent < PCT_MINIMO_ROTULO || !pontos || pontos.length < 2) return <g />
  return (
    <path
      d={`M${pontos[0].x},${pontos[0].y}L${pontos[1].x},${pontos[1].y}`}
      fill="none"
      stroke="hsl(var(--muted-foreground))"
    />
  )
}

/** Legenda ao lado da pizza: cor, nome, valor e peso de cada fatia. */
function LegendaPizza({
  itens,
  selecionado,
  onClick,
}: {
  itens: { chave: string; nome: string; valor: number; cor: string }[]
  selecionado?: string | null
  onClick?: (chave: string) => void
}) {
  const total = itens.reduce((soma, i) => soma + i.valor, 0)
  return (
    <ul className="space-y-1.5 text-sm">
      {itens.map((i) => (
        <li
          key={i.chave}
          onClick={onClick ? () => onClick(i.chave) : undefined}
          className={cn(
            'flex items-center gap-2 rounded px-1.5 py-0.5',
            onClick && 'cursor-pointer hover:bg-muted/50',
            selecionado === i.chave && 'bg-muted font-semibold',
            selecionado && selecionado !== i.chave && 'opacity-50',
          )}
        >
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: i.cor }} />
          <span className="flex-1 truncate">{i.nome}</span>
          <span className="tabular-nums text-muted-foreground">{formatCurrency(i.valor)}</span>
          <span className="w-14 text-right tabular-nums font-medium">
            {total > 0 ? formatPct(i.valor / total) : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
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
  // SPEC-195 F2 (reunião 30.03, Filippo): Distribuição de Lucro só para Filippo, Pedro e
  // Vinícius. O banco já filtra as linhas (migration 196); aqui só some o cartão.
  const [podeVerDistribuicao, setPodeVerDistribuicao] = useState(false)

  useEffect(() => {
    supabase
      .rpc('pode_ver_distribuicao_lucro' as any)
      .then(({ data }) => setPodeVerDistribuicao(data === true))
  }, [])

  useEffect(() => {
    fetchFinanceiro()
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Não foi possível carregar os dados financeiros.'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    fetchNecessidadeCompra()
      .then((necessidadeRows) =>
        setGastoFuturoInevitavel(computeGastoFuturoInevitavel(necessidadeRows)),
      )
      .catch(() => setGastoFuturoInevitavel(null))
  }, [])

  const filtradas = useMemo(() => filterFinanceiro(rows, periodo), [rows, periodo])
  const meses = useMemo(() => mesesPresentes(rows, periodo.campo), [rows, periodo.campo])
  const investimento = useMemo(() => computeInvestimentoRealizado(filtradas), [filtradas])
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
  const janelaPE = useMemo(() => janelaEquilibrio(), [])
  const pontoEquilibrio = useMemo(
    () =>
      computePontoEquilibrio(
        filterFinanceiro(rows, { de: janelaPE.de, ate: janelaPE.ate, campo: 'dt_pagamento' }),
      ),
    [rows, janelaPE],
  )
  const dadosCustoFixoVariavel = useMemo(
    () =>
      (['fixo', 'variavel'] as const)
        .map((chave) => ({
          chave,
          nome: LABEL_CUSTO[chave],
          valor: custoFixoVariavel[chave],
          cor: CORES_CUSTO[chave],
        }))
        .filter((d) => d.valor > 0),
    [custoFixoVariavel],
  )

  const custosPorCategoria = useMemo(() => computeCustosPorCategoria(filtradas), [filtradas])

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
          <MesSelect
            meses={meses}
            value={mesDoPeriodo(periodo)}
            onChange={(mes) => mes && setPeriodo({ ...periodo, ...intervaloDoMes(mes) })}
          />
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

      <div
        className={cn(
          'grid grid-cols-1 gap-4',
          podeVerDistribuicao ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
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
        {podeVerDistribuicao && (
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
        )}
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
                Déficit líquido de estoque a repor, valorizado ao custo — separado do fluxo de caixa
                realizado acima.
              </p>
            </div>
          </div>
          <p className="text-2xl font-bold text-violet-500">
            {gastoFuturoInevitavel === null ? '—' : formatCurrency(gastoFuturoInevitavel)}
          </p>
        </CardContent>
      </Card>

      {/* SPEC-286: ponto de equilíbrio real — quanto é preciso receber por mês para pagar custos
          fixos e distribuição de lucro, com a margem de contribuição dos últimos 12 meses fechados. */}
      <Card
        className={cn(
          'border-2 shadow-sm transition-colors duration-200',
          pontoEquilibrio.receitaEquilibrio === null
            ? 'border-border/60'
            : pontoEquilibrio.atingiuPontoEquilibrio
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-destructive/50 bg-destructive/5',
        )}
      >
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {pontoEquilibrio.atingiuPontoEquilibrio ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="h-8 w-8 text-destructive shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5" /> Ponto de Equilíbrio — quanto receber por mês
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receita mensal necessária para pagar os custos fixos
                  {podeVerDistribuicao ? ' e a distribuição de lucro' : ''}, depois dos custos
                  variáveis (produto, imposto, comissão, RT, frete). Média de {janelaPE.rotulo};
                  não muda com o filtro de período.
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold tabular-nums">
                {pontoEquilibrio.receitaEquilibrio === null
                  ? '—'
                  : formatCurrency(pontoEquilibrio.receitaEquilibrio / MESES_EQUILIBRIO)}
              </p>
              <p className="text-xs text-muted-foreground">por mês</p>
            </div>
          </div>

          {pontoEquilibrio.receitaEquilibrio === null ? (
            <p className="text-xs text-muted-foreground">
              Não há como calcular: nos últimos 12 meses não houve receita, ou os custos variáveis
              foram maiores que a receita.
            </p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Recebido por mês (média)</p>
                <p className="font-semibold tabular-nums">
                  {formatCurrency(pontoEquilibrio.receitaRealizada / MESES_EQUILIBRIO)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {pontoEquilibrio.atingiuPontoEquilibrio
                    ? 'Sobra por mês'
                    : 'Falta receber por mês'}
                </p>
                <p
                  className={cn(
                    'font-semibold tabular-nums',
                    pontoEquilibrio.atingiuPontoEquilibrio ? 'text-emerald-500' : 'text-destructive',
                  )}
                >
                  {formatCurrency(Math.abs(pontoEquilibrio.diferenca ?? 0) / MESES_EQUILIBRIO)}
                  {pontoEquilibrio.receitaRealizada > 0 &&
                    ` (${formatPct(Math.abs(pontoEquilibrio.diferenca ?? 0) / pontoEquilibrio.receitaRealizada)})`}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Margem de contribuição</p>
                <p className="font-semibold tabular-nums">
                  {formatPct(pontoEquilibrio.margemContribuicao ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  A cobrir por mês: fixos{podeVerDistribuicao ? ' + distribuição' : ''}
                </p>
                <p className="font-semibold tabular-nums">
                  {formatCurrency(pontoEquilibrio.custoFixo / MESES_EQUILIBRIO)}
                  {podeVerDistribuicao &&
                    ` + ${formatCurrency(pontoEquilibrio.distribuicaoLucro / MESES_EQUILIBRIO)}`}
                </p>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Conta: (custos fixos{podeVerDistribuicao ? ' + distribuição de lucro' : ''}) ÷ margem de
            contribuição. Custos fixos incluem pessoal, estrutura, veículos, marketing, despesas dos
            sócios e investimentos. Base caixa: vale o que foi recebido e pago.
            {!podeVerDistribuicao && ' Não inclui a distribuição de lucro.'}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Custo Operacional</CardTitle>
        </CardHeader>
        <CardContent>
          {dadosCustoFixoVariavel.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Sem dados de custo operacional para este período.
            </p>
          ) : (
            <div className="space-y-8">
              <div>
                <p className="text-sm font-medium mb-1">Fixo × Variável</p>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-center gap-6">
                  <ChartContainer config={chartConfig} className="h-[380px] w-full aspect-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 20, right: 90, bottom: 20, left: 90 }}>
                        <Pie
                          data={dadosCustoFixoVariavel}
                          dataKey="valor"
                          nameKey="nome"
                          innerRadius={75}
                          outerRadius={125}
                          paddingAngle={2}
                          cursor="pointer"
                          label={rotuloFatia}
                          labelLine={linhaFatia}
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
                                tipoCustoSelecionado === d.chave
                                  ? 'hsl(var(--foreground))'
                                  : undefined
                              }
                              strokeWidth={tipoCustoSelecionado === d.chave ? 2 : 0}
                            />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  <LegendaPizza
                    itens={dadosCustoFixoVariavel}
                    selecionado={tipoCustoSelecionado}
                    onClick={(chave) => toggleTipoCusto(chave as TipoCusto)}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Por categoria</p>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-center gap-6">
                  <ChartContainer config={chartConfig} className="h-[420px] w-full aspect-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 20, right: 150, bottom: 20, left: 150 }}>
                        <Pie
                          data={custosPorCategoria}
                          dataKey="total"
                          nameKey="nome"
                          innerRadius={80}
                          outerRadius={135}
                          paddingAngle={1}
                          label={rotuloFatia}
                          labelLine={linhaFatia}
                        >
                          {custosPorCategoria.map((c) => (
                            <Cell key={c.id} fill={CORES_CATEGORIA[c.id]} strokeWidth={0} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  <LegendaPizza
                    itens={custosPorCategoria.map((c) => ({
                      chave: c.id,
                      nome: c.nome,
                      valor: c.total,
                      cor: CORES_CATEGORIA[c.id],
                    }))}
                  />
                </div>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Clique numa fatia (ou na legenda) de Fixo × Variável para filtrar a Despesa Operacional Total e o fluxo
            diário por esse tipo de custo.
          </p>

          {/* SPEC-286: lista das categorias — valor, peso no custo e na receita, e o que compõe. */}
          {custosPorCategoria.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground">
                    <th className="py-2 pr-2 text-left font-medium">Categoria</th>
                    <th className="py-2 px-2 text-left font-medium">Tipo</th>
                    <th className="py-2 px-2 text-right font-medium">Valor</th>
                    <th className="py-2 px-2 text-right font-medium">% do custo</th>
                    <th className="py-2 pl-2 text-right font-medium">% da receita</th>
                  </tr>
                </thead>
                <tbody>
                  {custosPorCategoria.map((c) => (
                    <tr key={c.id} className="border-b border-border/40 align-top">
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: CORES_CATEGORIA[c.id] }}
                          />
                          {c.nome}
                        </span>
                        <span className="block pl-[18px] text-[11px] text-muted-foreground">
                          {c.itens
                            .slice(0, 5)
                            .map((i) => `${i.descricao} ${formatCurrency(i.total)}`)
                            .join(' · ')}
                          {c.itens.length > 5 && ` · mais ${c.itens.length - 5}`}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {LABEL_CUSTO[c.tipo]}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {formatCurrency(c.total)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {kpis.despesaOperacionalTotal > 0
                          ? formatPct(c.total / kpis.despesaOperacionalTotal)
                          : '—'}
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums">
                        {kpis.receitasRealizadas > 0
                          ? formatPct(c.total / kpis.receitasRealizadas)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-2" colSpan={2}>
                      Despesa Operacional Total
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatCurrency(kpis.despesaOperacionalTotal)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">100,0%</td>
                    <td className="py-2 pl-2 text-right tabular-nums">
                      {kpis.receitasRealizadas > 0
                        ? formatPct(kpis.despesaOperacionalTotal / kpis.receitasRealizadas)
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SPEC-127 Escopo 3: Investimento destacado abaixo do fixo × variável — sem card no
              topo, sem gráfico (Vinícius, 03/09). */}
          <div className="mt-4 flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Investimento (no período)</p>
              <p className="text-[11px] text-muted-foreground">
                Gasto do grupo Investimento — já está dentro da Despesa Operacional, das categorias
                acima e do Ponto de Equilíbrio.
              </p>
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">
              {formatCurrency(investimento)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Saldo Acumulado Realizado (Operacional)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fluxo} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  width={64}
                  tickFormatter={formatEixo}
                />
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
              <AreaChart data={fluxo} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis
                  dataKey="dia"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  minTickGap={40}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  width={64}
                  tickFormatter={formatEixo}
                />
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
