-- Dashboard Initialization Migration
DO $$
DECLARE
  new_user_id uuid;
  empresa_id_var uuid;
BEGIN
  -- 1. Ensure at least one company exists
  SELECT id INTO empresa_id_var FROM public.empresas LIMIT 1;
  IF NOT FOUND THEN
    empresa_id_var := gen_random_uuid();
    INSERT INTO public.empresas (id, nome, razao_social, cnpj, cor_hex, cidade, estado, ativo)
    VALUES (empresa_id_var, 'Lucenera', 'Lucenera Iluminação', '00000000000000', '#D4AF37', 'São Paulo', 'SP', true);
  END IF;

  -- 2. Seed Admin User
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'pedro@lucenera.com.br') THEN
    new_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id, '00000000-0000-0000-0000-000000000000', 'pedro@lucenera.com.br',
      crypt('Skip@Pass', gen_salt('bf')), NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}', '{"name": "Pedro"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    -- 3. Link user to company via funcionarios
    INSERT INTO public.funcionarios (id, usuario_id, empresa_id, nome, cargo, status)
    VALUES (gen_random_uuid(), new_user_id, empresa_id_var, 'Pedro', 'Administrador', 'Ativo');
  END IF;
END $$;

-- 4. Create sync_history table
CREATE TABLE IF NOT EXISTS public.sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  origem TEXT NOT NULL,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL,
  registros_inseridos INT DEFAULT 0,
  registros_erro INT DEFAULT 0,
  mensagem TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_history_empresa ON public.sync_history(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_created_at ON public.sync_history(created_at);

-- 5. RLS Policies
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_sync_history" ON public.sync_history;
CREATE POLICY "auth_sync_history" ON public.sync_history
  FOR ALL TO authenticated USING (empresa_id IN (SELECT empresa_id FROM public.funcionarios WHERE usuario_id = auth.uid())) WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.funcionarios WHERE usuario_id = auth.uid()));

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_empresas" ON public.empresas;
CREATE POLICY "auth_empresas" ON public.empresas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Create Dashboard Views
CREATE OR REPLACE VIEW public.vw_projetos_dashboard AS
SELECT empresa_id, count(*) as total_projetos FROM public.projetos GROUP BY empresa_id;

CREATE OR REPLACE VIEW public.vw_vendas_por_projeto AS
SELECT empresa_id, COALESCE(SUM(valor_total), 0) as total_vendas FROM public.projetos GROUP BY empresa_id;
