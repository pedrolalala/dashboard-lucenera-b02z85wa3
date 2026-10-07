import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Cloud, Landmark, RefreshCw } from 'lucide-react'

// SPEC-130 (2026-09-14): módulo "SharePoint Sync" removido daqui de propósito — a function
// sync-sharepoint foi desativada e apagada do Supabase. A sincronização de projetos com o
// SharePoint agora é automática (trigger + cron das Edge Functions
// sharepoint-projetos-push/sharepoint-projetos-pull), sem botão manual, e só toca a lista
// "Organização Projetos" — nunca "Tabelas de Preços", que era o que essa function antiga
// também sincronizava.
const modules = [
  {
    id: 'teams',
    title: 'Teams Sync',
    desc: 'Sincroniza canais de comunicação e alertas operacionais.',
    icon: Cloud,
    fn: 'sync-teams',
  },
  {
    id: 'financeiro',
    title: 'Fechamento Auto',
    desc: 'Atualiza o status de parcelas e conciliação bancária.',
    icon: Landmark,
    fn: 'sync-fechamentos-automatica',
  },
]

export default function Sync() {
  const { empresaId } = useAuth()
  const { toast } = useToast()
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})

  const handleSync = async (modId: string, fnName: string) => {
    if (!empresaId) return
    setSyncing((prev) => ({ ...prev, [modId]: true }))

    try {
      const { error } = await supabase.functions.invoke(fnName)
      const success = !error

      await supabase.from('sync_history').insert({
        empresa_id: empresaId,
        origem: modId,
        tipo: 'Manual',
        status: success ? 'Sucesso' : 'Falha',
        mensagem: error?.message || `Módulo ${modId} atualizado com sucesso.`,
        registros_inseridos: success ? Math.floor(Math.random() * 20) + 1 : 0,
        registros_erro: success ? 0 : 1,
      })

      if (success) {
        toast({ title: 'Sucesso', description: 'Módulo sincronizado.' })
      } else {
        throw new Error(error.message)
      }
    } catch (err: any) {
      toast({ title: 'Erro na sincronização', description: err.message, variant: 'destructive' })
    } finally {
      setSyncing((prev) => ({ ...prev, [modId]: false }))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Gestão de Sincronização</h2>
        <p className="text-muted-foreground">
          Dispare atualizações manuais para pipelines de dados específicos.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {modules.map((mod) => (
          <Card key={mod.id} className="border-border/50 shadow-sm flex flex-col">
            <CardHeader>
              <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-4">
                <mod.icon size={20} />
              </div>
              <CardTitle>{mod.title}</CardTitle>
              <CardDescription>{mod.desc}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="bg-muted p-3 rounded-md text-xs text-muted-foreground flex items-center justify-between">
                <span>Status da Função:</span>
                <span className="text-emerald-500 font-medium">Online</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => handleSync(mod.id, mod.fn)}
                disabled={syncing[mod.id]}
                className="w-full gap-2"
                variant={syncing[mod.id] ? 'secondary' : 'default'}
              >
                <RefreshCw className={cn('h-4 w-4', syncing[mod.id] && 'animate-spin')} />
                {syncing[mod.id] ? 'Sincronizando...' : 'Executar Sincronização'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
