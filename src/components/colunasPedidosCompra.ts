import type { ColunaPlanilha } from '@/components/PlanilhaTabela'
import { formatCurrency, formatarData } from '@/lib/utils'
import type { PedidoCompraParcelaAberta, PrevisaoCompra } from '@/services/pedidos-compra-futuro'

const statusParcelaLabel = (s: string) => (s === 'atrasado' ? 'Atrasado' : 'Pendente')

/** SPEC-128 Bloco 2 — parcelas em aberto do app interno de Compras. */
export const COLUNAS_PEDIDOS_COMPRA: ColunaPlanilha<PedidoCompraParcelaAberta>[] = [
  { chave: 'numero', titulo: 'Pedido', texto: (r) => r.numero },
  { chave: 'fornecedor', titulo: 'Fornecedor', texto: (r) => r.fornecedorNome ?? '—' },
  {
    chave: 'numeroParcela',
    titulo: 'Parcela',
    texto: (r) => String(r.numeroParcela),
    ordenar: (r) => r.numeroParcela,
    alinhar: 'right',
  },
  {
    chave: 'valor',
    titulo: 'Valor',
    texto: (r) => formatCurrency(r.valor),
    ordenar: (r) => r.valor,
    alinhar: 'right',
  },
  {
    chave: 'dataVencimento',
    titulo: 'Vencimento',
    texto: (r) => formatarData(r.dataVencimento),
    ordenar: (r) => r.dataVencimento,
  },
  { chave: 'status', titulo: 'Status', texto: (r) => statusParcelaLabel(r.status) },
]

/** SPEC-128 Bloco 3 — export Connect "PedidoCompra", já deduplicado (P-03). */
export const COLUNAS_PREVISOES_COMPRA: ColunaPlanilha<PrevisaoCompra>[] = [
  {
    chave: 'codigoPedido',
    titulo: 'Pedido',
    texto: (r) => String(r.codigoPedido),
    ordenar: (r) => r.codigoPedido,
    alinhar: 'right',
  },
  { chave: 'fornecedor', titulo: 'Fornecedor', texto: (r) => r.fornecedorNome },
  {
    chave: 'valor',
    titulo: 'Valor',
    texto: (r) => formatCurrency(r.valor),
    ordenar: (r) => r.valor,
    alinhar: 'right',
  },
  {
    chave: 'data',
    titulo: 'Data',
    texto: (r) => formatarData(r.data),
    ordenar: (r) => r.data,
  },
  {
    chave: 'origemData',
    titulo: 'Origem da data',
    texto: (r) => (r.origemData === 'vencimento_real' ? 'Vencimento real' : 'Estimado (emissão)'),
  },
]
