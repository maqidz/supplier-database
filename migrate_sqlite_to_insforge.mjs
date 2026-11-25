import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createAdminClient } from '@insforge/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

const baseUrl = process.env.INSFORGE_URL;
const apiKey = process.env.INSFORGE_API_KEY;
if (!baseUrl || !apiKey) {
  console.error('Missing INSFORGE_URL or INSFORGE_API_KEY in .env');
  process.exit(1);
}

const admin = createAdminClient({ baseUrl, apiKey });
const sqlite = new DatabaseSync(path.join(__dirname, 'data', 'suppliers.db'));

const localSuppliers = sqlite.prepare('SELECT * FROM suppliers ORDER BY id ASC').all();
const localProducts = sqlite.prepare('SELECT * FROM products ORDER BY id ASC').all();
const localSettings = sqlite.prepare('SELECT * FROM settings').all();

// Check if already migrated
const { data: existingSup, error: checkErr } = await admin.database
  .from('supplierhub_suppliers')
  .select('id')
  .limit(1);

if (checkErr) {
  console.error('Failed checking InsForge table:', checkErr);
  process.exit(1);
}

if (existingSup && existingSup.length > 0) {
  console.log('InsForge supplierhub_suppliers already has data. Skipping to avoid duplicates.');
  process.exit(0);
}

console.log(`Migrating ${localSuppliers.length} suppliers and ${localProducts.length} products to InsForge...`);

const idMap = new Map();

// Insert suppliers in a single batch
const supplierPayload = localSuppliers.map((s) => ({
  name: s.name,
  category: s.category || 'Produk Digital',
  contact_type: ['wa_direct', 'wa_group', 'website'].includes(s.contact_type) ? s.contact_type : 'wa_direct',
  wa_number: s.wa_number || '',
  wa_group_link: s.wa_group_link || '',
  website_url: s.website_url || '',
  notes: s.notes || '',
}));

const { data: insertedSuppliers, error: supErr } = await admin.database
  .from('supplierhub_suppliers')
  .insert(supplierPayload)
  .select('id, name');

if (supErr) {
  console.error('Error inserting suppliers:', supErr);
  process.exit(1);
}

for (let i = 0; i < localSuppliers.length; i++) {
  idMap.set(localSuppliers[i].id, insertedSuppliers[i].id);
}

// Insert products in chunks of 100
const productPayload = localProducts
  .map((p) => {
    const newSupId = idMap.get(p.supplier_id);
    if (!newSupId) return null;
    return {
      supplier_id: newSupId,
      name: p.name,
      sku: p.sku || '',
      category: p.category || '',
      plan: p.plan || '',
      durasi: p.durasi || '',
      price: Number(p.price) || 0,
      harga_modal: Number(p.harga_modal) || 0,
      unit: p.unit || 'akun',
      min_order: Math.max(1, Number(p.min_order) || 1),
      status: p.status || 'Ready',
      contact_url: p.contact_url || '',
      notes: p.notes || '',
    };
  })
  .filter(Boolean);

for (let i = 0; i < productPayload.length; i += 100) {
  const chunk = productPayload.slice(i, i + 100);
  const { error: prodErr } = await admin.database
    .from('supplierhub_products')
    .insert(chunk);
  if (prodErr) {
    console.error(`Error inserting products chunk ${i}:`, prodErr);
    process.exit(1);
  }
}

for (const st of localSettings) {
  await admin.database
    .from('supplierhub_settings')
    .upsert([{ key: st.key, value: st.value }], { onConflict: 'key' });
}

console.log(`Migration complete! Inserted ${insertedSuppliers.length} suppliers and ${productPayload.length} products into InsForge Postgres.`);
