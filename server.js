import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3456;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
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

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method;

  // --- SUPPLIERS ---
  if (pathname === '/api/suppliers' && method === 'GET') {
    const rows = db.prepare(`
      SELECT s.*, COUNT(p.id) as product_count
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC, s.id DESC
    `).all();
    return sendJson(res, 200, rows);
  }

  if (pathname === '/api/suppliers' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: 'Nama supplier wajib diisi' });

    const contactType = validateContactType(body.contact_type);
    const stmt = db.prepare(`
      INSERT INTO suppliers (name, category, contact_type, wa_number, wa_group_link, website_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name,
      String(body.category || '').trim(),
      contactType,
      String(body.wa_number || '').trim(),
      String(body.wa_group_link || '').trim(),
      String(body.website_url || '').trim(),
      String(body.notes || '').trim()
    );
    const created = db.prepare('SELECT *, 0 as product_count FROM suppliers WHERE id = ?').get(result.lastInsertRowid);
    return sendJson(res, 201, created);
  }

  const supplierMatch = pathname.match(/^\/api\/suppliers\/(\d+)$/);
  if (supplierMatch) {
    const id = Number(supplierMatch[1]);
    if (method === 'PUT') {
      const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: 'Supplier tidak ditemukan' });

      const body = await readBody(req);
      const name = String(body.name ?? existing.name).trim();
      if (!name) return sendJson(res, 400, { error: 'Nama supplier wajib diisi' });

      const contactType = validateContactType(body.contact_type ?? existing.contact_type);
      db.prepare(`
        UPDATE suppliers
        SET name = ?, category = ?, contact_type = ?, wa_number = ?, wa_group_link = ?, website_url = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name,
        String(body.category ?? existing.category).trim(),
        contactType,
        String(body.wa_number ?? existing.wa_number).trim(),
        String(body.wa_group_link ?? existing.wa_group_link).trim(),
        String(body.website_url ?? existing.website_url).trim(),
        String(body.notes ?? existing.notes).trim(),
        id
      );

      const updated = db.prepare(`
        SELECT s.*, COUNT(p.id) as product_count
        FROM suppliers s
        LEFT JOIN products p ON p.supplier_id = s.id
        WHERE s.id = ?
        GROUP BY s.id
      `).get(id);
      return sendJson(res, 200, updated);
    }

    if (method === 'DELETE') {
      const info = db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
      if (info.changes === 0) return sendJson(res, 404, { error: 'Supplier tidak ditemukan' });
      return sendJson(res, 200, { deleted: true, id });
    }
  }

  // --- PRODUCTS ---
  if (pathname === '/api/products' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const contactType = (url.searchParams.get('contact_type') || '').trim();
    const category = (url.searchParams.get('category') || '').trim();

    let sql = `
      SELECT
        p.*,
        s.name as supplier_name,
        s.category as supplier_category,
        s.contact_type as supplier_contact_type,
        s.wa_number as supplier_wa_number,
        s.wa_group_link as supplier_wa_group_link,
        s.website_url as supplier_website_url,
        s.notes as supplier_notes
      FROM products p
      INNER JOIN suppliers s ON s.id = p.supplier_id
      WHERE 1=1
    `;
    const params = [];

    if (q) {
      sql += ` AND (
        LOWER(p.name) LIKE ? OR
        LOWER(p.sku) LIKE ? OR
        LOWER(p.category) LIKE ? OR
        LOWER(p.notes) LIKE ? OR
        LOWER(s.name) LIKE ? OR
        LOWER(s.category) LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }

    if (contactType && contactType !== 'all') {
      sql += ` AND s.contact_type = ?`;
      params.push(contactType);
    }

    if (category && category !== 'all') {
      sql += ` AND (p.category = ? OR s.category = ?)`;
      params.push(category, category);
    }

    sql += ` ORDER BY p.updated_at DESC, p.id DESC`;
    const rows = db.prepare(sql).all(...params);
    return sendJson(res, 200, rows);
  }

  if (pathname === '/api/products' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const supplierId = Number(body.supplier_id);
    if (!name) return sendJson(res, 400, { error: 'Nama produk wajib diisi' });
    if (!supplierId) return sendJson(res, 400, { error: 'Supplier wajib dipilih' });

    const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplierId);
    if (!supplier) return sendJson(res, 404, { error: 'Supplier tidak ditemukan' });

    const result = db.prepare(`
      INSERT INTO products (supplier_id, name, sku, category, plan, durasi, price, harga_modal, unit, min_order, status, contact_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      supplierId,
      name,
      String(body.sku || '').trim(),
      String(body.category || '').trim(),
      String(body.plan || '').trim(),
      String(body.durasi || '').trim(),
      Number(body.price) || 0,
      Number(body.harga_modal) || 0,
      String(body.unit || 'pcs').trim() || 'pcs',
      Math.max(1, Number(body.min_order) || 1),
      String(body.status || 'Ready').trim() || 'Ready',
      String(body.contact_url || '').trim(),
      String(body.notes || '').trim()
    );

    const created = db.prepare(`
      SELECT p.*, s.name as supplier_name, s.category as supplier_category,
             s.contact_type as supplier_contact_type, s.wa_number as supplier_wa_number,
             s.wa_group_link as supplier_wa_group_link, s.website_url as supplier_website_url,
             s.notes as supplier_notes
      FROM products p
      INNER JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.id = ?
    `).get(result.lastInsertRowid);
    return sendJson(res, 201, created);
  }

  const productMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (productMatch) {
    const id = Number(productMatch[1]);
    if (method === 'PUT') {
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: 'Produk tidak ditemukan' });

      const body = await readBody(req);
      const name = String(body.name ?? existing.name).trim();
      const supplierId = Number(body.supplier_id ?? existing.supplier_id);
      if (!name) return sendJson(res, 400, { error: 'Nama produk wajib diisi' });

      const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplierId);
      if (!supplier) return sendJson(res, 404, { error: 'Supplier tidak ditemukan' });

      db.prepare(`
        UPDATE products
        SET supplier_id = ?, name = ?, sku = ?, category = ?, plan = ?, durasi = ?, price = ?, harga_modal = ?, unit = ?, min_order = ?, status = ?, contact_url = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        supplierId,
        name,
        String(body.sku ?? existing.sku).trim(),
        String(body.category ?? existing.category).trim(),
        String(body.plan ?? existing.plan).trim(),
        String(body.durasi ?? existing.durasi).trim(),
        body.price !== undefined ? Number(body.price) || 0 : existing.price,
        body.harga_modal !== undefined ? Number(body.harga_modal) || 0 : existing.harga_modal,
        String(body.unit ?? existing.unit).trim() || 'akun',
        body.min_order !== undefined ? Math.max(1, Number(body.min_order) || 1) : existing.min_order,
        String(body.status ?? existing.status).trim() || 'Ready',
        String(body.contact_url ?? existing.contact_url).trim(),
        String(body.notes ?? existing.notes).trim(),
        id
      );

      const updated = db.prepare(`
        SELECT p.*, s.name as supplier_name, s.category as supplier_category,
               s.contact_type as supplier_contact_type, s.wa_number as supplier_wa_number,
               s.wa_group_link as supplier_wa_group_link, s.website_url as supplier_website_url,
               s.notes as supplier_notes
        FROM products p
        INNER JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.id = ?
      `).get(id);
      return sendJson(res, 200, updated);
    }

    if (method === 'DELETE') {
      const info = db.prepare('DELETE FROM products WHERE id = ?').run(id);
      if (info.changes === 0) return sendJson(res, 404, { error: 'Produk tidak ditemukan' });
      return sendJson(res, 200, { deleted: true, id });
    }
  }

  // --- SETTINGS ---
  if (pathname === '/api/settings' && method === 'GET') {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return sendJson(res, 200, out);
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    const body = await readBody(req);
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(body)) {
      upsert.run(k, String(v ?? ''));
    }
    return sendJson(res, 200, { ok: true });
  }

  // --- EXPORT / IMPORT ---
  if (pathname === '/api/export' && method === 'GET') {
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY id ASC').all();
    const products = db.prepare('SELECT * FROM products ORDER BY id ASC').all();
    return sendJson(res, 200, { exported_at: new Date().toISOString(), suppliers, products });
  }

  return sendJson(res, 404, { error: 'Endpoint tidak ditemukan' });
}

function serveStatic(req, res, url) {
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(publicDir, safePath);

  if (!fullPath.startsWith(publicDir) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    const fallback = path.join(publicDir, 'index.html');
    if (fs.existsSync(fallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(fallback).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(fullPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Supplier DB Manager berjalan di http://localhost:${PORT}`);
});
