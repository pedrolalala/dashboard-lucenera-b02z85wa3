import { supabase } from '@/lib/supabase/client'

export interface NecessidadeCompraRow {
  pendente: number
  preco_custo: number | null
}

// SPEC-041: `pendente` é coluna nova (SPEC-039) em `vw_necessidade_compra` —
// ainda não presente nos tipos gerados deste submodule (`src/lib/supabase/
// types.ts`), por isso o cast `as any` nesta chamada específica. Confirmado
// no Supabase real que a coluna existe e tem GRANT SELECT para
// anon/authenticated/service_role.
const COLUNAS = 'pendente,preco_custo'
const PAGE_SIZE = 1000

export async function fetchNecessidadeCompra(): Promise<NecessidadeCompraRow[]> {
  const rows: NecessidadeCompraRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await (supabase as any)
      .from('vw_necessidade_compra')
      .select(COLUNAS)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data as NecessidadeCompraRow[]) ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

/**
 * Gasto Futuro Inevitável (reunião 21/07/2026, Filippo) — déficit líquido de
 * estoque (`pendente`, já descontando pedidos de compra em aberto, SPEC-039)
 * valorizado ao custo de reposição (`preco_custo`). É um gasto que ainda vai
 * acontecer, categorizado à parte do fluxo de caixa realizado — nunca deve
 * ser somado aos KPIs de `computeKpisVisaoGeral`.
 */
export function computeGastoFuturoInevitavel(rows: NecessidadeCompraRow[]): number {
  return rows.reduce((s, r) => s + r.pendente * (r.preco_custo ?? 0), 0)
}
