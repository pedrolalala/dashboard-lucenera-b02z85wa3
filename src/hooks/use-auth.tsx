import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { consumeCodeFromUrl } from '@/lib/cross-system-auth'

interface AuthContextType {
  user: User | null
  session: Session | null
  empresaId: string | null
  hasAccess: boolean | null
  signUp: (email: string, password: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchEmpresaId = async (userId: string) => {
    const { data } = await supabase
      .from('funcionarios')
      .select('empresa_id')
      .eq('usuario_id', userId)
      .single()
    if (data?.empresa_id) setEmpresaId(data.empresa_id)
  }

  // SPEC-063 — este app não checava nenhuma permissão granular do Hub, só
  // exigia estar logado (qualquer login válido do ecossistema). Consulta a
  // mesma RPC que o Hub usa (hub_pode_executar, SPEC-006) para o sistema
  // inteiro ('dashboard-financeiro', sem módulo/ação específicos).
  const checkAccess = async (userId: string) => {
    const { data } = await supabase.rpc('hub_pode_executar', {
      p_usuario_id: userId,
      p_system_slug: 'dashboard-financeiro',
      p_modulo_chave: null,
      p_acao: null,
    })
    setHasAccess(Boolean(data))
  }

  useEffect(() => {
    let mounted = true
    let initialized = false

    const resolveSession = async (nextSession: Session | null) => {
      if (!mounted) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (nextSession?.user) {
        await Promise.all([fetchEmpresaId(nextSession.user.id), checkAccess(nextSession.user.id)])
      } else {
        setEmpresaId(null)
        setHasAccess(null)
      }
      if (mounted) setLoading(false)
    }

    // Acesso vindo da Central chega com ?sso_code na URL. onAuthStateChange
    // dispara um evento inicial com a sessão que já existia ANTES da troca
    // desse código terminar (normalmente nula, numa aba nova) — se esse
    // evento resolvesse "loading" pra false direto, o ProtectedRoute achava
    // que ninguém tinha logado e mandava pra tela de login antes da troca
    // terminar, fazendo o clique na Central "bugar". Por isso a resolução
    // real só acontece depois do consumeCodeFromUrl + getSession abaixo;
    // este listener só mantém sessão/usuário em dia para eventos depois
    // disso (login manual, logout, refresh de token).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!initialized) return
      resolveSession(nextSession)
    })

    consumeCodeFromUrl('dashboard-financeiro')
      .catch(() => {})
      .finally(async () => {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession()
        initialized = true
        await resolveSession(initialSession)
      })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  return (
    <AuthContext.Provider
      value={{ user, session, empresaId, hasAccess, signUp, signIn, signOut, loading }}
    >
      {children}
    </AuthContext.Provider>
  )
}
