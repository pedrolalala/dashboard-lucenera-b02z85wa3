import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search } from 'lucide-react'

export default function Logs() {
  const { empresaId } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!empresaId) return
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('sync_history')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (data) setLogs(data)
    }
    fetchLogs()

    const sub = supabase
      .channel('logs_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sync_history' },
        fetchLogs,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(sub)
    }
  }, [empresaId])

  const filteredLogs = logs.filter(
    (l) =>
      l.mensagem?.toLowerCase().includes(search.toLowerCase()) ||
      l.origem?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Histórico de Logs</h2>
        <p className="text-muted-foreground">Trilha de auditoria das execuções de sincronização.</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <div className="p-4 border-b flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar mensagens ou origem..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm border-0 shadow-none focus-visible:ring-0 px-0"
          />
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data / Hora</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Inseridos</TableHead>
                <TableHead className="text-right">Erros</TableHead>
                <TableHead>Mensagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="font-medium capitalize">{log.origem}</TableCell>
                    <TableCell>
                      <Badge
                        variant={log.status === 'Sucesso' ? 'default' : 'destructive'}
                        className={
                          log.status === 'Sucesso' ? 'bg-emerald-500 hover:bg-emerald-600' : ''
                        }
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{log.registros_inseridos}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {log.registros_erro}
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[250px]" title={log.mensagem}>
                      {log.mensagem}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
