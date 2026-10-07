import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

/**
 * SPEC-127 Escopo 1C — filtro de marca com múltipla seleção (Estoque / Showroom).
 * Lista vazia = todas as marcas. O caso de uso do Vinícius é "ver tudo que é
 * decorativo" sem abrir marca por marca; o filtro por categoria/sub-grupo fica
 * para depois (as peças ainda não têm essa marcação).
 */
export default function MarcaMultiSelect({
  marcas,
  selecionadas,
  onChange,
}: {
  marcas: string[]
  selecionadas: string[]
  onChange: (marcas: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  const toggle = (m: string) =>
    onChange(selecionadas.includes(m) ? selecionadas.filter((x) => x !== m) : [...selecionadas, m])

  const label =
    selecionadas.length === 0
      ? 'Todas as marcas'
      : selecionadas.length === 1
        ? selecionadas[0]
        : `${selecionadas.length} marcas`

  return (
    <div className="flex items-center gap-2">
      {selecionadas.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> limpar
        </button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[220px] justify-between text-foreground"
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Buscar marca..." />
            <CommandList>
              <CommandEmpty>Nenhuma marca.</CommandEmpty>
              <CommandGroup>
                {marcas.map((m) => (
                  <CommandItem key={m} value={m} onSelect={() => toggle(m)}>
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selecionadas.includes(m) ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {m}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
