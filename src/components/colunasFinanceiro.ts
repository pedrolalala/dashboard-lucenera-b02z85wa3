import type { ColunaPlanilha } from '@/components/PlanilhaTabela'
import { formatCurrency, formatarData } from '@/lib/utils'
import type { FinanceiroRow } from '@/services/cash-flow'

const statusLabel = (s: number) => (s === 1 ? 'Pago' : s === 0 ? 'Aberto' : 'Cancelado')

const naturezaLabel = (n: FinanceiroRow['natureza']) =>
  n === 'distribuicao_lucro'
    ? 'Distrib. lucro'
    : n === 'despesa_operacional'
      ? 'Desp. operacional'
      : '—'

/**
 * Colunas da "planilha" das abas financeiras (SPEC-126). Mesma ordem em Fluxo de
 * Caixa, Recebimentos e Pagamentos, para conferir com o export do Connect.
 * `Duplicata` é a chave de match linha a linha com a planilha do Sérgio.
 */
export const COLUNAS_FINANCEIRO: ColunaPlanilha<FinanceiroRow>[] = [
  {
    chave: 'cod_duplicata',
    titulo: 'Duplicata',
    texto: (r) => (r.cod_duplicata != null ? String(r.cod_duplicata) : '—'),
    ordenar: (r) => r.cod_duplicata ?? 0,
    alinhar: 'right',
  },
  { chave: 'tipo', titulo: 'Tipo', texto: (r) => (r.tipo === 'receita' ? 'Receita' : 'Despesa') },
  { chave: 'descricao', titulo: 'Descrição', texto: (r) => r.descricao ?? '' },
  { chave: 'desc_sub_grupo', titulo: 'Sub-grupo', texto: (r) => r.desc_sub_grupo ?? '—' },
  { chave: 'natureza', titulo: 'Natureza', texto: (r) => naturezaLabel(r.natureza) },
  { chave: 'status_pago', titulo: 'Status', texto: (r) => statusLabel(r.status_pago) },
  {
    chave: 'dt_emissao',
    titulo: 'Emissão',
    texto: (r) => formatarData(r.dt_emissao),
    ordenar: (r) => r.dt_emissao ?? '',
  },
  {
    chave: 'dt_vencimento',
    titulo: 'Vencimento',
    texto: (r) => formatarData(r.dt_vencimento),
    ordenar: (r) => r.dt_vencimento ?? '',
  },
  {
    chave: 'dt_pagamento',
    titulo: 'Pagamento',
    texto: (r) => formatarData(r.dt_pagamento),
    ordenar: (r) => r.dt_pagamento ?? '',
  },
  {
    chave: 'vl_parcela',
    titulo: 'Parcela',
    texto: (r) => formatCurrency(r.vl_parcela ?? 0),
    ordenar: (r) => r.vl_parcela ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'vl_desconto',
    titulo: 'Desconto',
    texto: (r) => formatCurrency(r.vl_desconto ?? 0),
    ordenar: (r) => r.vl_desconto ?? 0,
    alinhar: 'right',
  },
  {
    chave: 'vl_pago',
    titulo: 'Pago',
    texto: (r) => formatCurrency(r.vl_pago ?? 0),
    ordenar: (r) => r.vl_pago ?? 0,
    alinhar: 'right',
  },
  { chave: 'perfil', titulo: 'Perfil', texto: (r) => r.perfil ?? '—' },
]
