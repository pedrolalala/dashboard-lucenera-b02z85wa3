import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { rotuloMesAaaaMm } from '@/services/cash-flow'

/**
 * SPEC-127 Escopo 4 — atalho "Mês" nas telas financeiras (o mesmo que já existe
 * no Fluxo Futuro). Escolher um mês preenche o intervalo De/Até daquele mês; o
 * `<PeriodFilter>` ao lado continua funcionando para intervalos livres.
 */
export default function MesSelect({
  meses,
  value,
  onChange,
}: {
  meses: string[]
  value: string | null
  onChange: (mes: string | null) => void
}) {
  return (
    <Select value={value ?? 'custom'} onValueChange={(v) => onChange(v === 'custom' ? null : v)}>
      <SelectTrigger className="w-[130px] text-foreground">
        <SelectValue placeholder="Mês" />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        <SelectItem value="custom">Intervalo livre</SelectItem>
        {meses.map((m) => (
          <SelectItem key={m} value={m}>
            {rotuloMesAaaaMm(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
