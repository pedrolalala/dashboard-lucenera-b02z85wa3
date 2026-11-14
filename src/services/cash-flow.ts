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
  /** SPEC-209 F: 'pedido_compra' = parcela de pedido de compra aprovado (sistema de Compras). */
  origem?: 'pedido_compra'
  pedido_numero?: string
  /** SPEC-258: conta ainda PREVISTA (valor/data podem mudar), vinda da view do financeiro novo. */
  previsao?: boolean | null
}

const COLUNAS =
  'id,tipo,descricao,desc_sub_grupo,desc_grupo,natureza,tipo_custo,status_pago,dt_emissao,dt_pagamento,dt_vencimento,vl_pago,vl_parcela,vl_desconto,cod_duplicata,perfil,previsao'

const PAGE_SIZE = 1000

// SPEC-258 Fase 3 passo 2: o realizado passou a ler a view do financeiro NOVO (v_financeiro_realizado_novo: legado da Connect +
// o que nasce no sistema). Pedido de compra aprovado e nota de entrada já vêm nela (a previsão do pedido diminui com a nota),
// por isso NÃO se soma mais a fonte à parte vw_contas_pagar_pedidos_compra (SPEC-209 F): somar de novo dobraria o a pagar.
// Mesmas colunas, mesmo portão de acesso (dashboard-financeiro) e mesmas 18.316 linhas do legado que a view antiga.
export async function fetchFinanceiro(): Promise<FinanceiroRow[]> {
  const rows: FinanceiroRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('v_financeiro_realizado_novo' as any)
      .select(COLUNAS)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = ((data as unknown) as FinanceiroRow[]) ?? []
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

/** Meses (AAAA-MM) presentes nas linhas, na coluna dada, mais recentes primeiro. */
export function mesesPresentes(rows: FinanceiroRow[], campo: CampoData): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const v = r[campo]?.slice(0, 7)
    if (v) set.add(v)
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a))
}

/** Primeiro e último dia (AAAA-MM-DD) de um mês AAAA-MM. */
export function intervaloDoMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split('-').map(Number)
  return { de: `${mes}-01`, ate: ymd(new Date(a, m, 0)) }
}

/** "AAAA-MM" -> "set/2026". */
export function rotuloMesAaaaMm(mes: string): string {
  const [a, m] = mes.split('-')
  const nome = new Date(Number(a), Number(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
  return `${nome}/${a}`
}

/** Se `p` cobre exatamente um mês-calendário, devolve "AAAA-MM"; senão null. */
export function mesDoPeriodo(p: Periodo): string | null {
  if (!p.de || !p.ate) return null
  const mes = p.de.slice(0, 7)
  const { de, ate } = intervaloDoMes(mes)
  return p.de === de && p.ate === ate ? mes : null
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
  return rows.filter((r) => tipoCustoDe(r) === tipoCusto)
}

export function filterByDescSubGrupo(
  rows: FinanceiroRow[],
  descSubGrupo: string | null,
): FinanceiroRow[] {
  if (!descSubGrupo) return rows
  return rows.filter((r) => r.desc_sub_grupo === descSubGrupo)
}

/** SPEC-126 Escopo 6: recorte por grupo (ex.: "INVESTIMENTO") em Contas a Pagar. */
export function filterByDescGrupo(
  rows: FinanceiroRow[],
  descGrupo: string | null,
): FinanceiroRow[] {
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

const GRUPO_INVESTIMENTO_RE = /investimento/i

/**
 * SPEC-127 Escopo 3: total gasto (realizado) classificado como Investimento no
 * período. Fica à parte do Resultado Operacional e do Ponto de Equilíbrio —
 * mesma lógica do card Necessidade de Compra.
 */
export function computeInvestimentoRealizado(rows: FinanceiroRow[]): number {
  let total = 0
  for (const r of rows) {
    if (r.tipo !== 'despesa' || !realizado(r)) continue
    if (r.desc_grupo && GRUPO_INVESTIMENTO_RE.test(r.desc_grupo)) total += r.vl_pago
  }
  return total
}

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

// SPEC-126 (reunião 31/08) — aba "Fluxo Futuro (Projeção)". Tudo que está EM
// ABERTO (status_pago = 0), agrupado por MÊS de dt_vencimento, daqui pra
// frente: "quanto ainda entra e quanto ainda sai, e em que mês". Bate com o
// export do Connect — soma de (vl_parcela - vl_desconto) das parcelas em
// aberto por mês de vencimento (mesma conta do "Em Aberto" das outras abas).

function ym(iso: string): string {
  return iso.slice(0, 7)
}

function rotuloMes(chave: string): string {
  if (chave === 'vencido') return 'Vencido'
  const [a, m] = chave.split('-')
  const nome = new Date(Number(a), Number(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
  return `${nome}/${a}`
}

/**
 * Balde de mês do fluxo futuro para uma data de vencimento: `'vencido'` (venceu
 * antes de hoje e não foi pago) ou `'AAAA-MM'`. É a chave usada tanto para
 * agregar quanto para o cross-filter de clique no gráfico.
 */
export function baldeVencimento(dtVencimento: string | null): string | null {
  if (!dtVencimento) return null
  const venc = dtVencimento.slice(0, 10)
  return venc < ymd(new Date()) ? 'vencido' : ym(venc)
}

/** Janela do fluxo futuro: de hoje até o fim do mês atual + (meses - 1). */
export function janelaFuturo(meses: number): { de: string; ate: string } {
  const hoje = new Date()
  return {
    de: ymd(hoje),
    ate: ymd(new Date(hoje.getFullYear(), hoje.getMonth() + meses, 0)),
  }
}

export interface FluxoFuturoMes {
  chave: string
  rotulo: string
  aReceber: number
  aPagar: number
  saldoMes: number
  saldoAcumulado: number
}

/**
 * `rows` já deve vir filtrado pela janela/perfil desejados. Considera só
 * status_pago = 0 com dt_vencimento. Parcela vencida e ainda não paga cai no
 * balde "Vencido" (primeira linha); as demais, no mês de vencimento. O saldo
 * acumulado parte de zero — é o efeito líquido projetado sobre o caixa a
 * partir de hoje, não inclui o saldo atual em banco.
 */
export function computeFluxoFuturoPorMes(rows: FinanceiroRow[]): FluxoFuturoMes[] {
  const map = new Map<string, { aReceber: number; aPagar: number }>()
  for (const r of rows) {
    if (!aberto(r) || !r.dt_vencimento) continue
    const chave = baldeVencimento(r.dt_vencimento)!
    const b = map.get(chave) ?? { aReceber: 0, aPagar: 0 }
    if (r.tipo === 'receita') b.aReceber += valorAberto(r)
    else b.aPagar += valorAberto(r)
    map.set(chave, b)
  }
  const chaves = Array.from(map.keys()).sort((a, b) => {
    if (a === 'vencido') return -1
    if (b === 'vencido') return 1
    return a.localeCompare(b)
  })
  let acumulado = 0
  return chaves.map((chave) => {
    const { aReceber, aPagar } = map.get(chave)!
    const saldoMes = aReceber - aPagar
    acumulado += saldoMes
    return {
      chave,
      rotulo: rotuloMes(chave),
      aReceber,
      aPagar,
      saldoMes,
      saldoAcumulado: acumulado,
    }
  })
}

export interface FluxoQuatroColunasMes {
  chave: string
  rotulo: string
  receitaRealizada: number
  receitaPrevista: number
  /** parte da receita prevista que ainda é PREVISÃO (valor/data podem mudar). */
  receitaPrevisao: number
  despesaRealizada: number
  despesaPrevista: number
  despesaPrevisao: number
  saldo: number
}

/**
 * SPEC-258 Fase 5 — Fluxo Futuro em 4 colunas: receita realizada | receita prevista | despesa realizada | despesa prevista (+ saldo).
 *  - REALIZADA = status_pago = 1, no mês de dt_pagamento, valor pago (só os últimos `mesesAtras` meses, para a tabela não virar histórico inteiro).
 *  - PREVISTA = tudo que ainda vai entrar/sair: status_pago = 0, no mês de dt_vencimento, valor líquido (parcela - desconto). Conta vencida e não paga
 *    cai na linha "Vencido". Pendência 31/12 (data-lixo da Connect) fica de fora, como no resto da tela. `*Previsao` é a parte ainda prevista (não firme).
 *  - saldo do mês = (receita realizada + prevista) - (despesa realizada + prevista).
 * `mesesFrente` limita os meses futuros (null = todos).
 */
export function computeFluxoQuatroColunas(
  rows: FinanceiroRow[],
  opts: { mesesAtras: number; mesesFrente: number | null },
): FluxoQuatroColunasMes[] {
  const hoje = new Date()
  const primeiroMes = ym(ymd(new Date(hoje.getFullYear(), hoje.getMonth() - opts.mesesAtras, 1)))
  const ultimoMes =
    opts.mesesFrente === null ? null : ym(ymd(new Date(hoje.getFullYear(), hoje.getMonth() + opts.mesesFrente - 1, 1)))
  const vazio = () => ({
    receitaRealizada: 0, receitaPrevista: 0, receitaPrevisao: 0,
    despesaRealizada: 0, despesaPrevista: 0, despesaPrevisao: 0,
  })
  const map = new Map<string, ReturnType<typeof vazio>>()
  const bucket = (chave: string) => {
    let b = map.get(chave)
    if (!b) { b = vazio(); map.set(chave, b) }
    return b
  }
  for (const r of rows) {
    const receita = r.tipo === 'receita'
    if (realizado(r) && r.dt_pagamento) {
      const mes = ym(r.dt_pagamento)
      if (mes < primeiroMes || (ultimoMes !== null && mes > ultimoMes)) continue
      const b = bucket(mes)
      if (receita) b.receitaRealizada += r.vl_pago
      else b.despesaRealizada += r.vl_pago
    } else if (aberto(r) && r.dt_vencimento && !ehPendencia3112(r.dt_vencimento)) {
      const chave = baldeVencimento(r.dt_vencimento)!
      if (chave !== 'vencido' && ultimoMes !== null && chave > ultimoMes) continue
      const b = bucket(chave)
      const v = valorAberto(r)
      if (receita) { b.receitaPrevista += v; if (r.previsao) b.receitaPrevisao += v }
      else { b.despesaPrevista += v; if (r.previsao) b.despesaPrevisao += v }
    }
  }
  return Array.from(map.keys())
    .sort((a, b) => (a === 'vencido' ? -1 : b === 'vencido' ? 1 : a.localeCompare(b)))
    .map((chave) => {
      const b = map.get(chave)!
      return {
        chave,
        rotulo: rotuloMes(chave),
        ...b,
        saldo: b.receitaRealizada + b.receitaPrevista - b.despesaRealizada - b.despesaPrevista,
      }
    })
}

export interface GastoFuturoGrupo {
  grupo: string
  subGrupo: string
  parcelas: number
  total: number
}

/** Despesa em aberto (status_pago = 0) agregada por grupo + sub-grupo. */
export function computeGastoFuturoPorGrupo(rows: FinanceiroRow[]): GastoFuturoGrupo[] {
  const map = new Map<string, GastoFuturoGrupo>()
  for (const r of rows) {
    if (!aberto(r) || r.tipo !== 'despesa' || !r.dt_vencimento) continue
    const grupo = r.desc_grupo ?? 'SEM GRUPO'
    const subGrupo = r.desc_sub_grupo ?? 'SEM SUB-GRUPO'
    const chave = `${grupo}||${subGrupo}`
    const b = map.get(chave) ?? { grupo, subGrupo, parcelas: 0, total: 0 }
    b.parcelas += 1
    b.total += valorAberto(r)
    map.set(chave, b)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

/**
 * SPEC-127 Escopo 5 — "pendência 31/12". O Connect joga título em aberto sem
 * vencimento real para 31 de dezembro (de qualquer ano). Esses títulos saem da
 * visão do Fluxo Futuro e vão para a aba "31-12 / Pendências".
 */
export function ehPendencia3112(dtVencimento: string | null): boolean {
  if (!dtVencimento) return false
  return dtVencimento.slice(5, 10) === '12-31'
}

export interface PendenciaAno {
  ano: string
  aReceber: number
  aPagar: number
  qtdReceber: number
  qtdPagar: number
}

/** Pendências 31/12 em aberto (status_pago = 0) agrupadas por ano de vencimento. */
export function computePendencias3112PorAno(rows: FinanceiroRow[]): PendenciaAno[] {
  const map = new Map<string, PendenciaAno>()
  for (const r of rows) {
    if (!aberto(r) || !ehPendencia3112(r.dt_vencimento)) continue
    const ano = r.dt_vencimento!.slice(0, 4)
    const b = map.get(ano) ?? { ano, aReceber: 0, aPagar: 0, qtdReceber: 0, qtdPagar: 0 }
    if (r.tipo === 'receita') {
      b.aReceber += valorAberto(r)
      b.qtdReceber += 1
    } else {
      b.aPagar += valorAberto(r)
      b.qtdPagar += 1
    }
    map.set(ano, b)
  }
  return Array.from(map.values()).sort((a, b) => a.ano.localeCompare(b.ano))
}

export interface AbertoPorGrupo {
  grupo: string
  aReceber: number
  aPagar: number
}

/**
 * Em aberto (status_pago = 0) por `desc_grupo`, separando receber × pagar. É o
 * drill-down do gráfico do Fluxo Futuro quando um mês está selecionado
 * ("composição de setembro por grupo").
 */
export function computeAbertoPorGrupo(rows: FinanceiroRow[]): AbertoPorGrupo[] {
  const map = new Map<string, AbertoPorGrupo>()
  for (const r of rows) {
    if (!aberto(r) || !r.dt_vencimento) continue
    const grupo = r.desc_grupo ?? 'SEM GRUPO'
    const b = map.get(grupo) ?? { grupo, aReceber: 0, aPagar: 0 }
    if (r.tipo === 'receita') b.aReceber += valorAberto(r)
    else b.aPagar += valorAberto(r)
    map.set(grupo, b)
  }
  return Array.from(map.values()).sort((a, b) => b.aReceber + b.aPagar - (a.aReceber + a.aPagar))
}

export interface FatiaDespesaFutura {
  nome: string
  total: number
  parcelas: number
}

/**
 * Repartição da DESPESA em aberto (status_pago = 0) por `desc_grupo` ou
 * `desc_sub_grupo` — alimenta o gráfico de pizza do Fluxo Futuro. Só despesa:
 * o chefe reclamou que clicar numa despesa trazia receita junto (ex.: "VENDAS
 * A PRAZO" aparecendo sob "ADMINISTRATIVAS"). `rows` já vem recortado por
 * mês/perfil/grupo pelo chamador.
 */
export function computeDespesaAbertoPorDimensao(
  rows: FinanceiroRow[],
  dimensao: 'grupo' | 'sub_grupo',
): FatiaDespesaFutura[] {
  const map = new Map<string, FatiaDespesaFutura>()
  for (const r of rows) {
    if (!aberto(r) || r.tipo !== 'despesa' || !r.dt_vencimento) continue
    const nome =
      dimensao === 'grupo' ? (r.desc_grupo ?? 'SEM GRUPO') : (r.desc_sub_grupo ?? 'SEM SUB-GRUPO')
    const f = map.get(nome) ?? { nome, total: 0, parcelas: 0 }
    f.total += valorAberto(r)
    f.parcelas += 1
    map.set(nome, f)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

export interface TotaisFluxoFuturo {
  aReceber: number
  aPagar: number
  saldo: number
  aReceberVencido: number
  aPagarVencido: number
}

export function computeTotaisFluxoFuturo(rows: FinanceiroRow[]): TotaisFluxoFuturo {
  const hoje = ymd(new Date())
  let aReceber = 0
  let aPagar = 0
  let aReceberVencido = 0
  let aPagarVencido = 0
  for (const r of rows) {
    if (!aberto(r) || !r.dt_vencimento) continue
    const v = valorAberto(r)
    const vencido = r.dt_vencimento.slice(0, 10) < hoje
    if (r.tipo === 'receita') {
      aReceber += v
      if (vencido) aReceberVencido += v
    } else {
      aPagar += v
      if (vencido) aPagarVencido += v
    }
  }
  return { aReceber, aPagar, saldo: aReceber - aPagar, aReceberVencido, aPagarVencido }
}

// SPEC-286 (Filippo, 13/11/2026): cada despesa operacional cai numa categoria de custo, e cada
// categoria é fixa ou variável. A classificação é feita aqui, pela apropriação (`descricao`) e, no
// que sobrar, pelo sub-grupo. Substitui o `tipo_custo` da view (default de 13/07, nunca validado),
// que contava o prêmio de vendas como fixo e deixava aluguel e despesas dos sócios em "outro".
export type TipoCustoCategoria = 'fixo' | 'variavel'

export type CategoriaCustoId =
  | 'produtos'
  | 'impostos'
  | 'comissoes'
  | 'rt'
  | 'fretes'
  | 'pessoal'
  | 'estrutura'
  | 'veiculos'
  | 'marketing'
  | 'socios'
  | 'investimentos'
  | 'outros'

export interface CategoriaCustoDef {
  id: CategoriaCustoId
  nome: string
  tipo: TipoCustoCategoria
}

export const CATEGORIAS_CUSTO: CategoriaCustoDef[] = [
  { id: 'produtos', nome: 'Produtos', tipo: 'variavel' },
  { id: 'impostos', nome: 'Impostos sobre vendas', tipo: 'variavel' },
  { id: 'comissoes', nome: 'Comissões da equipe', tipo: 'variavel' },
  { id: 'rt', nome: 'RT e pontos de arquitetos', tipo: 'variavel' },
  { id: 'fretes', nome: 'Fretes', tipo: 'variavel' },
  { id: 'pessoal', nome: 'Pessoal', tipo: 'fixo' },
  { id: 'estrutura', nome: 'Estrutura', tipo: 'fixo' },
  { id: 'veiculos', nome: 'Veículos', tipo: 'fixo' },
  { id: 'marketing', nome: 'Marketing', tipo: 'fixo' },
  { id: 'socios', nome: 'Despesas dos sócios', tipo: 'fixo' },
  { id: 'investimentos', nome: 'Investimentos', tipo: 'fixo' },
  { id: 'outros', nome: 'Outros', tipo: 'fixo' },
]

const CATEGORIA_POR_ID = new Map(CATEGORIAS_CUSTO.map((c) => [c.id, c]))

const CATEGORIA_POR_APROPRIACAO: Record<string, CategoriaCustoId> = {
  'COMPRAS - REVENDA': 'produtos',
  INDUSTRIALIZAÇÃO: 'produtos',
  IMPORTAÇÃO: 'produtos',
  'SINAL DE COMPRA': 'produtos',
  'DAS NACIONAL': 'impostos',
  'DARE-ICMS': 'impostos',
  COFINS: 'impostos',
  PIS: 'impostos',
  IRPJ: 'impostos',
  CSLL: 'impostos',
  ISSQN: 'impostos',
  'PRÊMIO DE VENDAS': 'comissoes',
  RT: 'rt',
  'CLUBE MAIS PONTOS': 'rt',
  'FRETE ENTRADA': 'fretes',
  'FRETE SAÍDA': 'fretes',
  CORREIOS: 'fretes',
  'TAXIS / FRETES ADM': 'fretes',
  PUBLICIDADE: 'marketing',
  'CLUBE MAIS MENSAL': 'marketing',
  ALUGUEL: 'estrutura',
  'ALUGUEL SÃO PAULO': 'estrutura',
  'CONDOMINIO - SÃO PAULO': 'estrutura',
  'MANUTENÇÃO CONTA': 'estrutura',
  'AUTOMAÇÕES - IA': 'estrutura',
}

const SUBGRUPOS_ESTRUTURA = new Set(['ADMINISTRATIVAS', 'FIXAS', 'BANCARIAS'])

const maiusculo = (s: string | null) => (s ?? '').trim().toUpperCase()

/** Categoria de custo de uma linha de despesa (SPEC-286). */
export function categoriaCustoDe(r: FinanceiroRow): CategoriaCustoId {
  if (GRUPO_INVESTIMENTO_RE.test(r.desc_grupo ?? '')) return 'investimentos'
  const porApropriacao = CATEGORIA_POR_APROPRIACAO[maiusculo(r.descricao)]
  if (porApropriacao) return porApropriacao
  const subGrupo = maiusculo(r.desc_sub_grupo)
  if (subGrupo === 'OPERACIONAL') return 'socios'
  if (subGrupo === 'COM PESSOAL') return 'pessoal'
  if (subGrupo === 'VEICULOS') return 'veiculos'
  if (subGrupo === 'PRODUTOS') return 'produtos'
  if (SUBGRUPOS_ESTRUTURA.has(subGrupo)) return 'estrutura'
  return 'outros'
}

const despesaOperacionalRealizada = (r: FinanceiroRow) =>
  r.tipo === 'despesa' && realizado(r) && r.natureza === 'despesa_operacional'

/** Fixo ou variável de uma linha; `null` para o que não é despesa operacional. */
export function tipoCustoDe(r: FinanceiroRow): TipoCustoCategoria | null {
  if (r.tipo !== 'despesa' || r.natureza !== 'despesa_operacional') return null
  return CATEGORIA_POR_ID.get(categoriaCustoDe(r))!.tipo
}

export interface CustoCategoria extends CategoriaCustoDef {
  total: number
  /** apropriações que compõem a categoria no período, da maior para a menor. */
  itens: { descricao: string; total: number }[]
}

/** Despesa operacional realizada por categoria, da maior para a menor (só as que têm valor). */
export function computeCustosPorCategoria(rows: FinanceiroRow[]): CustoCategoria[] {
  const totais = new Map<CategoriaCustoId, { total: number; itens: Map<string, number> }>()
  for (const r of rows) {
    if (!despesaOperacionalRealizada(r)) continue
    const id = categoriaCustoDe(r)
    let b = totais.get(id)
    if (!b) {
      b = { total: 0, itens: new Map() }
      totais.set(id, b)
    }
    b.total += r.vl_pago
    const descricao = r.descricao || 'SEM DESCRIÇÃO'
    b.itens.set(descricao, (b.itens.get(descricao) ?? 0) + r.vl_pago)
  }
  return CATEGORIAS_CUSTO.filter((c) => (totais.get(c.id)?.total ?? 0) !== 0)
    .map((c) => {
      const b = totais.get(c.id)!
      return {
        ...c,
        total: b.total,
        itens: Array.from(b.itens.entries())
          .map(([descricao, total]) => ({ descricao, total }))
          .sort((x, y) => y.total - x.total),
      }
    })
    .sort((a, b) => b.total - a.total)
}

export interface CustoFixoVariavel {
  fixo: number
  variavel: number
}

export function computeCustoFixoVariavel(rows: FinanceiroRow[]): CustoFixoVariavel {
  let fixo = 0
  let variavel = 0
  for (const r of rows) {
    if (!despesaOperacionalRealizada(r)) continue
    if (tipoCustoDe(r) === 'variavel') variavel += r.vl_pago
    else fixo += r.vl_pago
  }
  return { fixo, variavel }
}

export interface PontoEquilibrio {
  receitaRealizada: number
  custoVariavel: number
  custoFixo: number
  distribuicaoLucro: number
  /** (receita − variáveis) / receita; null sem receita no período. */
  margemContribuicao: number | null
  /** receita necessária para ficar no zero; null sem receita ou com margem ≤ 0. */
  receitaEquilibrio: number | null
  /** receita realizada − receita de equilíbrio. */
  diferenca: number | null
  atingiuPontoEquilibrio: boolean
}

/**
 * Ponto de equilíbrio (SPEC-286): quanto é preciso receber no período para pagar os custos fixos
 * e a distribuição de lucro, dado que de cada real recebido só a margem de contribuição sobra
 * depois dos custos variáveis (produto, imposto, comissão, RT, frete).
 *
 *   receita de equilíbrio = (custo fixo + distribuição de lucro) / margem de contribuição
 *
 * Base caixa, como o resto da tela. A distribuição só chega para quem pode vê-la (o banco filtra).
 */
export function computePontoEquilibrio(rows: FinanceiroRow[]): PontoEquilibrio {
  const { fixo, variavel } = computeCustoFixoVariavel(rows)
  let receitaRealizada = 0
  let distribuicaoLucro = 0
  for (const r of rows) {
    if (!realizado(r)) continue
    if (r.tipo === 'receita') receitaRealizada += r.vl_pago
    else if (r.natureza === 'distribuicao_lucro') distribuicaoLucro += r.vl_pago
  }
  const margemContribuicao =
    receitaRealizada > 0 ? (receitaRealizada - variavel) / receitaRealizada : null
  const receitaEquilibrio =
    margemContribuicao !== null && margemContribuicao > 0
      ? (fixo + distribuicaoLucro) / margemContribuicao
      : null
  const diferenca = receitaEquilibrio === null ? null : receitaRealizada - receitaEquilibrio
  return {
    receitaRealizada,
    custoVariavel: variavel,
    custoFixo: fixo,
    distribuicaoLucro,
    margemContribuicao,
    receitaEquilibrio,
    diferenca,
    atingiuPontoEquilibrio: diferenca !== null && diferenca >= 0,
  }
}
