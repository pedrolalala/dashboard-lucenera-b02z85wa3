import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { rangePreset, type CampoData, type Periodo, type PresetPeriodo } from '@/services/cash-flow'

/**
 * SPEC-126 — filtro de período do Dashboard: intervalo livre De/Até + escolha
 * da coluna de data (pagamento × vencimento). Substitui os Selects Ano/Mês em
 * todas as telas financeiras.
 */

const PRESETS: { chave: PresetPeriodo; label: string }[] = [
  { chave: 'mes-atual', label: 'Mês atual' },
  { chave: 'mes-passado', label: 'Mês passado' },
  { chave: 'ano-atual', label: 'Este ano' },
  { chave: 'tudo', label: 'Tudo' },
]

function isoToDate(s: string | null): Date | undefined {
  return s ? new Date(`${s}T00:00:00`) : undefined
}

function dateToIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function formatarBr(iso: string): string {
  return iso.split('-').reverse().join('/')
}

function rotulo(p: Periodo): string {
  if (!p.de && !p.ate) return 'Todo o período'
  if (p.de && p.ate) {
    return p.de === p.ate ? formatarBr(p.de) : `${formatarBr(p.de)} – ${formatarBr(p.ate)}`
  }
  return p.de ? `desde ${formatarBr(p.de)}` : `até ${formatarBr(p.ate as string)}`
}

export default function PeriodFilter({
  value,
  onChange,
}: {
  value: Periodo
  onChange: (p: Periodo) => void
}) {
  const [aberto, setAberto] = useState(false)

  const range: DateRange | undefined =
    value.de || value.ate ? { from: isoToDate(value.de), to: isoToDate(value.ate) } : undefined

  const aoSelecionar = (r: DateRange | undefined) => {
    onChange({
      ...value,
      de: r?.from ? dateToIso(r.from) : null,
      ate: r?.to ? dateToIso(r.to) : r?.from ? dateToIso(r.from) : null,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        value={value.campo}
        onValueChange={(v) => v && onChange({ ...value, campo: v as CampoData })}
        className="rounded-md border border-input"
      >
        <ToggleGroupItem
          value="dt_pagamento"
          className="px-3 text-xs"
          aria-label="Filtrar por data de pagamento"
        >
          Pagamento
        </ToggleGroupItem>
        <ToggleGroupItem
          value="dt_vencimento"
          className="px-3 text-xs"
          aria-label="Filtrar por data de vencimento"
        >
          Vencimento
        </ToggleGroupItem>
      </ToggleGroup>

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[220px] justify-start gap-2 text-foreground">
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{rotulo(value)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex flex-wrap gap-1 border-b p-2">
            {PRESETS.map((p) => (
              <Button
                key={p.chave}
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onChange({ ...value, ...rangePreset(p.chave) })}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={isoToDate(value.de)}
            selected={range}
            onSelect={aoSelecionar}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
