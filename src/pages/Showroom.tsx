import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatCurrency } from '@/lib/utils'
import { Loader2, AlertTriangle, ShoppingBag, Package } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import {
  fetchEstoque,
  distinctMarcas,
  filterByMarcas,
  apenasShowroom,
  computeKpisEstoque,
  groupByMarca,
  type EstoqueProdutoRow,
} from '@/services/estoque'
import MarcaMultiSelect from '@/components/MarcaMultiSelect'
import PlanilhaTabela, { type ColunaPlanilha } from '@/components/PlanilhaTabela'

const num = (v: number) => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const vendaShowroom = (r: EstoqueProdutoRow) =>
  Math.max(0, r.estoque_showroom ?? 0) * (r.venda_unitaria ?? 0)

const COLUNAS_SHOWROOM: ColunaPlanilha<EstoqueProdutoRow>[] = [
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
    chave: 'estoque_showroom',
    titulo: 'Qtd showroom',
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
    chave: 'valor_custo_showroom',
    titulo: 'Custo total (showroom)',
    texto: (r) => formatCurrency(r.valor_custo_showroom ?? 0),
    ordenar: (r) => r.valor_custo_showroom ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'valor_venda_showroom',
    titulo: 'Venda total (showroom)',
    texto: (r) => formatCurrency(vendaShowroom(r)),
    ordenar: (r) => vendaShowroom(r),
    alinhar: 'right',
  },
]

const chartConfig = {
  valorCustoShowroom: { label: 'Showroom (Custo)', color: 'hsl(var(--chart-5))' },
}

function KpiCard({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string
  icon: typeof ShoppingBag
}) {
  return (
    <Card className="border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}

export default function Showroom() {
  const [rows, setRows] = useState<EstoqueProdutoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marcasSelecionadas, setMarcasSelecionadas] = useState<string[]>([])

  useEffect(() => {
    fetchEstoque()
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Não foi possível carregar os dados de estoque.'))
      .finally(() => setIsLoading(false))
  }, [])

  const showroom = useMemo(() => apenasShowroom(rows), [rows])
  const marcas = useMemo(() => distinctMarcas(showroom), [showroom])
  const filtradas = useMemo(
    () => filterByMarcas(showroom, marcasSelecionadas),
    [showroom, marcasSelecionadas],
  )
  const kpis = useMemo(() => computeKpisEstoque(filtradas), [filtradas])
  const porMarca = useMemo(
    () =>
      groupByMarca(filtradas)
        .filter((m) => m.valorCustoShowroom > 0)
        .sort((a, b) => b.valorCustoShowroom - a.valorCustoShowroom)
        .slice(0, 12),
    [filtradas],
  )

  const toggleMarca = (m: string | undefined | null) => {
    if (!m) return
    setMarcasSelecionadas((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
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
          <p className="font-medium">Erro ao carregar showroom</p>
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
            Showroom
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Peças no setor showroom — {filtradas.length.toLocaleString('pt-BR')} peças ·{' '}
            {marcas.length} marcas. Foto do último import (sem histórico).
          </p>
        </div>
        <MarcaMultiSelect
          marcas={marcas}
          selecionadas={marcasSelecionadas}
          onChange={setMarcasSelecionadas}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Showroom (Custo)"
          value={formatCurrency(kpis.valorCustoShowroom)}
          icon={ShoppingBag}
        />
        <KpiCard
          title="Showroom (Venda)"
          value={formatCurrency(kpis.valorVendaShowroom)}
          icon={ShoppingBag}
        />
        <KpiCard
          title="Peças no showroom"
          value={filtradas.length.toLocaleString('pt-BR')}
          icon={Package}
        />
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Showroom por Marca (Custo) — top 12</CardTitle>
        </CardHeader>
        <CardContent>
          {porMarca.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Nenhuma peça no showroom nesta seleção.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={porMarca}
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
                    width={110}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="valorCustoShowroom"
                    fill="var(--color-valorCustoShowroom)"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
          <p className="text-[11px] text-muted-foreground text-center mt-1">
            Clique numa barra para adicionar/remover essa marca do filtro.
          </p>
        </CardContent>
      </Card>

      <PlanilhaTabela
        titulo="Planilha — peças no showroom"
        descricao="Uma linha por produto com quantidade no setor showroom, nas marcas selecionadas. Baixe o CSV para conferir com o Connect."
        colunas={COLUNAS_SHOWROOM}
        rows={filtradas}
        nomeArquivo="showroom"
        chaveLinha={(r) => r.produto_id}
      />
    </div>
  )
}
