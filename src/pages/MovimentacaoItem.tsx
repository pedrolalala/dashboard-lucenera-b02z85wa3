import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, AlertTriangle, Search } from 'lucide-react'
import PlanilhaTabela, { type ColunaPlanilha } from '@/components/PlanilhaTabela'
import { fetchMovimentacaoItem, SETORES_KARDEX, type MovimentoItem } from '@/services/movimentacaoItem'

const num = (v: number | null) => (v == null ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))
const fmtData = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const hoje = () => new Date().toLocaleDateString('sv-SE')
const inicioDoMes = () => hoje().slice(0, 8) + '01'

const TIPO_LABEL: Record<string, string> = { E: 'E', S: 'S', T: 'T', I: 'Inicial', '': '' }

export default function MovimentacaoItem() {
  const [codigo, setCodigo] = useState('')
  const [inicio, setInicio] = useState(inicioDoMes())
  const [fim, setFim] = useState(hoje())
  const [setor, setSetor] = useState('todos')
  const [rows, setRows] = useState<MovimentoItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todos = setor === 'todos'

  const buscar = async () => {
    if (!codigo.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      setRows(await fetchMovimentacaoItem({ codigo, inicio, fim, setor: todos ? null : setor }))
    } catch (e: any) {
      setRows(null)
      setError(e?.message || 'Não foi possível carregar a movimentação.')
    } finally {
      setIsLoading(false)
    }
  }

  const colunas = useMemo<ColunaPlanilha<MovimentoItem>[]>(() => {
    const cols: ColunaPlanilha<MovimentoItem>[] = [
      { chave: 'codigo', titulo: 'Código', texto: (r) => String(r.codigo_produto), alinhar: 'right' },
      { chave: 'data', titulo: 'Data', texto: (r) => (r.tipo === '' ? '' : fmtData(r.data)), ordenar: (r) => r.ordem },
      { chave: 'historico', titulo: 'Histórico', texto: (r) => r.historico ?? '' },
      { chave: 'tipo', titulo: 'Tipo', texto: (r) => TIPO_LABEL[r.tipo] ?? r.tipo },
      { chave: 'quantidade', titulo: 'Movimentação', texto: (r) => num(r.quantidade), ordenar: (r) => r.quantidade ?? 0, alinhar: 'right' },
      { chave: 'saldo_setor', titulo: 'Saldo', texto: (r) => num(r.saldo_setor), ordenar: (r) => r.saldo_setor, alinhar: 'right' },
    ]
    if (todos) {
      cols.push({ chave: 'saldo_geral', titulo: 'Saldo geral', texto: (r) => num(r.saldo_geral), ordenar: (r) => r.saldo_geral, alinhar: 'right' })
    }
    cols.push(
      { chave: 'setor', titulo: 'Setor', texto: (r) => r.setor },
      { chave: 'usuario', titulo: 'Usuário', texto: (r) => r.usuario ?? '' },
    )
    return cols
  }, [todos])

  const produto = rows?.[0]
  const saldoFinal = rows && rows.length > 0 ? rows[rows.length - 1].saldo_geral : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Movimentação do item</h1>
        <p className="text-sm text-muted-foreground">
          O que aconteceu no estoque da empresa: venda aprovada já é saída (S), mesmo com a peça ainda reservada; a
          entrega ao cliente não aparece. Histórico a partir da implantação do relatório (27/10/2026).
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-5 md:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              buscar()
            }}
          >
            <div className="space-y-2">
              <Label>Código da peça</Label>
              <Input inputMode="numeric" placeholder="Ex.: 12822" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>De</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Até</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Setor</Label>
              <Select value={setor} onValueChange={setSetor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {SETORES_KARDEX.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isLoading || !codigo.trim()}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {rows && rows.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">Nenhuma movimentação para este código no período.</p>
      )}

      {produto && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {produto.codigo_produto} — {produto.produto}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Saldo no fim do período{todos ? '' : ` (${setor})`}:{' '}
              <span className="font-semibold text-foreground">{num(saldoFinal)}</span> · E entrada · S saída · T
              transferência entre setores
            </CardContent>
          </Card>
          <PlanilhaTabela
            titulo="Movimentos"
            colunas={colunas}
            rows={rows}
            nomeArquivo={`movimentacao-${produto.codigo_produto}`}
            chaveLinha={(r) => String(r.ordem)}
            limiteRender={2000}
          />
        </>
      )}
    </div>
  )
}
