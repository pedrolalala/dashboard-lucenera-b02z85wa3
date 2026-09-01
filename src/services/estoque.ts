import { supabase } from '@/lib/supabase/client'

export interface EstoqueProdutoRow {
  produto_id: string
  codigo_produto: number | null
  produto: string
  marca_id: string | null
  marca: string
  estoque_total: number
  estoque_disponivel: number
  estoque_showroom: number
  custo_unitario: number
  venda_unitaria: number
  valor_custo_total: number
  valor_venda_total: number
  valor_custo_disponivel: number
  valor_venda_disponivel: number
  valor_custo_negativo: number
  valor_venda_negativo: number
  valor_custo_showroom: number
  mkp: number | null
}

const COLUNAS =
  'produto_id,codigo_produto,produto,marca_id,marca,estoque_total,estoque_disponivel,estoque_showroom,custo_unitario,venda_unitaria,valor_custo_total,valor_venda_total,valor_custo_disponivel,valor_venda_disponivel,valor_custo_negativo,valor_venda_negativo,valor_custo_showroom,mkp'

const PAGE_SIZE = 1000

export async function fetchEstoque(): Promise<EstoqueProdutoRow[]> {
  const rows: EstoqueProdutoRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('v_estoque_produtos')
      .select(COLUNAS)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data as EstoqueProdutoRow[]) ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

export function distinctMarcas(rows: EstoqueProdutoRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.marca))).sort()
}

export function filterByMarca(
  rows: EstoqueProdutoRow[],
  marca: string | null,
): EstoqueProdutoRow[] {
  if (!marca) return rows
  return rows.filter((r) => r.marca === marca)
}

export interface KpisEstoque {
  valorCustoTotal: number
  valorVendaTotal: number
  cmvDisponivel: number
  vendaDisponivel: number
  cmvNegativos: number
  vendaNegativos: number
  valorCustoShowroom: number
  valorVendaShowroom: number
  /** SPEC-126 Escopo 5: "De Cliente / Reservado" — base do seguro do estoque. */
  valorCustoReservado: number
  valorVendaReservado: number
}

/**
 * Qtd reservada (comprometida com projeto de cliente) derivada dos campos da
 * view: `disponivel = total + showroom - reservado` (definição do Connect,
 * reunião 31/08). Enquanto `v_estoque_produtos` não expõe `estoque_reservado`
 * direto (SPEC-126 Escopo 5), calcula aqui.
 */
export function reservadoQtd(r: EstoqueProdutoRow): number {
  return Math.max(
    0,
    (r.estoque_total ?? 0) + (r.estoque_showroom ?? 0) - (r.estoque_disponivel ?? 0),
  )
}

export function computeKpisEstoque(rows: EstoqueProdutoRow[]): KpisEstoque {
  const kpis: KpisEstoque = {
    valorCustoTotal: 0,
    valorVendaTotal: 0,
    cmvDisponivel: 0,
    vendaDisponivel: 0,
    cmvNegativos: 0,
    vendaNegativos: 0,
    valorCustoShowroom: 0,
    valorVendaShowroom: 0,
    valorCustoReservado: 0,
    valorVendaReservado: 0,
  }
  for (const r of rows) {
    kpis.valorCustoTotal += r.valor_custo_total
    kpis.valorVendaTotal += r.valor_venda_total
    kpis.cmvDisponivel += r.valor_custo_disponivel
    kpis.vendaDisponivel += r.valor_venda_disponivel
    kpis.cmvNegativos += r.valor_custo_negativo
    kpis.vendaNegativos += r.valor_venda_negativo
    kpis.valorCustoShowroom += r.valor_custo_showroom
    kpis.valorVendaShowroom += Math.max(0, r.estoque_showroom ?? 0) * (r.venda_unitaria ?? 0)
    const resv = reservadoQtd(r)
    kpis.valorCustoReservado += resv * (r.custo_unitario ?? 0)
    kpis.valorVendaReservado += resv * (r.venda_unitaria ?? 0)
  }
  return kpis
}

export interface MarcaAgregada {
  marca: string
  skus: number
  valorCustoDisponivel: number
  valorVendaDisponivel: number
  valorCustoShowroom: number
}

export function groupByMarca(rows: EstoqueProdutoRow[]): MarcaAgregada[] {
  const map = new Map<string, MarcaAgregada>()
  for (const r of rows) {
    if (!map.has(r.marca)) {
      map.set(r.marca, {
        marca: r.marca,
        skus: 0,
        valorCustoDisponivel: 0,
        valorVendaDisponivel: 0,
        valorCustoShowroom: 0,
      })
    }
    const m = map.get(r.marca)!
    m.skus += 1
    m.valorCustoDisponivel += r.valor_custo_disponivel
    m.valorVendaDisponivel += r.valor_venda_disponivel
    m.valorCustoShowroom += r.valor_custo_showroom
  }
  return Array.from(map.values()).sort((a, b) => b.valorCustoDisponivel - a.valorCustoDisponivel)
}

export interface ProdutoDeficit {
  produto_id: string
  produto: string
  marca: string
  deficit_qtd: number
  valor_custo_negativo: number
}

export function topDeficit(rows: EstoqueProdutoRow[], limit = 15): ProdutoDeficit[] {
  return rows
    .filter((r) => r.estoque_disponivel < 0)
    .map((r) => ({
      produto_id: r.produto_id,
      produto: r.produto,
      marca: r.marca,
      deficit_qtd: -r.estoque_disponivel,
      valor_custo_negativo: r.valor_custo_negativo,
    }))
    .sort((a, b) => b.valor_custo_negativo - a.valor_custo_negativo)
    .slice(0, limit)
}

export interface MkpMarca {
  marca: string
  produtosComMkp: number
  mkpMedio: number
  mkpMinimo: number
  mkpMaximo: number
}

export function groupMkpByMarca(rows: EstoqueProdutoRow[]): MkpMarca[] {
  const map = new Map<string, number[]>()
  for (const r of rows) {
    if (r.mkp === null || r.mkp === undefined) continue
    if (!map.has(r.marca)) map.set(r.marca, [])
    map.get(r.marca)!.push(r.mkp)
  }
  return Array.from(map.entries())
    .map(([marca, valores]) => ({
      marca,
      produtosComMkp: valores.length,
      mkpMedio: valores.reduce((a, b) => a + b, 0) / valores.length,
      mkpMinimo: Math.min(...valores),
      mkpMaximo: Math.max(...valores),
    }))
    .sort((a, b) => b.mkpMedio - a.mkpMedio)
}

export type SortDir = 'asc' | 'desc'

export function sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  const sorted = [...rows].sort((a, b) => {
    const va = a[key]
    const vb = b[key]
    if (typeof va === 'number' && typeof vb === 'number') return va - vb
    return String(va).localeCompare(String(vb))
  })
  return dir === 'asc' ? sorted : sorted.reverse()
}
