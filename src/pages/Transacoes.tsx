import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Tags } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface TransacaoRow {
  id: string
  tipo: string
  descricao: string | null
  dt_pagamento: string | null
  dt_vencimento: string | null
  vl_pago: number
  vl_parcela: number
  perfil: string | null
}

const PAGE_SIZE = 300

function fmtDate(v: string | null) {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00')
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR')
}

export default function Transacoes() {
  const { toast } = useToast()
  const [rows, setRows] = useState<TransacaoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [naoClassificadas, setNaoClassificadas] = useState(true)
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('transacoes')
      .select('id, tipo, descricao, dt_pagamento, dt_vencimento, vl_pago, vl_parcela, perfil')
      .order('dt_pagamento', { ascending: false, nullsFirst: false })
      .order('dt_vencimento', { ascending: false, nullsFirst: false })
      .limit(PAGE_SIZE)

    if (naoClassificadas) query = query.is('perfil', null)
    if (search.trim()) query = query.ilike('descricao', `%${search.trim()}%`)

    const { data, error } = await query
    if (error) {
      toast({
        title: 'Erro ao carregar transações',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      setRows((data as TransacaoRow[]) ?? [])
    }
    setLoading(false)
  }, [naoClassificadas, search, toast])

  useEffect(() => {
    const timer = setTimeout(fetchRows, 300)
    return () => clearTimeout(timer)
  }, [fetchRows])

  async function handlePerfilChange(id: string, valor: string) {
    setSavingId(id)
    const perfil = valor === 'none' ? null : valor
    const { error } = await supabase.from('transacoes').update({ perfil }).eq('id', id)
    setSavingId(null)
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
      return
    }
    setRows((prev) =>
      naoClassificadas && perfil !== null
        ? prev.filter((r) => r.id !== id)
        : prev.map((r) => (r.id === id ? { ...r, perfil } : r)),
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-light uppercase tracking-widest text-foreground">
          Classificar Transações por Perfil
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Marque cada lançamento do livro-caixa como Ribeirão ou São Paulo — rótulo só de
          visualização, usado no filtro das telas de Contas a Pagar/Receber.
        </p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tags className="h-4 w-4 text-primary" />
            Lançamentos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Input
              placeholder="Buscar por descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2">
              <Switch checked={naoClassificadas} onCheckedChange={setNaoClassificadas} />
              <Label className="text-sm text-muted-foreground">Só não classificadas</Label>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Nenhuma transação encontrada.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-[180px]">Perfil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[280px] truncate text-sm">
                        {r.descricao || '—'}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{r.tipo}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.dt_pagamento)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.dt_vencimento)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(r.vl_pago || r.vl_parcela || 0)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={r.perfil || 'none'}
                          onValueChange={(v) => handlePerfilChange(r.id, v)}
                          disabled={savingId === r.id}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Não classificado" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Não classificado</SelectItem>
                            <SelectItem value="ribeirao">Ribeirão</SelectItem>
                            <SelectItem value="sao_paulo">São Paulo</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {rows.length === PAGE_SIZE && (
            <p className="text-xs text-muted-foreground text-center">
              Mostrando os {PAGE_SIZE} lançamentos mais recentes que batem com o filtro. Refine a
              busca para ver outros.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
