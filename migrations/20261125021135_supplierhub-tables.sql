-- SupplierHub dedicated tables (prefixed to avoid collision with other project tables)

CREATE TABLE IF NOT EXISTS public.supplierhub_suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Produk Digital',
  contact_type TEXT NOT NULL DEFAULT 'wa_direct' CHECK (contact_type IN ('wa_direct', 'wa_group', 'website')),
  wa_number TEXT NOT NULL DEFAULT '',
  wa_group_link TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplierhub_products (
  id BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT NOT NULL REFERENCES public.supplierhub_suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  durasi TEXT NOT NULL DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  harga_modal NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'akun',
  min_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Ready',
  contact_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplierhub_products_supplier_id ON public.supplierhub_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplierhub_products_category ON public.supplierhub_products(category);

CREATE TABLE IF NOT EXISTS public.supplierhub_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.supplierhub_settings (key, value)
VALUES (
  'wa_template',
  'Halo {supplier}, saya ingin menanyakan ketersediaan stok & harga untuk produk: {product}{sku_info}. Terima kasih!'
)
ON CONFLICT (key) DO NOTHING;

-- Lock down direct anon/authenticated access; all CRUD runs through server admin client
ALTER TABLE public.supplierhub_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplierhub_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplierhub_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supplierhub_suppliers FROM anon, authenticated;
REVOKE ALL ON TABLE public.supplierhub_products FROM anon, authenticated;
REVOKE ALL ON TABLE public.supplierhub_settings FROM anon, authenticated;
