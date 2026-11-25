import { createAdminClient } from '@insforge/sdk';

let cachedAdmin = null;

function getAdmin() {
  if (cachedAdmin) return cachedAdmin;
  const baseUrl = process.env.INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('Server belum dikonfigurasi: set INSFORGE_URL dan INSFORGE_API_KEY di Environment Variables.');
  }
  cachedAdmin = createAdminClient({ baseUrl, apiKey });
  return cachedAdmin;
}

export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function validateContactType(type) {
  return ['wa_direct', 'wa_group', 'website'].includes(type) ? type : 'wa_direct';
}

function flattenProduct(p, supplierMap) {
  const s = supplierMap.get(Number(p.supplier_id)) || {};
  return {
    id: Number(p.id),
    supplier_id: Number(p.supplier_id),
    name: p.name || '',
    sku: p.sku || '',
    category: p.category || '',
    plan: p.plan || '',
    durasi: p.durasi || '',
    price: Number(p.price) || 0,
    harga_modal: Number(p.harga_modal) || 0,
    unit: p.unit || 'akun',
    min_order: Number(p.min_order) || 1,
    status: p.status || 'Ready',
    contact_url: p.contact_url || '',
    notes: p.notes || '',
    created_at: p.created_at,
    updated_at: p.updated_at,
    supplier_name: s.name || '',
    supplier_category: s.category || '',
    supplier_contact_type: s.contact_type || 'wa_direct',
    supplier_wa_number: s.wa_number || '',
    supplier_wa_group_link: s.wa_group_link || '',
    supplier_website_url: s.website_url || '',
    supplier_notes: s.notes || '',
  };
}

export async function handleApi(req, res, url) {
  const admin = getAdmin();
  const pathname = url.pathname;
  const method = req.method;

  // --- BOOTSTRAP (single fast roundtrip for initial page load) ---
  if (pathname === '/api/bootstrap' && method === 'GET') {
    const [
      { data: suppliers, error: supErr },
      { data: products, error: prodErr },
      { data: settingsRows, error: setErr },
    ] = await Promise.all([
      admin.database
        .from('supplierhub_suppliers')
        .select('id, name, category, contact_type, wa_number, wa_group_link, website_url, notes, updated_at')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1000),
      admin.database
        .from('supplierhub_products')
        .select('id, supplier_id, name, sku, category, plan, durasi, price, harga_modal, unit, min_order, status, contact_url, notes, updated_at')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(2000),
      admin.database.from('supplierhub_settings').select('key, value'),
    ]);

    if (supErr) throw new Error(supErr.message || 'Gagal memuat suppliers');
    if (prodErr) throw new Error(prodErr.message || 'Gagal memuat produk');
    if (setErr) throw new Error(setErr.message || 'Gagal memuat settings');

    const countMap = new Map();
    for (const p of products || []) {
      const sid = Number(p.supplier_id);
      countMap.set(sid, (countMap.get(sid) || 0) + 1);
    }

    const supplierList = (suppliers || []).map((s) => ({
      ...s,
      id: Number(s.id),
      product_count: countMap.get(Number(s.id)) || 0,
    }));

    const supplierMap = new Map(supplierList.map((s) => [s.id, s]));
    const productList = (products || []).map((p) => flattenProduct(p, supplierMap));

    const settings = {};
    for (const r of settingsRows || []) settings[r.key] = r.value;

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ suppliers: supplierList, products: productList, settings }));
    return;
  }

  // --- SUPPLIERS ---
  if (pathname === '/api/suppliers' && method === 'GET') {
    const [{ data: suppliers, error: supErr }, { data: products, error: prodErr }] = await Promise.all([
      admin.database
        .from('supplierhub_suppliers')
        .select('id, name, category, contact_type, wa_number, wa_group_link, website_url, notes, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1000),
      admin.database
        .from('supplierhub_products')
        .select('supplier_id')
        .limit(5000),
    ]);
    if (supErr) throw new Error(supErr.message || 'Gagal memuat suppliers');
    if (prodErr) throw new Error(prodErr.message || 'Gagal memuat hitungan produk');

    const countMap = new Map();
    for (const p of products || []) {
      const sid = Number(p.supplier_id);
      countMap.set(sid, (countMap.get(sid) || 0) + 1);
    }

    const rows = (suppliers || []).map((s) => ({
      ...s,
      id: Number(s.id),
      product_count: countMap.get(Number(s.id)) || 0,
    }));
    return sendJson(res, 200, rows);
  }

  if (pathname === '/api/suppliers' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: 'Nama supplier wajib diisi' });

    const { data, error } = await admin.database
      .from('supplierhub_suppliers')
      .insert([
        {
          name,
          category: String(body.category || 'Produk Digital').trim(),
          contact_type: validateContactType(body.contact_type),
          wa_number: String(body.wa_number || '').trim(),
          wa_group_link: String(body.wa_group_link || '').trim(),
          website_url: String(body.website_url || '').trim(),
          notes: String(body.notes || '').trim(),
        },
      ])
      .select()
      .single();

    if (error) throw new Error(error.message || 'Gagal menambahkan supplier');
    return sendJson(res, 201, { ...data, id: Number(data.id), product_count: 0 });
  }

  const supplierMatch = pathname.match(/^\/api\/suppliers\/(\d+)$/);
  if (supplierMatch) {
    const id = Number(supplierMatch[1]);
    if (method === 'PUT') {
      const { data: existing, error: fetchErr } = await admin.database
        .from('supplierhub_suppliers')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!existing) return sendJson(res, 404, { error: 'Supplier tidak ditemukan' });

      const body = await readBody(req);
      const name = String(body.name ?? existing.name).trim();
      if (!name) return sendJson(res, 400, { error: 'Nama supplier wajib diisi' });

      const { data: updated, error: updErr } = await admin.database
        .from('supplierhub_suppliers')
        .update({
          name,
          category: String(body.category ?? existing.category).trim(),
          contact_type: validateContactType(body.contact_type ?? existing.contact_type),
          wa_number: String(body.wa_number ?? existing.wa_number).trim(),
          wa_group_link: String(body.wa_group_link ?? existing.wa_group_link).trim(),
          website_url: String(body.website_url ?? existing.website_url).trim(),
          notes: String(body.notes ?? existing.notes).trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updErr) throw new Error(updErr.message || 'Gagal memperbarui supplier');

      const { data: prods } = await admin.database
        .from('supplierhub_products')
        .select('id')
        .eq('supplier_id', id);

      return sendJson(res, 200, {
        ...updated,
        id: Number(updated.id),
        product_count: (prods || []).length,
      });
    }

    if (method === 'DELETE') {
      const { error } = await admin.database
        .from('supplierhub_suppliers')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message || 'Gagal menghapus supplier');
      return sendJson(res, 200, { deleted: true, id });
    }
  }

  // --- PRODUCTS ---
  if (pathname === '/api/products' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const contactType = (url.searchParams.get('contact_type') || '').trim();
    const category = (url.searchParams.get('category') || '').trim();

    const [{ data: products, error: prodErr }, { data: suppliers, error: supErr }] = await Promise.all([
      admin.database
        .from('supplierhub_products')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(2000),
      admin.database
        .from('supplierhub_suppliers')
        .select('id, name, category, contact_type, wa_number, wa_group_link, website_url, notes')
        .limit(1000),
    ]);

    if (prodErr) throw new Error(prodErr.message || 'Gagal memuat produk');
    if (supErr) throw new Error(supErr.message || 'Gagal memuat supplier');

    const supplierMap = new Map((suppliers || []).map((s) => [Number(s.id), s]));
    let rows = (products || []).map((p) => flattenProduct(p, supplierMap));

    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.notes.toLowerCase().includes(q) ||
          p.supplier_name.toLowerCase().includes(q) ||
          p.supplier_category.toLowerCase().includes(q)
      );
    }
    if (contactType && contactType !== 'all') {
      rows = rows.filter((p) => p.supplier_contact_type === contactType);
    }
    if (category && category !== 'all') {
      rows = rows.filter((p) => p.category === category || p.supplier_category === category);
    }

    return sendJson(res, 200, rows);
  }

  if (pathname === '/api/products' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const supplierId = Number(body.supplier_id);
    if (!name) return sendJson(res, 400, { error: 'Nama produk wajib diisi' });
    if (!supplierId) return sendJson(res, 400, { error: 'Supplier wajib dipilih' });

    const { data: sup } = await admin.database
      .from('supplierhub_suppliers')
      .select('*')
      .eq('id', supplierId)
      .maybeSingle();
    if (!sup) return sendJson(res, 404, { error: 'Supplier tidak ditemukan' });

    const { data: created, error } = await admin.database
      .from('supplierhub_products')
      .insert([
        {
          supplier_id: supplierId,
          name,
          sku: String(body.sku || '').trim(),
          category: String(body.category || '').trim(),
          plan: String(body.plan || '').trim(),
          durasi: String(body.durasi || '').trim(),
          price: Number(body.price) || 0,
          harga_modal: Number(body.harga_modal) || 0,
          unit: String(body.unit || 'akun').trim() || 'akun',
          min_order: Math.max(1, Number(body.min_order) || 1),
          status: String(body.status || 'Ready').trim() || 'Ready',
          contact_url: String(body.contact_url || '').trim(),
          notes: String(body.notes || '').trim(),
        },
      ])
      .select()
      .single();

    if (error) throw new Error(error.message || 'Gagal menambahkan produk');
    const supplierMap = new Map([[Number(sup.id), sup]]);
    return sendJson(res, 201, flattenProduct(created, supplierMap));
  }

  const productMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (productMatch) {
    const id = Number(productMatch[1]);
    if (method === 'PUT') {
      const { data: existing, error: fetchErr } = await admin.database
        .from('supplierhub_products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!existing) return sendJson(res, 404, { error: 'Produk tidak ditemukan' });

      const body = await readBody(req);
      const name = String(body.name ?? existing.name).trim();
      const supplierId = Number(body.supplier_id ?? existing.supplier_id);
      if (!name) return sendJson(res, 400, { error: 'Nama produk wajib diisi' });

      const { data: sup } = await admin.database
        .from('supplierhub_suppliers')
        .select('*')
        .eq('id', supplierId)
        .maybeSingle();
      if (!sup) return sendJson(res, 404, { error: 'Supplier tidak ditemukan' });

      const { data: updated, error: updErr } = await admin.database
        .from('supplierhub_products')
        .update({
          supplier_id: supplierId,
          name,
          sku: String(body.sku ?? existing.sku).trim(),
          category: String(body.category ?? existing.category).trim(),
          plan: String(body.plan ?? existing.plan).trim(),
          durasi: String(body.durasi ?? existing.durasi).trim(),
          price: body.price !== undefined ? Number(body.price) || 0 : Number(existing.price) || 0,
          harga_modal: body.harga_modal !== undefined ? Number(body.harga_modal) || 0 : Number(existing.harga_modal) || 0,
          unit: String(body.unit ?? existing.unit).trim() || 'akun',
          min_order: body.min_order !== undefined ? Math.max(1, Number(body.min_order) || 1) : Number(existing.min_order) || 1,
          status: String(body.status ?? existing.status).trim() || 'Ready',
          contact_url: String(body.contact_url ?? existing.contact_url).trim(),
          notes: String(body.notes ?? existing.notes).trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updErr) throw new Error(updErr.message || 'Gagal memperbarui produk');
      const supplierMap = new Map([[Number(sup.id), sup]]);
      return sendJson(res, 200, flattenProduct(updated, supplierMap));
    }

    if (method === 'DELETE') {
      const { error } = await admin.database
        .from('supplierhub_products')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message || 'Gagal menghapus produk');
      return sendJson(res, 200, { deleted: true, id });
    }
  }

  // --- SETTINGS ---
  if (pathname === '/api/settings' && method === 'GET') {
    const { data, error } = await admin.database
      .from('supplierhub_settings')
      .select('key, value');
    if (error) throw new Error(error.message || 'Gagal memuat settings');
    const out = {};
    for (const r of data || []) out[r.key] = r.value;
    return sendJson(res, 200, out);
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    const body = await readBody(req);
    const rows = Object.entries(body).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    }));
    if (rows.length > 0) {
      const { error } = await admin.database
        .from('supplierhub_settings')
        .upsert(rows, { onConflict: 'key' });
      if (error) throw new Error(error.message || 'Gagal menyimpan settings');
    }
    return sendJson(res, 200, { ok: true });
  }

  // --- EXPORT ---
  if (pathname === '/api/export' && method === 'GET') {
    const [{ data: suppliers }, { data: products }] = await Promise.all([
      admin.database.from('supplierhub_suppliers').select('*').order('id', { ascending: true }).limit(1000),
      admin.database.from('supplierhub_products').select('*').order('id', { ascending: true }).limit(5000),
    ]);
    return sendJson(res, 200, {
      exported_at: new Date().toISOString(),
      suppliers: suppliers || [],
      products: products || [],
    });
  }

  return sendJson(res, 404, { error: 'Endpoint tidak ditemukan' });
}
