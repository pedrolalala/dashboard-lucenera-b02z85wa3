import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { hexToHSL } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

const schema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  razao_social: z.string().min(1, 'Razão Social é obrigatória'),
  cnpj: z.string().min(14, 'CNPJ inválido'),
  cidade: z.string().min(1, 'Cidade é obrigatória'),
  estado: z.string().min(2, 'Estado inválido').max(2),
  cor_hex: z.string().regex(/^#[0-9A-F]{6}$/i, 'Cor inválida (use #HEX)'),
})

export default function Settings() {
  const { empresaId } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: '',
      razao_social: '',
      cnpj: '',
      cidade: '',
      estado: '',
      cor_hex: '#0F172A',
    },
  })

  useEffect(() => {
    if (empresaId) {
      supabase
        .from('empresas')
        .select('*')
        .eq('id', empresaId)
        .single()
        .then(({ data }) => {
          if (data)
            form.reset({
              nome: data.nome || '',
              razao_social: data.razao_social || '',
              cnpj: data.cnpj || '',
              cidade: data.cidade || '',
              estado: data.estado || '',
              cor_hex: data.cor_hex || '#0F172A',
            })
          setLoading(false)
        })
    }
  }, [empresaId, form])

  const onSubmit = async (values: z.infer<typeof schema>) => {
    if (!empresaId) return
    const { error } = await supabase.from('empresas').update(values).eq('id', empresaId)
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Configurações atualizadas', description: 'As alterações foram aplicadas.' })
      document.documentElement.style.setProperty('--primary', hexToHSL(values.cor_hex))
    }
  }

  if (loading)
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    )

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações da Empresa</h2>
        <p className="text-muted-foreground">
          Gerencie as informações fiscais e a identidade visual do dashboard.
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle>Dados Gerais</CardTitle>
          <CardDescription>Informações utilizadas em relatórios e cabeçalhos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Fantasia</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="razao_social"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Razão Social</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="estado"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado (UF)</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cor_hex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cor Primária (Tema)</FormLabel>
                      <div className="flex gap-2 items-center">
                        <FormControl>
                          <Input type="color" {...field} className="w-12 h-10 p-1 cursor-pointer" />
                        </FormControl>
                        <Input
                          value={field.value}
                          onChange={field.onChange}
                          className="flex-1 font-mono uppercase"
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Salvando...' : 'Salvar Configurações'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
