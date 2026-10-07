import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import FilterChip from '@/components/FilterChip'
import PlanilhaTabela, { type ColunaPlanilha } from '@/components/PlanilhaTabela'
import { COLUNAS_PEDIDOS_COMPRA, COLUNAS_PREVISOES_COMPRA } from '@/components/colunasPedidosCompra'
import { formatCurrency, formatarData, cn } from '@/lib/utils'
import {
  Loader2,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Scale,
  Clock,
  Info,
  Package,
  ClipboardList,
} from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  fetchFinanceiro,
  filterFinanceiro,
  filterByPerfil,
  janelaFuturo,
  baldeVencimento,
  computeFluxoFuturoPorMes,
  computeDespesaAbertoPorDimensao,
  computeGastoFuturoPorGrupo,
  computeTotaisFluxoFuturo,
  ehPendencia3112,
  type FatiaDespesaFutura,
  type FinanceiroRow,
} from '@/services/cash-flow'
import {
  fetchPedidoCompraParcelasAbertas,
  fetchPrevisoesCompra,
  computeTotalPedidosCompraAberto,
  computeTotalPrevisoes,
  type PedidoCompraParcelaAberta,
  type PrevisaoCompra,
} from '@/services/pedidos-compra-futuro'

// Verde/vermelho explícitos (não os --chart-* neutros do tema): esta tela é
// lida pela diretoria e "entra × sai" precisa bater de imediato. Combina com
// as cores do texto da tabela abaixo (emerald-600 / destructive).
const COR_RECEBER = '#059669'
const COR_PAGAR = '#dc2626'

const chartConfig = {
  aReceber: { label: 'A Receber', color: COR_RECEBER },
  aPagar: { label: 'A Pagar', color: COR_PAGAR },
  saldoAcumulado: { label: 'Saldo acumulado', color: 'hsl(var(--chart-1))' },
}

// Pizza da repartição das despesas — tons quentes, "Outros" fica cinza.
const CORES_PIE = [
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#ca8a04',
  '#65a30d',
  '#0891b2',
  '#7c3aed',
  '#db2777',
]
const COR_OUTROS = '#94a3b8'

const HORIZONTES: { valor: string; label: string; meses: number | null }[] = [
  { valor: '6', label: '6 meses', meses: 6 },
  { valor: '12', label: '12 meses', meses: 12 },
  { valor: '24', label: '24 meses', meses: 24 },
  { valor: 'tudo', label: 'Tudo', meses: null },
]

const OUTROS = 'Outros'
const SEM_GRUPO = 'SEM GRUPO'
const SEM_SUB_GRUPO = 'SEM SUB-GRUPO'
const grupoDe = (r: FinanceiroRow) => r.desc_grupo ?? SEM_GRUPO
const subGrupoDe = (r: FinanceiroRow) => r.desc_sub_grupo ?? SEM_SUB_GRUPO

const compact = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))

/** Top N fatias + "Outros" agregando a cauda. */
function topFatias(fatias: FatiaDespesaFutura[], n: number): FatiaDespesaFutura[] {
  if (fatias.length <= n) return fatias
  const top = fatias.slice(0, n - 1)
  const resto = fatias.slice(n - 1)
  return [
    ...top,
    {
      nome: OUTROS,
      total: resto.reduce((s, f) => s + f.total, 0),
      parcelas: resto.reduce((s, f) => s + f.parcelas, 0),
    },
  ]
}

// Planilha do fluxo futuro: inclui a coluna Grupo (a das outras abas não tem) e
// o valor líquido em aberto (vl_parcela - vl_desconto), que é o que soma nos KPIs.
const liquido = (r: FinanceiroRow) => (r.vl_parcela ?? 0) - (r.vl_desconto ?? 0)

const COLUNAS_FLUXO_FUTURO: ColunaPlanilha<FinanceiroRow>[] = [
  {
    chave: 'cod_duplicata',
    titulo: 'Duplicata',
    texto: (r) => (r.cod_duplicata != null ? String(r.cod_duplicata) : '—'),
    ordenar: (r) => r.cod_duplicata ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'tipo',
    titulo: 'Tipo',
    texto: (r) => (r.tipo === 'receita' ? 'A receber' : 'A pagar'),
  },
  { chave: 'descricao', titulo: 'Descrição', texto: (r) => r.descricao ?? '' },
  { chave: 'desc_grupo', titulo: 'Grupo', texto: (r) => r.desc_grupo ?? '—' },
  { chave: 'desc_sub_grupo', titulo: 'Sub-grupo', texto: (r) => r.desc_sub_grupo ?? '—' },
  {
    chave: 'dt_vencimento',
    titulo: 'Vencimento',
    texto: (r) => formatarData(r.dt_vencimento),
    ordenar: (r) => r.dt_vencimento ?? '',
  },
  {
    chave: 'liquido',
    titulo: 'Em aberto',
    texto: (r) => formatCurrency(liquido(r)),
    ordenar: (r) => liquido(r),
    alinhar: 'right',
  },
  { chave: 'perfil', titulo: 'Perfil', texto: (r) => r.perfil ?? '—' },
]

function KpiCard({
  title,
  value,
  icon: Icon,
  tone = 'default',
  info,
}: {
  title: string
  value: string
  icon: typeof ArrowDownCircle
  tone?: 'default' | 'positive' | 'negative' | 'warning'
  info?: string
}) {
  const toneCard: Record<string, string> = {
    default: 'border-border/60',
    positive: 'border-emerald-500/40 bg-emerald-500/5',
    negative: 'border-destructive/40 bg-destructive/5',
    warning: 'border-amber-500/40 bg-amber-500/5',
  }
  const toneValue: Record<string, string> = {
    default: '',
    positive: 'text-emerald-600',
    negative: 'text-destructive',
    warning: 'text-amber-600',
  }
  return (
    <Card
      className={cn(
        'shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        toneCard[tone],
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
              <TooltipContent className="max-w-[260px]">{info}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', toneValue[tone])}>{value}</div>
      </CardContent>
    </Card>
  )
}

export default function FluxoFuturo() {
  const [rows, setRows] = useState<FinanceiroRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [horizonte, setHorizonte] = useState('tudo')
  const [incluirVencidos, setIncluirVencidos] = useState(true)
  const [perfil, setPerfil] = useState<string | null>(null)
  // Recorte: mês ('vencido' | 'AAAA-MM') pelo Select ou clique no gráfico;
  // grupo/sub-grupo (só DESPESA) pela pizza ou pela tabela "o que vai gastar".
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null)
  const [grupoSelecionado, setGrupoSelecionado] = useState<string | null>(null)
  const [subGrupoSelecionado, setSubGrupoSelecionado] = useState<string | null>(null)
  // SPEC-127 E5: recorte livre por data de vencimento, aceitando data no passado
  // (o horizonte só vai pra frente). Quando preenchido, ignora horizonte/vencidos.
  const [rangeDe, setRangeDe] = useState('')
  const [rangeAte, setRangeAte] = useState('')

  // SPEC-128: Pedidos de Compra (app interno) e Previsões (export Connect
  // PedidoCompra) — fontes à parte de v_financeiro_realizado, carregadas em
  // paralelo. Falha aqui não derruba o resto da aba (Contas a Pagar/Receber
  // continuam funcionando normalmente).
  const [pedidosCompra, setPedidosCompra] = useState<PedidoCompraParcelaAberta[]>([])
  const [previsoesCompra, setPrevisoesCompra] = useState<PrevisaoCompra[]>([])
  const [errorCompras, setErrorCompras] = useState<string | null>(null)

  useEffect(() => {
    fetchFinanceiro()
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Não foi possível carregar os dados.'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    Promise.all([fetchPedidoCompraParcelasAbertas(), fetchPrevisoesCompra()])
      .then(([parcelas, previsoes]) => {
        setPedidosCompra(parcelas)
        setPrevisoesCompra(previsoes)
      })
      .catch((e: any) =>
        setErrorCompras(e?.message || 'Não foi possível carregar Pedidos de Compra/Previsões.'),
      )
  }, [])

  const meses = HORIZONTES.find((h) => h.valor === horizonte)?.meses ?? null

  // Base: (range livre OU horizonte) + perfil + só parcelas em aberto com
  // vencimento. Pendências 31/12 (data-lixo do Connect) nunca entram aqui —
  // vivem na aba "31-12 / Pendências" (SPEC-127 E5).
  const rangeAtivo = rangeDe !== '' || rangeAte !== ''
  const abertas = useMemo(() => {
    let de: string | null
    let ate: string | null
    if (rangeAtivo) {
      de = rangeDe || null
      ate = rangeAte || null
    } else {
      const janela = meses
        ? janelaFuturo(meses)
        : { de: null as string | null, ate: null as string | null }
      de = incluirVencidos ? null : janela.de
      ate = janela.ate
    }
    const periodo = { de, ate, campo: 'dt_vencimento' as const }
    return filterByPerfil(filterFinanceiro(rows, periodo), perfil).filter(
      (r) => r.status_pago === 0 && r.dt_vencimento && !ehPendencia3112(r.dt_vencimento),
    )
  }, [rows, meses, incluirVencidos, perfil, rangeAtivo, rangeDe, rangeAte])

  // Pendências 31/12 (só para o aviso — o detalhe está na aba dedicada).
  const pend3112 = useMemo(() => {
    const arr = filterByPerfil(rows, perfil).filter(
      (r) => r.status_pago === 0 && ehPendencia3112(r.dt_vencimento),
    )
    return {
      qtd: arr.length,
      aReceber: arr.filter((r) => r.tipo === 'receita').reduce((s, r) => s + liquido(r), 0),
      aPagar: arr.filter((r) => r.tipo === 'despesa').reduce((s, r) => s + liquido(r), 0),
    }
  }, [rows, perfil])

  const porMes = useMemo(() => computeFluxoFuturoPorMes(abertas), [abertas])

  // Nível 1: recorte pelo mês (Select ou clique na barra).
  const abertasDoMes = useMemo(() => {
    if (!mesSelecionado) return abertas
    return abertas.filter((r) => baldeVencimento(r.dt_vencimento) === mesSelecionado)
  }, [abertas, mesSelecionado])

  // Nível 2: recorte por grupo/sub-grupo — SEMPRE só despesa (era o bug: clicar
  // numa despesa trazia receita junto, ex. "VENDAS A PRAZO" sob "ADMINISTRATIVAS").
  const recorte = useMemo(() => {
    let out = abertasDoMes
    if (grupoSelecionado) {
      out = out.filter((r) => r.tipo === 'despesa' && grupoDe(r) === grupoSelecionado)
    }
    if (subGrupoSelecionado) {
      out = out.filter((r) => subGrupoDe(r) === subGrupoSelecionado)
    }
    return out
  }, [abertasDoMes, grupoSelecionado, subGrupoSelecionado])

  // KPIs = sempre nível do mês (não mudam com o clique em grupo — referência estável).
  const totais = useMemo(() => computeTotaisFluxoFuturo(abertasDoMes), [abertasDoMes])

  // Pizza: por grupo; ao selecionar um grupo, desce para os sub-grupos dele.
  const pieDimensao: 'grupo' | 'sub_grupo' = grupoSelecionado ? 'sub_grupo' : 'grupo'
  const pieBase = useMemo(
    () =>
      grupoSelecionado
        ? abertasDoMes.filter((r) => r.tipo === 'despesa' && grupoDe(r) === grupoSelecionado)
        : abertasDoMes,
    [abertasDoMes, grupoSelecionado],
  )
  const pieFull = useMemo(
    () => computeDespesaAbertoPorDimensao(pieBase, pieDimensao),
    [pieBase, pieDimensao],
  )
  const pie = useMemo(() => topFatias(pieFull, 8), [pieFull])
  const pieTotal = useMemo(() => pieFull.reduce((s, f) => s + f.total, 0), [pieFull])

  // Tabela "o que vai gastar": sempre a quebra completa do mês (serve de navegação).
  const porGrupo = useMemo(() => computeGastoFuturoPorGrupo(abertasDoMes), [abertasDoMes])
  const totalGrupos = useMemo(() => porGrupo.reduce((s, g) => s + g.total, 0), [porGrupo])
  const parcelasGrupos = useMemo(() => porGrupo.reduce((s, g) => s + g.parcelas, 0), [porGrupo])

  const recorteTotal = useMemo(() => recorte.reduce((s, r) => s + liquido(r), 0), [recorte])

  // SPEC-128: Pedidos de Compra participa do filtro Perfil (a tabela tem essa
  // coluna); Previsões não tem coluna perfil, então nunca é filtrada por ele.
  const pedidosCompraFiltrados = useMemo(
    () => (perfil ? pedidosCompra.filter((p) => p.perfil === perfil) : pedidosCompra),
    [pedidosCompra, perfil],
  )
  const totalPedidosCompra = useMemo(
    () => computeTotalPedidosCompraAberto(pedidosCompraFiltrados),
    [pedidosCompraFiltrados],
  )
  const totalPrevisoes = useMemo(() => computeTotalPrevisoes(previsoesCompra), [previsoesCompra])

  const rotuloMesSelecionado = mesSelecionado
    ? (porMes.find((m) => m.chave === mesSelecionado)?.rotulo ?? mesSelecionado)
    : null

  const recorteLabel = [rotuloMesSelecionado, grupoSelecionado, subGrupoSelecionado]
    .filter(Boolean)
    .join(' · ')

  const toggleMes = (chave?: string | null) => {
    if (!chave) return
    setGrupoSelecionado(null)
    setSubGrupoSelecionado(null)
    setMesSelecionado((prev) => (prev === chave ? null : chave))
  }
  const limparMes = () => {
    setMesSelecionado(null)
    setGrupoSelecionado(null)
    setSubGrupoSelecionado(null)
  }
  const limparGrupo = () => {
    setGrupoSelecionado(null)
    setSubGrupoSelecionado(null)
  }
  const selecionarFatia = (nome?: string) => {
    if (!nome || nome === OUTROS) return
    if (pieDimensao === 'grupo') {
      setSubGrupoSelecionado(null)
      setGrupoSelecionado((prev) => (prev === nome ? null : nome))
    } else {
      setSubGrupoSelecionado((prev) => (prev === nome ? null : nome))
    }
  }
  const toggleLinhaGrupo = (grupo: string, subGrupo: string) => {
    const jaSelecionado = grupoSelecionado === grupo && subGrupoSelecionado === subGrupo
    if (jaSelecionado) {
      setGrupoSelecionado(null)
      setSubGrupoSelecionado(null)
    } else {
      setGrupoSelecionado(grupo)
      setSubGrupoSelecionado(subGrupo)
    }
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
            Fluxo Futuro (Projeção)
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tudo que ainda está <strong>em aberto</strong> (não pago), por mês de vencimento — o que
            ainda entra e o que ainda sai. Fonte: v_financeiro_realizado (export do Connect).
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {rotuloMesSelecionado && (
            <FilterChip label={`Mês: ${rotuloMesSelecionado}`} onClear={limparMes} />
          )}
          {grupoSelecionado && (
            <FilterChip label={`Grupo: ${grupoSelecionado}`} onClear={limparGrupo} />
          )}
          {subGrupoSelecionado && (
            <FilterChip
              label={`Sub-grupo: ${subGrupoSelecionado}`}
              onClear={() => setSubGrupoSelecionado(null)}
            />
          )}
          {rangeAtivo && (
            <FilterChip
              label={`Vencimento: ${rangeDe ? formatarData(rangeDe) : '…'} – ${
                rangeAte ? formatarData(rangeAte) : '…'
              }`}
              onClear={() => {
                setRangeDe('')
                setRangeAte('')
              }}
            />
          )}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Vencimento</span>
            <input
              type="date"
              value={rangeDe}
              onChange={(e) => setRangeDe(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-foreground"
            />
            <span>–</span>
            <input
              type="date"
              value={rangeAte}
              onChange={(e) => setRangeAte(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-foreground"
            />
          </div>
          <div
            className={cn(
              'flex items-center gap-2',
              rangeAtivo && 'pointer-events-none opacity-40',
            )}
          >
            <Switch
              id="incluir-vencidos"
              checked={incluirVencidos}
              onCheckedChange={setIncluirVencidos}
            />
            <label
              htmlFor="incluir-vencidos"
              className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap"
            >
              Incluir vencidos
            </label>
          </div>
          <Select
            value={mesSelecionado ?? 'todos'}
            onValueChange={(v) => {
              setGrupoSelecionado(null)
              setSubGrupoSelecionado(null)
              setMesSelecionado(v === 'todos' ? null : v)
            }}
          >
            <SelectTrigger className="w-[150px] text-foreground">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {porMes.map((m) => (
                <SelectItem key={m.chave} value={m.chave}>
                  {m.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Select value={horizonte} onValueChange={setHorizonte}>
            <SelectTrigger className="w-[130px] text-foreground">
              <SelectValue placeholder="Horizonte" />
            </SelectTrigger>
            <SelectContent>
              {HORIZONTES.map((h) => (
                <SelectItem key={h.valor} value={h.valor}>
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-muted-foreground">
          <strong className="text-foreground">Atenção — fontes sem vínculo entre si.</strong> "A
          Pagar" vem do livro-caixa do Connect; "Pedidos de Compra" (abaixo) vem do sistema interno
          de Compras; "Previsões" (abaixo) vem de outro export do Connect (planilha PedidoCompra).
          Quando a nota fiscal de um pedido de compra é lançada no livro-caixa do Connect, o mesmo
          valor pode aparecer em mais de um bloco ao mesmo tempo — os valores{' '}
          <strong className="text-foreground">não devem ser somados</strong> entre si até existir um
          jeito de cruzar as fontes. (Os pedidos já duplicados entre "Pedidos de Compra" e
          "Previsões" já saem de "Previsões" automaticamente.)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title={
            rotuloMesSelecionado ? `A Receber — ${rotuloMesSelecionado}` : 'A Receber (em aberto)'
          }
          value={formatCurrency(totais.aReceber)}
          icon={ArrowDownCircle}
          tone="positive"
          info="Soma de (vl_parcela − vl_desconto) das parcelas de receita ainda não pagas no mês/horizonte. Não muda ao clicar num grupo."
        />
        <KpiCard
          title={rotuloMesSelecionado ? `A Pagar — ${rotuloMesSelecionado}` : 'A Pagar (em aberto)'}
          value={formatCurrency(totais.aPagar)}
          icon={ArrowUpCircle}
          tone="negative"
          info="Soma de (vl_parcela − vl_desconto) das parcelas de despesa ainda não pagas no mês/horizonte. Não muda ao clicar num grupo."
        />
        <KpiCard
          title="Saldo Projetado"
          value={formatCurrency(totais.saldo)}
          icon={Scale}
          tone={totais.saldo >= 0 ? 'positive' : 'negative'}
          info="A Receber − A Pagar no mês/horizonte. Não inclui o saldo atual em banco nem Pedidos de Compra/Previsões (ver aviso acima)."
        />
        <KpiCard
          title="Vencido (líquido)"
          value={formatCurrency(totais.aReceberVencido - totais.aPagarVencido)}
          icon={Clock}
          tone="warning"
          info={`A receber vencido ${formatCurrency(
            totais.aReceberVencido,
          )} − a pagar vencido ${formatCurrency(totais.aPagarVencido)}.`}
        />
        <KpiCard
          title="Pedidos de Compra em Aberto"
          value={formatCurrency(totalPedidosCompra)}
          icon={Package}
          tone="warning"
          info="Parcelas em aberto do sistema interno de Compras (pedidos_compra/pedido_compra_parcelas). Pode se sobrepor com Contas a Pagar quando a NF já foi lançada no Connect — ver aviso acima. Filtra por Perfil."
        />
        <KpiCard
          title="Previsões de Compra (estimado)"
          value={formatCurrency(totalPrevisoes)}
          icon={ClipboardList}
          tone="warning"
          info="Export Connect PedidoCompra: usa a parcela com vencimento real quando já lançada no Connect, senão o valor total do pedido estimado pela data de emissão. Não participa do filtro Perfil — a fonte não distingue Ribeirão/São Paulo."
        />
      </div>

      {errorCompras && (
        <p className="text-xs text-destructive -mt-2">
          Não foi possível carregar Pedidos de Compra/Previsões: {errorCompras}
        </p>
      )}

      {pend3112.qtd > 0 && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          {pend3112.qtd} título(s) com vencimento em <strong>31/12</strong> (data-lixo do Connect
          para pendência sem vencimento real) — {formatCurrency(pend3112.aPagar)} a pagar /{' '}
          {formatCurrency(pend3112.aReceber)} a receber — <strong>não entram</strong> nesta
          projeção; veja a aba <strong>31-12 / Pendências</strong>.
        </p>
      )}

      {(grupoSelecionado || subGrupoSelecionado) && (
        <p className="text-sm text-muted-foreground -mt-2">
          Recorte de despesa <strong>{recorteLabel}</strong>:{' '}
          <span className="font-semibold text-destructive">{formatCurrency(recorteTotal)}</span> a
          pagar em {recorte.length} {recorte.length === 1 ? 'parcela' : 'parcelas'}. Só despesa — a
          pizza, a tabela e a planilha abaixo seguem esse recorte; os KPIs acima continuam no total
          do mês.
        </p>
      )}

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Entradas × Saídas por mês de vencimento</CardTitle>
        </CardHeader>
        <CardContent>
          {porMes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Nada em aberto nesta seleção.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={porMes}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  onClick={(e: any) => toggleMes(e?.activePayload?.[0]?.payload?.chave)}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis
                    dataKey="rotulo"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    minTickGap={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={compact}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar
                    dataKey="aReceber"
                    name="A Receber"
                    fill="var(--color-aReceber)"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                  >
                    {porMes.map((m) => (
                      <Cell
                        key={m.chave}
                        opacity={mesSelecionado && mesSelecionado !== m.chave ? 0.3 : 1}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="aPagar"
                    name="A Pagar"
                    fill="var(--color-aPagar)"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                  >
                    {porMes.map((m) => (
                      <Cell
                        key={m.chave}
                        opacity={mesSelecionado && mesSelecionado !== m.chave ? 0.3 : 1}
                      />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="saldoAcumulado"
                    name="Saldo acumulado"
                    stroke="var(--color-saldoAcumulado)"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={300}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Clique numa barra (ou use o filtro "Mês") para focar um mês — a pizza e as tabelas
            abaixo passam a mostrar só ele. A linha do saldo acumulado é sobre o horizonte inteiro e
            não muda com o clique. Não inclui Pedidos de Compra/Previsões (ver tabelas abaixo).
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            Repartição das despesas em aberto
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              · {rotuloMesSelecionado ?? 'todos os meses'}
              {grupoSelecionado ? ` · ${grupoSelecionado} (sub-grupos)` : ' · por grupo'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pie.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Nenhuma despesa em aberto nesta seleção.
            </p>
          ) : (
            <ChartContainer config={{}} className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="total"
                    nameKey="nome"
                    innerRadius={70}
                    outerRadius={125}
                    paddingAngle={2}
                    cursor="pointer"
                    onClick={(d: any) => selecionarFatia(d?.nome)}
                  >
                    {pie.map((f, i) => {
                      const selecionada =
                        pieDimensao === 'grupo'
                          ? grupoSelecionado === f.nome
                          : subGrupoSelecionado === f.nome
                      const algoSelecionado =
                        pieDimensao === 'grupo' ? !!grupoSelecionado : !!subGrupoSelecionado
                      return (
                        <Cell
                          key={f.nome}
                          fill={f.nome === OUTROS ? COR_OUTROS : CORES_PIE[i % CORES_PIE.length]}
                          className="transition-opacity duration-200"
                          opacity={algoSelecionado && !selecionada ? 0.35 : 1}
                          stroke={selecionada ? 'hsl(var(--foreground))' : undefined}
                          strokeWidth={selecionada ? 2 : 0}
                        />
                      )
                    })}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-1.5">
                    {pieDimensao === 'grupo' ? 'Grupo' : 'Sub-grupo'}
                  </th>
                  <th className="text-right px-3 py-1.5">Parcelas</th>
                  <th className="text-right px-3 py-1.5">Total a pagar</th>
                  <th className="text-right px-3 py-1.5">%</th>
                </tr>
              </thead>
              <tbody>
                {pie.map((f, i) => (
                  <tr
                    key={f.nome}
                    onClick={() => selecionarFatia(f.nome)}
                    className={cn(
                      'border-t border-border/40',
                      f.nome !== OUTROS && 'cursor-pointer hover:bg-muted/20',
                      ((pieDimensao === 'grupo' && grupoSelecionado === f.nome) ||
                        (pieDimensao === 'sub_grupo' && subGrupoSelecionado === f.nome)) &&
                        'bg-primary/10',
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{
                            background:
                              f.nome === OUTROS ? COR_OUTROS : CORES_PIE[i % CORES_PIE.length],
                          }}
                        />
                        {f.nome}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.parcelas}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                      {formatCurrency(f.total)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {pieTotal > 0 ? `${((f.total / pieTotal) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Só despesa em aberto. Clique numa fatia (ou numa linha) para abrir o grupo nos
            sub-grupos e filtrar a planilha; use o chip "Grupo" para voltar. "Outros" agrega a cauda
            e não é clicável.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Projeção mês a mês</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Mês de vencimento</th>
                  <th className="text-right px-4 py-2">A Receber</th>
                  <th className="text-right px-4 py-2">A Pagar</th>
                  <th className="text-right px-4 py-2">Saldo do mês</th>
                  <th className="text-right px-4 py-2">Saldo acumulado</th>
                </tr>
              </thead>
              <tbody>
                {porMes.map((m) => (
                  <tr
                    key={m.chave}
                    onClick={() => toggleMes(m.chave)}
                    className={cn(
                      'border-t border-border/40 cursor-pointer transition-colors hover:bg-muted/20',
                      mesSelecionado === m.chave && 'bg-primary/10',
                    )}
                  >
                    <td className="px-4 py-2">{m.rotulo}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                      {formatCurrency(m.aReceber)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-destructive">
                      {formatCurrency(m.aPagar)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums font-medium',
                        m.saldoMes < 0 && 'text-destructive',
                      )}
                    >
                      {formatCurrency(m.saldoMes)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums font-medium',
                        m.saldoAcumulado < 0 && 'text-destructive',
                      )}
                    >
                      {formatCurrency(m.saldoAcumulado)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {porMes.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                      {formatCurrency(porMes.reduce((s, m) => s + m.aReceber, 0))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-destructive">
                      {formatCurrency(porMes.reduce((s, m) => s + m.aPagar, 0))}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        porMes.reduce((s, m) => s + m.saldoMes, 0) < 0 && 'text-destructive',
                      )}
                    >
                      {formatCurrency(porMes.reduce((s, m) => s + m.saldoMes, 0))}
                    </td>
                    <td className="px-4 py-2" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground px-4 py-2">
            Clique numa linha para focar o mês. O Total é sempre o horizonte inteiro (não muda com o
            clique). "Vencido" = parcelas que já passaram do vencimento e não foram pagas.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            O que vai gastar — por grupo e sub-grupo
            {rotuloMesSelecionado && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · {rotuloMesSelecionado}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Grupo</th>
                  <th className="text-left px-4 py-2">Sub-grupo</th>
                  <th className="text-right px-4 py-2">Parcelas</th>
                  <th className="text-right px-4 py-2">Total a pagar</th>
                  <th className="text-right px-4 py-2">% do total</th>
                </tr>
              </thead>
              <tbody>
                {porGrupo.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma despesa em aberto nesta seleção.
                    </td>
                  </tr>
                ) : (
                  porGrupo.map((g) => (
                    <tr
                      key={`${g.grupo}||${g.subGrupo}`}
                      onClick={() => toggleLinhaGrupo(g.grupo, g.subGrupo)}
                      className={cn(
                        'border-t border-border/40 cursor-pointer transition-colors hover:bg-muted/20',
                        grupoSelecionado === g.grupo &&
                          subGrupoSelecionado === g.subGrupo &&
                          'bg-primary/10',
                      )}
                    >
                      <td className="px-4 py-2">{g.grupo}</td>
                      <td className="px-4 py-2">{g.subGrupo}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{g.parcelas}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {formatCurrency(g.total)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {totalGrupos > 0 ? `${((g.total / totalGrupos) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {porGrupo.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                    <td className="px-4 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{parcelasGrupos}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCurrency(totalGrupos)}
                    </td>
                    <td className="px-4 py-2" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground px-4 py-2">
            Clique numa linha para filtrar a pizza e a planilha por aquele grupo + sub-grupo (só
            despesa). Total é sempre o mês inteiro.
          </p>
        </CardContent>
      </Card>

      <PlanilhaTabela
        titulo={
          recorteLabel
            ? `Planilha — ${
                grupoSelecionado || subGrupoSelecionado ? 'despesas' : 'títulos em aberto'
              } · ${recorteLabel}`
            : 'Planilha — títulos em aberto por vencimento'
        }
        descricao="Cada parcela do recorte selecionado (horizonte, perfil, mês e — se clicado — grupo/sub-grupo, aí só despesa), com Grupo, Sub-grupo e data de vencimento. Confira com o export do Connect; a coluna Duplicata é a chave de match. Baixe o CSV para a lista completa."
        colunas={COLUNAS_FLUXO_FUTURO}
        rows={recorte}
        nomeArquivo="fluxo-futuro"
        chaveLinha={(r) => r.id}
      />

      <PlanilhaTabela
        titulo="Pedidos de Compra em aberto"
        descricao="Parcelas em aberto do sistema interno de Compras (pedidos_compra/pedido_compra_parcelas), filtradas pelo Perfil selecionado acima. Pode se sobrepor com Contas a Pagar — ver aviso no topo da página."
        colunas={COLUNAS_PEDIDOS_COMPRA}
        rows={pedidosCompraFiltrados}
        nomeArquivo="pedidos-compra-em-aberto"
        chaveLinha={(r) => r.id}
      />

      <PlanilhaTabela
        titulo="Previsões de Compra"
        descricao='Export Connect "PedidoCompra" (pedido_compra/staging_pedido_compra), sem os pedidos já contados em "Pedidos de Compra" acima. Não participa do filtro Perfil — a fonte não distingue Ribeirão/São Paulo.'
        colunas={COLUNAS_PREVISOES_COMPRA}
        rows={previsoesCompra}
        nomeArquivo="previsoes-compra"
        chaveLinha={(r, i) => `${r.codigoPedido}-${i}`}
      />
    </div>
  )
}
