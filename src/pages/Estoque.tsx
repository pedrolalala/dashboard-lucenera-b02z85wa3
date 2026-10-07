import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatCurrency } from '@/lib/utils'
import {
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  fetchEstoque,
  distinctMarcas,
  filterByMarcas,
  computeKpisEstoque,
  groupByMarca,
  topDeficit,
  groupMkpByMarca,
  sortRows,
  type EstoqueProdutoRow,
  type MarcaAgregada,
  type MkpMarca,
  type SortDir,
} from '@/services/estoque'
import MarcaMultiSelect from '@/components/MarcaMultiSelect'
import PlanilhaTabela, { type ColunaPlanilha } from '@/components/PlanilhaTabela'

const num = (v: number) => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const COLUNAS_ESTOQUE: ColunaPlanilha<EstoqueProdutoRow>[] = [
  {
    chave: 'codigo_produto',
    titulo: 'Código',
    texto: (r) => (r.codigo_produto != null ? String(r.codigo_produto) : '—'),
    ordenar: (r) => r.codigo_produto ?? 0,
    alinhar: 'right',
  },
  { chave: 'produto', titulo: 'Produto', texto: (r) => r.produto ?? '' },
  { chave: 'marca', titulo: 'Marca', texto: (r) => r.marca ?? '' },
  {
    chave: 'estoque_total',
    titulo: 'Estoque total',
    texto: (r) => num(r.estoque_total),
    ordenar: (r) => r.estoque_total ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'estoque_disponivel',
    titulo: 'Disponível',
    texto: (r) => num(r.estoque_disponivel),
    ordenar: (r) => r.estoque_disponivel ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'estoque_showroom',
    titulo: 'Showroom',
    texto: (r) => num(r.estoque_showroom),
    ordenar: (r) => r.estoque_showroom ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'custo_unitario',
    titulo: 'Custo un.',
    texto: (r) => formatCurrency(r.custo_unitario ?? 0),
    ordenar: (r) => r.custo_unitario ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'venda_unitaria',
    titulo: 'Venda un.',
    texto: (r) => formatCurrency(r.venda_unitaria ?? 0),
    ordenar: (r) => r.venda_unitaria ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'valor_custo_disponivel',
    titulo: 'Custo disp.',
    texto: (r) => formatCurrency(r.valor_custo_disponivel ?? 0),
    ordenar: (r) => r.valor_custo_disponivel ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'valor_venda_disponivel',
    titulo: 'Venda disp.',
    texto: (r) => formatCurrency(r.valor_venda_disponivel ?? 0),
    ordenar: (r) => r.valor_venda_disponivel ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'valor_custo_total',
    titulo: 'Custo total',
    texto: (r) => formatCurrency(r.valor_custo_total ?? 0),
    ordenar: (r) => r.valor_custo_total ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'mkp',
    titulo: 'MKP',
    texto: (r) => (r.mkp != null ? `${r.mkp.toFixed(2)}x` : '—'),
    ordenar: (r) => r.mkp ?? 0,
    alinhar: 'right',
  },
]

const CORES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

const chartConfig = {
  valorCustoDisponivel: { label: 'Custo Disponível', color: 'hsl(var(--chart-1))' },
  valorVendaDisponivel: { label: 'Venda Disponível', color: 'hsl(var(--chart-2))' },
  skus: { label: 'SKUs', color: 'hsl(var(--chart-3))' },
  valor_custo_negativo: { label: 'A Comprar (Custo)', color: 'hsl(var(--chart-5))' },
}

function KpiCard({
  title,
  value,
  icon: Icon,
  tone = 'default',
}: {
  title: string
  value: string
  icon: typeof Users
  tone?: 'default' | 'positive' | 'negative'
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-500'
      : tone === 'negative'
        ? 'text-destructive'
        : 'text-primary'
  return (
    <Card className="border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
  align?: 'left' | 'right'
}) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <span
        className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </span>
    </th>
  )
}

export default function Estoque() {
  const [rows, setRows] = useState<EstoqueProdutoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marcasSelecionadas, setMarcasSelecionadas] = useState<string[]>([])
  const [sortMarca, setSortMarca] = useState<{ key: keyof MarcaAgregada; dir: SortDir }>({
    key: 'valorCustoDisponivel',
    dir: 'desc',
  })
  const [sortMkp, setSortMkp] = useState<{ key: keyof MkpMarca; dir: SortDir }>({
    key: 'mkpMedio',
    dir: 'desc',
  })

  useEffect(() => {
    fetchEstoque()
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Não foi possível carregar os dados de estoque.'))
      .finally(() => setIsLoading(false))
  }, [])

  const toggleMarca = (m: string | undefined | null) => {
    if (!m) return
    setMarcasSelecionadas((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  const marcas = useMemo(() => distinctMarcas(rows), [rows])
  const filtradas = useMemo(
    () => filterByMarcas(rows, marcasSelecionadas),
    [rows, marcasSelecionadas],
  )
  const kpis = useMemo(() => computeKpisEstoque(filtradas), [filtradas])
  const porMarca = useMemo(() => groupByMarca(filtradas), [filtradas])
  const porMarcaOrdenada = useMemo(
    () => sortRows(porMarca, sortMarca.key, sortMarca.dir),
    [porMarca, sortMarca],
  )
  const porMarcaTop15 = useMemo(() => groupByMarca(rows).slice(0, 15), [rows])
  const deficit = useMemo(() => topDeficit(filtradas, 15), [filtradas])
  const mkpPorMarca = useMemo(() => groupMkpByMarca(filtradas), [filtradas])
  const mkpOrdenado = useMemo(
    () => sortRows(mkpPorMarca, sortMkp.key, sortMkp.dir),
    [mkpPorMarca, sortMkp],
  )
  const donutData = useMemo(
    () =>
      porMarcaTop15
        .filter((m) => m.valorCustoDisponivel > 0)
        .slice(0, 10)
        .map((m, i) => ({
          name: m.marca,
          value: m.valorCustoDisponivel,
          fill: CORES[i % CORES.length],
        })),
    [porMarcaTop15],
  )

  const toggleSortMarca = (key: keyof MarcaAgregada) => {
    setSortMarca((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    )
  }

  const toggleSortMkp = (key: keyof MkpMarca) => {
    setSortMkp((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    )
  }

  const totalMarcaTabela = useMemo(
    () =>
      porMarcaOrdenada.reduce(
        (acc, m) => ({
          skus: acc.skus + m.skus,
          valorCustoDisponivel: acc.valorCustoDisponivel + m.valorCustoDisponivel,
          valorVendaDisponivel: acc.valorVendaDisponivel + m.valorVendaDisponivel,
        }),
        { skus: 0, valorCustoDisponivel: 0, valorVendaDisponivel: 0 },
      ),
    [porMarcaOrdenada],
  )

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
          <p className="font-medium">Erro ao carregar estoque</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light uppercase tracking-widest text-foreground">Estoque</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Disponível e déficit por marca. {filtradas.length.toLocaleString('pt-BR')} produtos ·{' '}
            {porMarca.length} marcas no recorte. Showroom agora fica na aba própria.
          </p>
        </div>
        <MarcaMultiSelect
          marcas={marcas}
          selecionadas={marcasSelecionadas}
          onChange={setMarcasSelecionadas}
        />
      </div>

      {/* SPEC-127 E1: os 3 principais (Vinícius, reunião 03/09) — disponível e o que falta comprar. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Custo Disponível"
          value={formatCurrency(kpis.cmvDisponivel)}
          icon={TrendingUp}
          tone="positive"
        />
        <KpiCard
          title="Custo em Déficit (a comprar)"
          value={formatCurrency(kpis.cmvNegativos)}
          icon={TrendingDown}
          tone="negative"
        />
        <KpiCard
          title="Venda Disponível"
          value={formatCurrency(kpis.vendaDisponivel)}
          icon={TrendingUp}
          tone="positive"
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Comprometido com projeto de cliente (base do seguro)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KpiCard
            title="De Cliente / Reservado (Custo)"
            value={formatCurrency(kpis.valorCustoReservado)}
            icon={Users}
          />
          <KpiCard
            title="De Cliente / Reservado (Venda)"
            value={formatCurrency(kpis.valorVendaReservado)}
            icon={Users}
          />
        </div>
      </div>

      <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        "Disponível" já inclui o Showroom (não somar). "De Cliente / Reservado" é o valor
        comprometido com projetos — calculado como estoque total + showroom − disponível, ainda
        aproximado (infla com peça em déficit e com o showroom contado duas vezes). Fica exato
        quando <code>v_estoque_produtos</code> expuser <code>estoque_reservado</code> (SPEC-126
        Escopo 5). Estoque é foto do último import — não tem histórico.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Estoque Disponível por Marca (top 15)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={porMarcaTop15}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                  onClick={(e: any) => toggleMarca(e?.activePayload?.[0]?.payload?.marca)}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="marca"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={90}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="valorCustoDisponivel"
                    fill="var(--color-valorCustoDisponivel)"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            <p className="text-[11px] text-muted-foreground text-center mt-1">
              Clique numa barra para adicionar/remover essa marca do filtro.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Valor Disponível por Marca (Custo)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={100}
                    paddingAngle={2}
                    onClick={(d: any) => toggleMarca(d?.name)}
                    cursor="pointer"
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Marca × Valor Disponível</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <SortableHead
                    label="Marca"
                    active={sortMarca.key === 'marca'}
                    dir={sortMarca.dir}
                    onClick={() => toggleSortMarca('marca')}
                  />
                  <SortableHead
                    label="SKUs"
                    active={sortMarca.key === 'skus'}
                    dir={sortMarca.dir}
                    onClick={() => toggleSortMarca('skus')}
                    align="right"
                  />
                  <SortableHead
                    label="Valor Disponível (Custo)"
                    active={sortMarca.key === 'valorCustoDisponivel'}
                    dir={sortMarca.dir}
                    onClick={() => toggleSortMarca('valorCustoDisponivel')}
                    align="right"
                  />
                  <SortableHead
                    label="Valor Disponível (Venda)"
                    active={sortMarca.key === 'valorVendaDisponivel'}
                    dir={sortMarca.dir}
                    onClick={() => toggleSortMarca('valorVendaDisponivel')}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {porMarcaOrdenada.map((m) => (
                  <tr
                    key={m.marca}
                    onClick={() => toggleMarca(m.marca)}
                    className={`border-t border-border/40 cursor-pointer hover:bg-muted/20 transition-colors ${
                      marcasSelecionadas.includes(m.marca) ? 'bg-primary/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">{m.marca}</td>
                    <td className="px-3 py-2 text-right">{m.skus}</td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(m.valorCustoDisponivel)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(m.valorVendaDisponivel)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20 font-semibold border-t-2 border-border">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{totalMarcaTabela.skus}</td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(totalMarcaTabela.valorCustoDisponivel)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(totalMarcaTabela.valorVendaDisponivel)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Markup (MKP) por Marca</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <SortableHead
                    label="Marca"
                    active={sortMkp.key === 'marca'}
                    dir={sortMkp.dir}
                    onClick={() => toggleSortMkp('marca')}
                  />
                  <SortableHead
                    label="Produtos c/ MKP"
                    active={sortMkp.key === 'produtosComMkp'}
                    dir={sortMkp.dir}
                    onClick={() => toggleSortMkp('produtosComMkp')}
                    align="right"
                  />
                  <SortableHead
                    label="MKP Médio"
                    active={sortMkp.key === 'mkpMedio'}
                    dir={sortMkp.dir}
                    onClick={() => toggleSortMkp('mkpMedio')}
                    align="right"
                  />
                  <SortableHead
                    label="MKP Mínimo"
                    active={sortMkp.key === 'mkpMinimo'}
                    dir={sortMkp.dir}
                    onClick={() => toggleSortMkp('mkpMinimo')}
                    align="right"
                  />
                  <SortableHead
                    label="MKP Máximo"
                    active={sortMkp.key === 'mkpMaximo'}
                    dir={sortMkp.dir}
                    onClick={() => toggleSortMkp('mkpMaximo')}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {mkpOrdenado.map((m) => (
                  <tr
                    key={m.marca}
                    onClick={() => toggleMarca(m.marca)}
                    className={`border-t border-border/40 cursor-pointer hover:bg-muted/20 transition-colors ${
                      marcasSelecionadas.includes(m.marca) ? 'bg-primary/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">{m.marca}</td>
                    <td className="px-3 py-2 text-right">{m.produtosComMkp}</td>
                    <td className="px-3 py-2 text-right font-medium">{m.mkpMedio.toFixed(2)}x</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {m.mkpMinimo.toFixed(2)}x
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {m.mkpMaximo.toFixed(2)}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Produtos com maior déficit (a comprar)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[320px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    Produto
                  </th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground">
                    Déficit
                  </th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground">
                    Custo a Comprar
                  </th>
                </tr>
              </thead>
              <tbody>
                {deficit.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhum déficit nesta seleção.
                    </td>
                  </tr>
                ) : (
                  deficit.map((d) => (
                    <tr key={d.produto_id} className="border-t border-border/40">
                      <td className="px-3 py-2 max-w-[220px] truncate" title={d.produto}>
                        {d.produto}
                        <div className="text-[10px] text-muted-foreground">{d.marca}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-destructive font-medium">
                        {d.deficit_qtd.toFixed(0)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(d.valor_custo_negativo)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PlanilhaTabela
        titulo="Planilha — produtos"
        descricao="Uma linha por produto ativo de v_estoque_produtos, nas marcas selecionadas. Confira com a planilha de estoque do Connect; baixe o CSV para comparar."
        colunas={COLUNAS_ESTOQUE}
        rows={filtradas}
        nomeArquivo="estoque"
        chaveLinha={(r) => r.produto_id}
      />
    </div>
  )
}
