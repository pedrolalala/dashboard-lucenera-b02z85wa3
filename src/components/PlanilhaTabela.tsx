import { useMemo, useState } from 'react'
import { ChevronDown, ChevronsUpDown, ChevronUp, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * SPEC-126 — "a planilha no fim de cada aba". Tabela transação-a-transação (ou
 * linha-a-linha) do que alimenta os KPIs da tela, para conferir com o export do
 * Connect sem sair do dashboard. Ordenável por coluna + exporta CSV do conjunto
 * inteiro (o render é limitado para não travar com milhares de linhas).
 */

export interface ColunaPlanilha<T> {
  chave: string
  titulo: string
  /** Texto exibido na célula e no CSV (já formatado). */
  texto: (row: T) => string
  /** Valor usado para ordenar. Se devolver número, ordena numérico. Default: `texto`. */
  ordenar?: (row: T) => string | number
  alinhar?: 'left' | 'right'
}

type Dir = 'asc' | 'desc'

function baixarCsv(nome: string, cabecalho: string[], linhas: string[][]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const corpo = [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n')
  const blob = new Blob([`﻿${corpo}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function PlanilhaTabela<T>({
  titulo,
  descricao,
  colunas,
  rows,
  nomeArquivo,
  chaveLinha,
  limiteRender = 500,
}: {
  titulo: string
  descricao?: string
  colunas: ColunaPlanilha<T>[]
  rows: T[]
  nomeArquivo: string
  chaveLinha?: (row: T, i: number) => string
  limiteRender?: number
}) {
  const [sort, setSort] = useState<{ chave: string; dir: Dir } | null>(null)

  const ordenadas = useMemo(() => {
    if (!sort) return rows
    const col = colunas.find((c) => c.chave === sort.chave)
    if (!col) return rows
    const key = col.ordenar ?? ((r: T) => col.texto(r))
    const arr = [...rows].sort((a, b) => {
      const va = key(a)
      const vb = key(b)
      if (typeof va === 'number' && typeof vb === 'number') return va - vb
      return String(va).localeCompare(String(vb), 'pt-BR')
    })
    return sort.dir === 'asc' ? arr : arr.reverse()
  }, [rows, sort, colunas])

  const visiveis = ordenadas.slice(0, limiteRender)

  const toggleSort = (chave: string) =>
    setSort((prev) =>
      prev?.chave === chave
        ? { chave, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { chave, dir: 'asc' },
    )

  const exportar = () =>
    baixarCsv(
      nomeArquivo,
      colunas.map((c) => c.titulo),
      ordenadas.map((r) => colunas.map((c) => c.texto(r))),
    )

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{titulo}</CardTitle>
          {descricao && <p className="mt-1 text-xs text-muted-foreground">{descricao}</p>}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          onClick={exportar}
          disabled={ordenadas.length === 0}
        >
          <Download className="h-4 w-4" /> CSV ({ordenadas.length})
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[540px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
              <tr>
                {colunas.map((c) => {
                  const ativo = sort?.chave === c.chave
                  const Icon = !ativo ? ChevronsUpDown : sort?.dir === 'asc' ? ChevronUp : ChevronDown
                  return (
                    <th
                      key={c.chave}
                      onClick={() => toggleSort(c.chave)}
                      className={cn(
                        'cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground',
                        c.alinhar === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          c.alinhar === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {c.titulo}
                        <Icon className="h-3 w-3" />
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr>
                  <td
                    colSpan={colunas.length}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    Nenhuma linha nesta seleção.
                  </td>
                </tr>
              ) : (
                visiveis.map((r, i) => (
                  <tr
                    key={chaveLinha ? chaveLinha(r, i) : i}
                    className="border-t border-border/40 hover:bg-muted/20"
                  >
                    {colunas.map((c) => (
                      <td
                        key={c.chave}
                        className={cn(
                          'whitespace-nowrap px-3 py-1.5',
                          c.alinhar === 'right' && 'text-right tabular-nums',
                        )}
                      >
                        {c.texto(r)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {ordenadas.length > limiteRender && (
          <p className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
            Mostrando as primeiras {limiteRender} de {ordenadas.length} linhas — baixe o CSV para a
            lista completa.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
