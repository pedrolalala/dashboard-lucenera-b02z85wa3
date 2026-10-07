import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import PlanilhaTabela, { type ColunaPlanilha } from '@/components/PlanilhaTabela'
import { formatCurrency, formatarData, cn } from '@/lib/utils'
import { Loader2, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react'
import {
  fetchFinanceiro,
  filterByPerfil,
  ehPendencia3112,
  computePendencias3112PorAno,
  type FinanceiroRow,
} from '@/services/cash-flow'

const liquido = (r: FinanceiroRow) => (r.vl_parcela ?? 0) - (r.vl_desconto ?? 0)

const COLUNAS: ColunaPlanilha<FinanceiroRow>[] = [
  {
    chave: 'cod_duplicata',
    titulo: 'Duplicata',
    texto: (r) => (r.cod_duplicata != null ? String(r.cod_duplicata) : '—'),
    ordenar: (r) => r.cod_duplicata ?? 0,
    alinhar: 'right',
  },
  { chave: 'tipo', titulo: 'Tipo', texto: (r) => (r.tipo === 'receita' ? 'A receber' : 'A pagar') },
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
}: {
  title: string
  value: string
  icon: typeof Scale
  tone?: 'default' | 'positive' | 'negative'
}) {
  const cls =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-destructive'
        : 'text-foreground'
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', cls)}>{value}</div>
      </CardContent>
    </Card>
  )
}

export default function Pendencias3112() {
  const [rows, setRows] = useState<FinanceiroRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<string | null>(null)

  useEffect(() => {
    fetchFinanceiro()
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Não foi possível carregar os dados.'))
      .finally(() => setIsLoading(false))
  }, [])

  const pendencias = useMemo(
    () =>
      filterByPerfil(rows, perfil).filter(
        (r) => r.status_pago === 0 && ehPendencia3112(r.dt_vencimento),
      ),
    [rows, perfil],
  )
  const porAno = useMemo(() => computePendencias3112PorAno(pendencias), [pendencias])
  const aReceber = useMemo(
    () => pendencias.filter((r) => r.tipo === 'receita').reduce((s, r) => s + liquido(r), 0),
    [pendencias],
  )
  const aPagar = useMemo(
    () => pendencias.filter((r) => r.tipo === 'despesa').reduce((s, r) => s + liquido(r), 0),
    [pendencias],
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
            31/12 · Pendências
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Títulos em aberto com vencimento em <strong>31 de dezembro</strong> de qualquer ano — a
            "data-lixo" que o Connect usa para pendência sem vencimento real. Ficam fora do Fluxo
            Futuro e do fluxo de caixa; um dia entram ou saem, mas não dá para contar com eles.
          </p>
        </div>
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="A Receber (pendências)"
          value={formatCurrency(aReceber)}
          icon={ArrowDownCircle}
          tone="positive"
        />
        <KpiCard
          title="A Pagar (pendências)"
          value={formatCurrency(aPagar)}
          icon={ArrowUpCircle}
          tone="negative"
        />
        <KpiCard
          title="Saldo das pendências"
          value={formatCurrency(aReceber - aPagar)}
          icon={Scale}
          tone={aReceber - aPagar >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Pendências por ano</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Ano (31/12)</th>
                  <th className="text-right px-4 py-2">Qtd a receber</th>
                  <th className="text-right px-4 py-2">A Receber</th>
                  <th className="text-right px-4 py-2">Qtd a pagar</th>
                  <th className="text-right px-4 py-2">A Pagar</th>
                  <th className="text-right px-4 py-2">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {porAno.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma pendência 31/12 nesta seleção.
                    </td>
                  </tr>
                ) : (
                  porAno.map((a) => {
                    const saldo = a.aReceber - a.aPagar
                    return (
                      <tr key={a.ano} className="border-t border-border/40">
                        <td className="px-4 py-2 font-medium">{a.ano}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.qtdReceber}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                          {formatCurrency(a.aReceber)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.qtdPagar}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-destructive">
                          {formatCurrency(a.aPagar)}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2 text-right tabular-nums font-medium',
                            saldo < 0 && 'text-destructive',
                          )}
                        >
                          {formatCurrency(saldo)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {porAno.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {porAno.reduce((s, a) => s + a.qtdReceber, 0)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                      {formatCurrency(aReceber)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {porAno.reduce((s, a) => s + a.qtdPagar, 0)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-destructive">
                      {formatCurrency(aPagar)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        aReceber - aPagar < 0 && 'text-destructive',
                      )}
                    >
                      {formatCurrency(aReceber - aPagar)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      <PlanilhaTabela
        titulo="Planilha — pendências 31/12"
        descricao="Cada título em aberto com vencimento em 31/12 (qualquer ano), no perfil selecionado. A ideia é a equipe passar o pente fino: o que não é pendência real deve ganhar uma data de vencimento verdadeira (ex.: dia 30) no Connect."
        colunas={COLUNAS}
        rows={pendencias}
        nomeArquivo="pendencias-31-12"
        chaveLinha={(r) => r.id}
      />
    </div>
  )
}
