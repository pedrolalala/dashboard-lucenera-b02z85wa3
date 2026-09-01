import { supabase } from '@/lib/supabase/client'

export interface FinanceiroRow {
  id: string
  tipo: 'despesa' | 'receita'
  descricao: string
  desc_sub_grupo: string | null
  desc_grupo: string | null
  natureza: 'despesa_operacional' | 'distribuicao_lucro' | null
  tipo_custo: 'fixo' | 'variavel' | 'outro' | null
  status_pago: number
  dt_emissao: string | null
  dt_pagamento: string | null
  dt_vencimento: string | null
  vl_pago: number
  vl_parcela: number
  vl_desconto: number
  /** chave da duplicata no Connect — usada para bater linha a linha com a planilha. */
  cod_duplicata: number | null
  /** SPEC-064: rótulo Ribeirão/São Paulo, classificado manualmente em /transacoes. */
  perfil: string | null
}

const COLUNAS =
  'id,tipo,descricao,desc_sub_grupo,desc_grupo,natureza,tipo_custo,status_pago,dt_emissao,dt_pagamento,dt_vencimento,vl_pago,vl_parcela,vl_desconto,cod_duplicata,perfil'

const PAGE_SIZE = 1000

export async function fetchFinanceiro(): Promise<FinanceiroRow[]> {
  const rows: FinanceiroRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('v_financeiro_realizado')
      .select(COLUNAS)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data as FinanceiroRow[]) ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

// SPEC-126 (reunião 31/08): o filtro passou de Ano/Mês para intervalo livre
// De/Até, com escolha explícita da coluna de data. "Realizado" confere por
// `dt_pagamento`; "previsto / agenda em aberto" por `dt_vencimento`. É o que
// permite reproduzir a planilha do Sérgio de um mês exato e bater KPI a KPI.
export type CampoData = 'dt_pagamento' | 'dt_vencimento'

export type PresetPeriodo = 'mes-atual' | 'mes-passado' | 'ano-atual' | 'tudo'

export interface Periodo {
  /** limite inferior inclusivo, AAAA-MM-DD, ou null para "sem início" */
  de: string | null
  /** limite superior inclusivo, AAAA-MM-DD, ou null para "sem fim" */
  ate: string | null
  campo: CampoData
}

function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Intervalo (inclusivo, AAAA-MM-DD) de um preset. `tudo` => sem limites. */
export function rangePreset(preset: PresetPeriodo): { de: string | null; ate: string | null } {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  switch (preset) {
    case 'mes-atual':
      return { de: ymd(new Date(ano, mes, 1)), ate: ymd(new Date(ano, mes + 1, 0)) }
    case 'mes-passado':
      return { de: ymd(new Date(ano, mes - 1, 1)), ate: ymd(new Date(ano, mes, 0)) }
    case 'ano-atual':
      return { de: ymd(new Date(ano, 0, 1)), ate: ymd(new Date(ano, 11, 31)) }
    case 'tudo':
      return { de: null, ate: null }
  }
}

/** Janela de mesmo tamanho imediatamente anterior a `p` (para o Δ dos KPIs). */
export function periodoAnterior(p: Periodo): Periodo | null {
  if (!p.de || !p.ate) return null
  const de = new Date(`${p.de}T00:00:00`)
  const ate = new Date(`${p.ate}T00:00:00`)
  const dias = Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1
  const novoAte = new Date(de.getTime() - 86_400_000)
  const novoDe = new Date(novoAte.getTime() - (dias - 1) * 86_400_000)
  return { ...p, de: ymd(novoDe), ate: ymd(novoAte) }
}

/**
 * Filtra por intervalo [de, ate] (inclusivo) na coluna escolhida. Sem `de` e
 * sem `ate` devolve tudo. Linha sem valor na coluna escolhida não entra quando
 * há intervalo (decisão SPEC-126: para conferência, "não pago" não conta como
 * realizado do período).
 */
export function filterFinanceiro(rows: FinanceiroRow[], periodo: Periodo): FinanceiroRow[] {
  const { de, ate, campo } = periodo
  if (!de && !ate) return rows
  return rows.filter((r) => {
    const ref = r[campo]?.slice(0, 10)
    if (!ref) return false
    if (de && ref < de) return false
    if (ate && ref > ate) return false
    return true
  })
}

/** Filtro de clique (cross-filtering) — convive com o filtro Ano/Mês, aplicado por cima dele. */
export function filterByTipoCusto(
  rows: FinanceiroRow[],
  tipoCusto: string | null,
): FinanceiroRow[] {
  if (!tipoCusto) return rows
  return rows.filter((r) => r.tipo_custo === tipoCusto)
}

export function filterByDescSubGrupo(
  rows: FinanceiroRow[],
  descSubGrupo: string | null,
): FinanceiroRow[] {
  if (!descSubGrupo) return rows
  return rows.filter((r) => r.desc_sub_grupo === descSubGrupo)
}

/** SPEC-126 Escopo 6: recorte por grupo (ex.: "INVESTIMENTO") em Contas a Pagar. */
export function filterByDescGrupo(rows: FinanceiroRow[], descGrupo: string | null): FinanceiroRow[] {
  if (!descGrupo) return rows
  return rows.filter((r) => r.desc_grupo === descGrupo)
}

/** Grupos distintos presentes nas linhas de despesa, ordenados. */
export function distinctGrupos(rows: FinanceiroRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    if (r.tipo === 'despesa' && r.desc_grupo) set.add(r.desc_grupo)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function filterByDescricao(
  rows: FinanceiroRow[],
  descricao: string | null,
): FinanceiroRow[] {
  if (!descricao) return rows
  return rows.filter((r) => r.descricao === descricao)
}

/** SPEC-064: filtro Ribeirão/São Paulo/Todos — não afeta linhas sem classificação quando "Todos". */
export function filterByPerfil(rows: FinanceiroRow[], perfil: string | null): FinanceiroRow[] {
  if (!perfil) return rows
  return rows.filter((r) => r.perfil === perfil)
}

// status_pago: 0=ABERTO, 1=PAGO, 2=CANCELADO. Cancelado nunca deve contar
// como despesa/receita nem como "em aberto" — a view v_financeiro_realizado
// ja exclui status_pago=2 na fonte (migration 20260819_121), mas o `=== 0`
// aqui fica explícito mesmo assim: nunca reintroduzir `|| status_pago === 2`
// nesse cálculo. Achado em produção, 2026-08-18 (Contas a Pagar/Receber
// mostrando duplicata cancelada como se fosse dívida em aberto).
const realizado = (r: FinanceiroRow) => r.status_pago === 1
const aberto = (r: FinanceiroRow) => r.status_pago === 0
const valorAberto = (r: FinanceiroRow) => r.vl_parcela - r.vl_desconto

export interface KpisVisaoGeral {
  receitasRealizadas: number
  despesaOperacionalTotal: number
  distribuicaoLucroTotal: number
  resultadoOperacional: number
}

export function computeKpisVisaoGeral(rows: FinanceiroRow[]): KpisVisaoGeral {
  let receitasRealizadas = 0
  let despesaOperacionalTotal = 0
  let distribuicaoLucroTotal = 0

  for (const r of rows) {
    if (!realizado(r)) continue
    if (r.tipo === 'receita') {
      receitasRealizadas += r.vl_pago
    } else if (r.natureza === 'distribuicao_lucro') {
      distribuicaoLucroTotal += r.vl_pago
    } else {
      despesaOperacionalTotal += r.vl_pago
    }
  }

  return {
    receitasRealizadas,
    despesaOperacionalTotal,
    distribuicaoLucroTotal,
    resultadoOperacional: receitasRealizadas - despesaOperacionalTotal,
  }
}

export interface FluxoDiario {
  dia: string
  receitas: number
  despesaOperacional: number
  resultado: number
  saldoAcumulado: number
}

/**
 * `despesaRows` pode ser um subconjunto filtrado de `rows` (cross-filtering por
 * tipo_custo) — a Receita por dia nunca é afetada por esse filtro, só a Despesa
 * Operacional (ver decisão da SPEC-028 Fase 2: clique em categoria de despesa
 * não zera Receita).
 */
export function computeFluxoDiario(
  rows: FinanceiroRow[],
  despesaRows: FinanceiroRow[] = rows,
): FluxoDiario[] {
  const porDia = new Map<string, { receitas: number; despesaOperacional: number }>()
  for (const r of rows) {
    if (!realizado(r) || !r.dt_pagamento || r.tipo !== 'receita') continue
    const dia = r.dt_pagamento
    if (!porDia.has(dia)) porDia.set(dia, { receitas: 0, despesaOperacional: 0 })
    porDia.get(dia)!.receitas += r.vl_pago
  }
  for (const r of despesaRows) {
    if (!realizado(r) || !r.dt_pagamento || r.natureza !== 'despesa_operacional') continue
    const dia = r.dt_pagamento
    if (!porDia.has(dia)) porDia.set(dia, { receitas: 0, despesaOperacional: 0 })
    porDia.get(dia)!.despesaOperacional += r.vl_pago
  }

  const dias = Array.from(porDia.keys()).sort()
  let acumulado = 0
  return dias.map((dia) => {
    const { receitas, despesaOperacional } = porDia.get(dia)!
    const resultado = receitas - despesaOperacional
    acumulado += resultado
    return { dia, receitas, despesaOperacional, resultado, saldoAcumulado: acumulado }
  })
}

export interface KpisContasReceber {
  vendasAVista: number
  vendasAPrazo: number
  recebimentosVendaAPrazo: number
  emAbertoReceber: number
}

export function computeKpisContasReceber(rows: FinanceiroRow[]): KpisContasReceber {
  let vendasAVista = 0
  let vendasAPrazo = 0
  let recebimentosVendaAPrazo = 0
  let emAbertoReceber = 0

  for (const r of rows) {
    if (r.tipo !== 'receita') continue
    if (realizado(r)) {
      if (r.descricao === 'VENDAS A VISTA') vendasAVista += r.vl_pago
      else if (r.descricao === 'VENDAS A PRAZO') vendasAPrazo += r.vl_pago
      else if (r.descricao === 'RECEBIMENTOS VENDA A PRAZO') recebimentosVendaAPrazo += r.vl_pago
    } else if (aberto(r)) {
      emAbertoReceber += valorAberto(r)
    }
  }

  return { vendasAVista, vendasAPrazo, recebimentosVendaAPrazo, emAbertoReceber }
}

export interface ApropriacaoReceita {
  descricao: string
  total: number
}

export function groupReceitaPorApropriacao(
  rows: FinanceiroRow[],
  limit = 10,
): ApropriacaoReceita[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (r.tipo !== 'receita' || !realizado(r)) continue
    map.set(r.descricao, (map.get(r.descricao) ?? 0) + r.vl_pago)
  }
  const sorted = Array.from(map.entries())
    .map(([descricao, total]) => ({ descricao, total }))
    .sort((a, b) => b.total - a.total)
  if (sorted.length <= limit) return sorted
  const top = sorted.slice(0, limit - 1)
  const outros = sorted.slice(limit - 1).reduce((s, x) => s + x.total, 0)
  return [...top, { descricao: 'Outros', total: outros }]
}

export interface KpisContasPagar {
  despesasComMaterial: number
  custoOperacional: number
  emAbertoPagar: number
}

const SUBGRUPO_MATERIAL = 'COM VENDAS'

export function computeKpisContasPagar(rows: FinanceiroRow[]): KpisContasPagar {
  let despesasComMaterial = 0
  let despesaOperacionalTotal = 0
  let emAbertoPagar = 0

  for (const r of rows) {
    if (r.tipo !== 'despesa') continue
    if (realizado(r) && r.natureza === 'despesa_operacional') {
      despesaOperacionalTotal += r.vl_pago
      if (r.desc_sub_grupo === SUBGRUPO_MATERIAL) despesasComMaterial += r.vl_pago
    } else if (aberto(r)) {
      emAbertoPagar += valorAberto(r)
    }
  }

  return {
    despesasComMaterial,
    custoOperacional: despesaOperacionalTotal - despesasComMaterial,
    emAbertoPagar,
  }
}

export interface SubGrupoDespesa {
  desc_sub_grupo: string
  total: number
}

export function groupDespesaPorSubGrupo(rows: FinanceiroRow[]): SubGrupoDespesa[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (r.tipo !== 'despesa' || !realizado(r) || r.natureza !== 'despesa_operacional') continue
    const chave = r.desc_sub_grupo ?? 'SEM CLASSIFICAÇÃO'
    map.set(chave, (map.get(chave) ?? 0) + r.vl_pago)
  }
  return Array.from(map.entries())
    .map(([desc_sub_grupo, total]) => ({ desc_sub_grupo, total }))
    .sort((a, b) => b.total - a.total)
}

export interface PrevistoDia {
  dia: string
  previsto: number
}

export function computePrevistoPagarPorDia(rows: FinanceiroRow[]): PrevistoDia[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (r.tipo !== 'despesa' || !aberto(r) || !r.dt_vencimento) continue
    map.set(r.dt_vencimento, (map.get(r.dt_vencimento) ?? 0) + valorAberto(r))
  }
  return Array.from(map.entries())
    .map(([dia, previsto]) => ({ dia, previsto }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

export interface CustoFixoVariavel {
  fixo: number
  variavel: number
  outro: number
}

export function computeCustoFixoVariavel(rows: FinanceiroRow[]): CustoFixoVariavel {
  let fixo = 0
  let variavel = 0
  let outro = 0
  for (const r of rows) {
    if (r.tipo !== 'despesa' || !realizado(r) || r.natureza !== 'despesa_operacional') continue
    if (r.tipo_custo === 'fixo') fixo += r.vl_pago
    else if (r.tipo_custo === 'variavel') variavel += r.vl_pago
    else outro += r.vl_pago
  }
  return { fixo, variavel, outro }
}

export interface PontoEquilibrio {
  custoFixo: number
  receitaRealizada: number
  resultado: number
  atingiuPontoEquilibrio: boolean
}

/**
 * Ponto de equilíbrio simplificado (reunião 13-07-2026): "se eu vender menos
 * que o custo fixo do mês, eu perco dinheiro". Não considera margem de
 * contribuição por produto — é a leitura literal do que foi pedido.
 */
export function computePontoEquilibrio(rows: FinanceiroRow[]): PontoEquilibrio {
  const { fixo } = computeCustoFixoVariavel(rows)
  let receitaRealizada = 0
  for (const r of rows) {
    if (r.tipo === 'receita' && realizado(r)) receitaRealizada += r.vl_pago
  }
  return {
    custoFixo: fixo,
    receitaRealizada,
    resultado: receitaRealizada - fixo,
    atingiuPontoEquilibrio: receitaRealizada >= fixo,
  }
}
