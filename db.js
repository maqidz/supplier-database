import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'suppliers.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    contact_type TEXT NOT NULL DEFAULT 'wa_direct',
    wa_number TEXT DEFAULT '',
    wa_group_link TEXT DEFAULT '',
    website_url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sku TEXT DEFAULT '',
    category TEXT DEFAULT '',
    plan TEXT DEFAULT '',
    durasi TEXT DEFAULT '',
    price REAL DEFAULT 0,
    harga_modal REAL DEFAULT 0,
    unit TEXT DEFAULT 'pcs',
    min_order INTEGER DEFAULT 1,
    status TEXT DEFAULT 'Ready',
    contact_url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Safe migrations for existing DBs
const prodCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
for (const [col, def] of [
  ['plan', "TEXT DEFAULT ''"],
  ['durasi', "TEXT DEFAULT ''"],
  ['harga_modal', 'REAL DEFAULT 0'],
  ['status', "TEXT DEFAULT 'Ready'"],
  ['contact_url', "TEXT DEFAULT ''"],
]) {
  if (!prodCols.includes(col)) {
    db.exec(`ALTER TABLE products ADD COLUMN ${col} ${def};`);
  }
}

// Default WA message template
const existingTpl = db.prepare('SELECT value FROM settings WHERE key = ?').get('wa_template');
if (!existingTpl) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
    'wa_template',
    'Halo {supplier}, saya ingin menanyakan ketersediaan stok & harga untuk produk: {product}{sku_info}. Terima kasih!'
  );
}

// Seed sample data only if empty
const supplierCount = db.prepare('SELECT COUNT(*) as count FROM suppliers').get().count;
if (supplierCount === 0) {
  const insertSupplier = db.prepare(`
    INSERT INTO suppliers (name, category, contact_type, wa_number, wa_group_link, website_url, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertProduct = db.prepare(`
    INSERT INTO products (supplier_id, name, sku, category, price, unit, min_order, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const s1 = insertSupplier.run(
    'CV Tekstil Nusantara',
    'Tekstil & Kain',
    'wa_direct',
    '081234567890',
    '',
    'https://tekstilusantara.example.com',
    'Fast response jam kerja 08:00-17:00, lokasi Bandung'
  ).lastInsertRowid;

  const s2 = insertSupplier.run(
    'Grosir Packaging Sejahtera (Grup WA)',
    'Packaging & Kardus',
    'wa_group',
    '',
    'https://chat.whatsapp.com/ContohLinkGrupSupplier',
    '',
    'Update harga & stok harian di grup WA supplier'
  ).lastInsertRowid;

  const s3 = insertSupplier.run(
    'Indo Elektronik Wholesale',
    'Elektronik & Aksesoris',
    'website',
    '085611223344',
    '',
    'https://www.indoelektronik-wholesale.example.com',
    'Order langsung via portal web B2B atau WA jika urgent'
  ).lastInsertRowid;

  const s4 = insertSupplier.run(
    'Botol & Kemasan Kosmetik ID',
    'Packaging & Botol',
    'wa_direct',
    '6281987654321',
    'https://chat.whatsapp.com/ContohGrupBotol',
    '',
    'MOQ fleksibel untuk reseller'
  ).lastInsertRowid;

  insertProduct.run(s1, 'Kain Cotton Combed 30s Hitam', 'KAI-CC30-BLK', 'Tekstil & Kain', 95000, 'kg', 5, 'Grade A reaktif');
  insertProduct.run(s1, 'Kain Fleece Gramasi 280', 'KAI-FL280', 'Tekstil & Kain', 110000, 'kg', 5, 'Cocok untuk hoodie');
  insertProduct.run(s2, 'Kardus Packing Polos 20x15x10 cm', 'PKG-KRD-2015', 'Packaging & Kardus', 2300, 'pcs', 100, 'Single wall B-flute');
  insertProduct.run(s2, 'Bubble Wrap Hitam 125cm x 50m', 'PKG-BW-50M', 'Packaging & Kardus', 135000, 'roll', 2, 'Tebal 35 micron');
  insertProduct.run(s3, 'Kabel Data Type-C Fast Charging 1m', 'ELK-USBC-1M', 'Elektronik & Aksesoris', 18500, 'pcs', 20, 'Support 3A');
  insertProduct.run(s3, 'Adaptor Charger 20W PD', 'ELK-PD20W', 'Elektronik & Aksesoris', 42000, 'pcs', 10, 'Garansi 6 bulan');
  insertProduct.run(s4, 'Botol Pump Amber 100ml', 'BTL-AMB-100', 'Packaging & Botol', 4800, 'pcs', 50, 'Tutup hitam/putih');
}

export default db;
