import { supabase } from '@/lib/supabase/client'
import { baldeVencimento } from '@/services/cash-flow'

// SPEC-128. Duas fontes novas para o Fluxo Futuro, nenhuma delas
// `v_financeiro_realizado`:
//   - Bloco 2 "Pedidos de Compra": pedidos_compra + pedido_compra_parcelas
//     (app interno de Compras, SPEC-038).
//   - Bloco 3 "Previsões": pedido_compra (singular) + staging_pedido_compra
//     (export Connect "PedidoCompra", scripts/importar_pedido_compra.py).
// `pedidos_compra` e `pedido_compra_parcelas` NÃO existem no types.ts gerado
// deste sistema (só tem `pedido_compra` singular/`staging_pedido_compra`) —
// por isso os `.from(<nome> as any)` abaixo nessas duas chamadas. O restante
// permanece tipado normalmente.

const PAGE_SIZE = 1000

export interface PedidoCompraParcelaAberta {
  id: string
  numero: string
  fornecedorNome: string | null
  numeroParcela: number
  valor: number
  dataVencimento: string
  status: string
  perfil: string | null
}

interface PedidoCompraParcelaRow {
  id: string
  numero_parcela: number
  valor: number
  data_vencimento: string
  status: string
  pedidos_compra: {
    id: string
    numero: string
    status: string
    perfil: string | null
    contatos: { nome: string } | null
  } | null
}

/** Bloco 2 — parcelas em aberto do app interno de Compras. */
export async function fetchPedidoCompraParcelasAbertas(): Promise<PedidoCompraParcelaAberta[]> {
  const out: PedidoCompraParcelaAberta[] = []
  let from = 0
  while (true) {
    const { data, error } = await (supabase.from('pedido_compra_parcelas' as any) as any)
      .select(
        'id,numero_parcela,valor,data_vencimento,status,pedidos_compra!inner(id,numero,status,perfil,contatos!fornecedor_id(nome))',
      )
      .in('status', ['pendente', 'atrasado'])
      .neq('pedidos_compra.status', 'cancelado')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as PedidoCompraParcelaRow[]
    for (const r of page) {
      if (!r.pedidos_compra) continue
      out.push({
        id: r.id,
        numero: r.pedidos_compra.numero,
        fornecedorNome: r.pedidos_compra.contatos?.nome ?? null,
        numeroParcela: r.numero_parcela,
        valor: r.valor,
        dataVencimento: r.data_vencimento,
        status: r.status,
        perfil: r.pedidos_compra.perfil,
      })
    }
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

/** `numero` do tipo `PC-LEGADO-<codigo_pedido>` -> `codigo_pedido` (P-03). */
async function fetchCodigosPedidoLegado(): Promise<Set<number>> {
  const out = new Set<number>()
  let from = 0
  while (true) {
    const { data, error } = await (supabase.from('pedidos_compra' as any) as any)
      .select('numero')
      .like('numero', 'PC-LEGADO-%')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as { numero: string }[]
    for (const r of page) {
      const m = /^PC-LEGADO-(\d+)$/.exec(r.numero ?? '')
      if (m) out.add(Number(m[1]))
    }
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

interface PedidoCompraHeaderRow {
  codigo_pedido: number
  nome_fornecedor: string
  valor_nota: number
  data_emissao: string
}

interface StagingPedidoCompraRow {
  codigo_pedido: number | null
  nm_fornecedor: string | null
  dt_vencimento: string | null
  vl_duplicata: number | null
}

export interface PrevisaoCompra {
  codigoPedido: number
  fornecedorNome: string
  valor: number
  /** ISO AAAA-MM-DD */
  data: string
  origemData: 'vencimento_real' | 'estimado_emissao'
}

/** `staging_pedido_compra` grava data como texto DD/MM/AAAA — não ISO. */
function parseDataConnect(v: string | null): string | null {
  if (!v) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim())
  if (!m) return null
  const [, d, mo, a] = m
  return `${a}-${mo}-${d}`
}

/**
 * Bloco 3 — export Connect "PedidoCompra" (pedido_compra + staging_pedido_compra),
 * excluindo os `codigo_pedido` já duplicados em `pedidos_compra` como
 * `PC-LEGADO-*` (P-03, dedup determinística). Quando alguma parcela do pedido
 * tem `dt_vencimento` real na planilha, gera 1 linha por parcela (dado real);
 * senão, 1 linha para o pedido inteiro com `valor_nota`/`data_emissao`
 * (estimativa).
 */
export async function fetchPrevisoesCompra(): Promise<PrevisaoCompra[]> {
  const legado = await fetchCodigosPedidoLegado()

  const headers: PedidoCompraHeaderRow[] = []
  {
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('pedido_compra')
        .select('codigo_pedido,nome_fornecedor,valor_nota,data_emissao')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = (data ?? []) as PedidoCompraHeaderRow[]
      headers.push(...page)
      if (page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  const staging: StagingPedidoCompraRow[] = []
  {
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('staging_pedido_compra')
        .select('codigo_pedido,nm_fornecedor,dt_vencimento,vl_duplicata')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = (data ?? []) as StagingPedidoCompraRow[]
      staging.push(...page)
      if (page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  const stagingPorPedido = new Map<number, StagingPedidoCompraRow[]>()
  for (const s of staging) {
    if (s.codigo_pedido == null) continue
    const arr = stagingPorPedido.get(s.codigo_pedido) ?? []
    arr.push(s)
    stagingPorPedido.set(s.codigo_pedido, arr)
  }

  const out: PrevisaoCompra[] = []
  for (const h of headers) {
    if (legado.has(h.codigo_pedido)) continue // P-03: já conta em Pedidos de Compra
    const parcelasComVencimento = (stagingPorPedido.get(h.codigo_pedido) ?? []).filter(
      (s) => s.dt_vencimento && s.vl_duplicata != null,
    )
    if (parcelasComVencimento.length > 0) {
      for (const p of parcelasComVencimento) {
        const data = parseDataConnect(p.dt_vencimento)
        if (!data) continue
        out.push({
          codigoPedido: h.codigo_pedido,
          fornecedorNome: p.nm_fornecedor || h.nome_fornecedor,
          valor: p.vl_duplicata!,
          data,
          origemData: 'vencimento_real',
        })
      }
    } else {
      out.push({
        codigoPedido: h.codigo_pedido,
        fornecedorNome: h.nome_fornecedor,
        valor: h.valor_nota,
        data: h.data_emissao,
        origemData: 'estimado_emissao',
      })
    }
  }
  return out
}

export function computeTotalPedidosCompraAberto(parcelas: PedidoCompraParcelaAberta[]): number {
  return parcelas.reduce((s, p) => s + p.valor, 0)
}

export function computeTotalPrevisoes(previsoes: PrevisaoCompra[]): number {
  return previsoes.reduce((s, p) => s + p.valor, 0)
}

/** Soma por balde de mês (`baldeVencimento`), para eventual uso em gráfico. */
export function computePedidosCompraAbertoPorMes(
  parcelas: PedidoCompraParcelaAberta[],
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const p of parcelas) {
    const chave = baldeVencimento(p.dataVencimento)
    if (!chave) continue
    map[chave] = (map[chave] ?? 0) + p.valor
  }
  return map
}

export function computePrevisoesPorBucket(previsoes: PrevisaoCompra[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const p of previsoes) {
    const chave = baldeVencimento(p.data) ?? 'vencido'
    map[chave] = (map[chave] ?? 0) + p.valor
  }
  return map
}
