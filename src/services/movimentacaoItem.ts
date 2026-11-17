import { supabase } from '@/lib/supabase/client'

/**
 * SPEC-231 G1 — "Movimentação do item" (kardex): o que aconteceu no estoque da
 * empresa, igual ao relatório da Connect. Venda aprovada já é saída (S); a
 * entrega não aparece. Fonte: RPC relatorio_movimentacao_item (migration 251).
 */
export interface MovimentoItem {
  ordem: number
  data: string
  codigo_produto: number
  produto: string
  historico: string
  /** E entrada · S saída · D devolução · T transferência entre setores · I saldo inicial · '' saldo anterior */
  tipo: string
  quantidade: number | null
  saldo_setor: number
  saldo_geral: number
  setor: string
  usuario: string | null
  sistema: string | null
  /** SPEC-319: nota e fornecedor (entrada/cancelamento de NF); venda e cliente (venda, devolução, MOV de venda) */
  nota: string | null
  fornecedor: string | null
  venda: string | null
  cliente: string | null
}

// valor = nome gravado no kardex; rótulo = como a equipe fala
export const SETORES_KARDEX = [
  { valor: 'Estoque', rotulo: 'Estoque Geral' },
  { valor: 'Showroom', rotulo: 'Showroom' },
] as const

export async function fetchMovimentacaoItem(params: {
  codigo: string
  inicio: string | null
  fim: string | null
  setor: string | null
}): Promise<MovimentoItem[]> {
  const { data, error } = await (supabase as any).rpc('relatorio_movimentacao_item', {
    p_codigo: params.codigo.trim(),
    p_inicio: params.inicio || null,
    p_fim: params.fim || null,
    p_setor: params.setor || null,
  })
  if (error) throw error
  return ((data as any[]) || []).map((r) => ({
    ...r,
    quantidade: r.quantidade == null ? null : Number(r.quantidade),
    saldo_setor: Number(r.saldo_setor),
    saldo_geral: Number(r.saldo_geral),
  }))
}
