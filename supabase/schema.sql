-- ============================================================================
-- ValidaMerc — Estrutura de Banco de Dados para Supabase (PostgreSQL)
-- Cole este código no SQL Editor do seu projeto Supabase e clique em "Run"
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.validamerc_products (
  id TEXT PRIMARY KEY,
  reduced_code TEXT,                 -- Código Reduzido (ex: 1042)
  barcode TEXT NOT NULL,             -- Código de Barras (EAN-13 / EAN-8 / UPC)
  name TEXT NOT NULL,                -- Descrição do Produto / Nome
  supplier_code TEXT,                -- Código de Fornecedor
  supplier TEXT DEFAULT 'Fornecedor Padrão',
  brand TEXT DEFAULT 'Marca Própria',
  category TEXT DEFAULT 'Mercearia',
  location TEXT DEFAULT 'Corredor Principal',
  batch_code TEXT,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'un',
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  expiration_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'promocao', 'descartado')),
  presence_status TEXT NOT NULL DEFAULT 'presente' CHECK (presence_status IN ('presente', 'ruptura', 'reposicao')),
  last_audited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para busca rápida por código de barras, código reduzido e validade
CREATE INDEX IF NOT EXISTS idx_validamerc_products_barcode
  ON public.validamerc_products (barcode);

CREATE INDEX IF NOT EXISTS idx_validamerc_products_reduced_code
  ON public.validamerc_products (reduced_code);

CREATE INDEX IF NOT EXISTS idx_validamerc_products_expiration
  ON public.validamerc_products (expiration_date);

-- Tabela de Auditorias (Presença, Validade e Inventário)
CREATE TABLE IF NOT EXISTS public.validamerc_audits (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('presenca', 'validade', 'inventario')),
  auditor_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  total_items INTEGER NOT NULL DEFAULT 0,
  divergences_count INTEGER NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.validamerc_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validamerc_audits ENABLE ROW LEVEL SECURITY;

-- Política para permitir acesso via Service Role Key (usada pelo backend server.ts)
CREATE POLICY "Service role full access products"
  ON public.validamerc_products
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access audits"
  ON public.validamerc_audits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
