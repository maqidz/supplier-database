import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'data', 'import_sheet.csv');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseRupiah(val) {
  const digits = String(val || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function extractContact(raw) {
  const str = String(raw || '').trim();
  const urlMatch = str.match(/https?:\/\/\S+/i);
  const url = urlMatch ? urlMatch[0] : '';
  const withoutUrl = str.replace(/https?:\/\/\S+/gi, '').trim();
  let digits = withoutUrl.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (digits.startsWith('8') && digits.length >= 9) digits = '62' + digits;
  else if (digits.startsWith('6385134452517')) digits = '62' + digits.slice(2);

  let contactType = 'wa_direct';
  if (url.includes('chat.whatsapp.com')) contactType = 'wa_group';
  else if (url && !digits) contactType = 'website';

  return {
    contactType,
    waNumber: digits,
    waGroupLink: url.includes('chat.whatsapp.com') ? url : '',
    websiteUrl: url && !url.includes('chat.whatsapp.com') ? url : '',
  };
}

const rawCsv = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(rawCsv);

// Parse product-supplier entries
const entries = [];
let mode = null;
let curProd = '';
let curPlan = '';

for (const r of rows) {
  const c0 = (r[0] || '').trim();
  if (c0 === 'Produk' && (r[2] || '').trim() === 'Supplier') {
    mode = 'turnitin';
    curProd = '';
    curPlan = '';
    continue;
  }
  if (c0 === 'Produk' && (r[5] || '').trim() === 'Supplier') {
    mode = 'standard';
    curProd = '';
    curPlan = '';
    continue;
  }
  if (!r.some((c) => c.trim() !== '')) continue;

  if (mode === 'turnitin') {
    if (c0) curProd = c0;
    const supName = (r[2] || '').trim();
    if (!supName) continue;
    const plan = (r[1] || '').trim();
    const contactRaw = (r[3] || '').trim();
    const hargaModal = parseRupiah(r[5] || r[4]);
    const hargaJual = parseRupiah(r[6]);
    const status = (r[7] || 'Ready').trim();
    entries.push({
      category: curProd,
      plan,
      durasi: '',
      akses: '',
      supplierName: supName,
      contactRaw,
      prioritas: '',
      hargaJual,
      hargaModal,
      status,
      notes: '',
    });
  } else if (mode === 'standard') {
    if (c0) {
      curProd = c0;
      curPlan = (r[2] || '').trim();
    } else if ((r[2] || '').trim()) {
      curPlan = (r[2] || '').trim();
    }
    const supName = (r[5] || '').trim();
    if (!supName) continue;

    entries.push({
      category: curProd,
      plan: curPlan,
      akses: (r[3] || '').trim(),
      durasi: (r[4] || '').trim(),
      supplierName: supName,
      contactRaw: (r[6] || '').trim(),
      prioritas: (r[7] || '').trim(),
      hargaJual: parseRupiah(r[8]),
      hargaModal: parseRupiah(r[9]),
      status: (r[15] || 'Ready').trim(),
      notes: (r[16] || '').trim(),
    });
  }
}

// Clear existing data & re-import
db.exec('DELETE FROM products; DELETE FROM suppliers;');

const supplierMap = new Map(); // key: lowercase supplier name
const insertSupplier = db.prepare(`
  INSERT INTO suppliers (name, category, contact_type, wa_number, wa_group_link, website_url, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateSupplier = db.prepare(`
  UPDATE suppliers SET wa_number = ?, wa_group_link = ?, website_url = ? WHERE id = ?
`);

for (const e of entries) {
  const key = e.supplierName.toLowerCase();
  const parsed = extractContact(e.contactRaw);

  if (!supplierMap.has(key)) {
    let baseWebsite = parsed.websiteUrl;
    if (baseWebsite) {
      try {
        const u = new URL(baseWebsite);
        baseWebsite = `${u.protocol}//${u.host}`;
      } catch {}
    }
    const res = insertSupplier.run(
      e.supplierName,
      'Produk Digital',
      parsed.contactType,
      parsed.waNumber,
      parsed.waGroupLink,
      baseWebsite,
      e.prioritas ? `Prioritas: ${e.prioritas}` : ''
    );
    supplierMap.set(key, {
      id: Number(res.lastInsertRowid),
      waNumber: parsed.waNumber,
      waGroupLink: parsed.waGroupLink,
      websiteUrl: baseWebsite,
    });
  } else {
    const existing = supplierMap.get(key);
    let changed = false;
    if (!existing.waNumber && parsed.waNumber) {
      existing.waNumber = parsed.waNumber;
      changed = true;
    }
    if (!existing.waGroupLink && parsed.waGroupLink) {
      existing.waGroupLink = parsed.waGroupLink;
      changed = true;
    }
    if (!existing.websiteUrl && parsed.websiteUrl) {
      try {
        const u = new URL(parsed.websiteUrl);
        existing.websiteUrl = `${u.protocol}//${u.host}`;
      } catch {
        existing.websiteUrl = parsed.websiteUrl;
      }
      changed = true;
    }
    if (changed) {
      updateSupplier.run(existing.waNumber, existing.waGroupLink, existing.websiteUrl, existing.id);
    }
  }
}

const insertProduct = db.prepare(`
  INSERT INTO products (supplier_id, name, sku, category, plan, durasi, price, harga_modal, unit, min_order, status, contact_url, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const e of entries) {
  const sup = supplierMap.get(e.supplierName.toLowerCase());
  const parsed = extractContact(e.contactRaw);
  const parts = [e.category, e.plan, e.durasi].filter(Boolean);
  const fullName = parts.join(' — ');
  const noteParts = [e.akses ? `Akses: ${e.akses}` : '', e.prioritas ? `Prioritas: ${e.prioritas}` : ''].filter(Boolean);

  insertProduct.run(
    sup.id,
    fullName,
    '',
    e.category,
    e.plan,
    e.durasi,
    e.hargaJual,
    e.hargaModal,
    'akun',
    1,
    e.status || 'Ready',
    parsed.websiteUrl || '',
    noteParts.join(' • ')
  );
}

console.log(`Imported ${supplierMap.size} suppliers and ${entries.length} product listings!`);
