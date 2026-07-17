import { X } from 'lucide-react'

export default function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
    >
      Filtrado por: {label}
      <X className="h-3.5 w-3.5" />
    </button>
  )
}
