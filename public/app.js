const state = {
  suppliers: [],
  products: [],
  settings: {
    wa_template:
      'Halo {supplier}, saya ingin menanyakan ketersediaan stok & harga untuk produk: {product}{sku_info}. Terima kasih!',
  },
  activeTab: 'products',
  searchQuery: '',
  channelFilter: 'all',
  categoryFilter: 'all',
  pendingQuickProduct: null,
};

// --- Helpers ---
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatRupiah(num) {
  const n = Number(num) || 0;
  if (n <= 0) return '-';
  return 'Rp ' + n.toLocaleString('id-ID');
}

function normalizeWaNumber(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8') && digits.length >= 9) {
    digits = '62' + digits;
  }
  return digits;
}

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add('hidden'), 2800);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request gagal (${res.status})`);
  }
  return data;
}

function buildWaMessage(supplierName, product) {
  const tpl = state.settings.wa_template || '';
  if (!product) {
    return `Halo ${supplierName}, saya ingin menanyakan informasi produk dan katalog terbaru.`;
  }
  const skuInfo = product.sku ? ` (SKU: ${product.sku})` : '';
  return tpl
    .replaceAll('{supplier}', supplierName || '')
    .replaceAll('{product}', product.name || '')
    .replaceAll('{sku}', product.sku || '')
    .replaceAll('{sku_info}', skuInfo);
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function getChannelMeta(type) {
  switch (type) {
    case 'wa_group':
      return {
        label: 'WA Grup',
        btnText: 'Grup WA',
        btnClass: 'bg-teal-600 hover:bg-teal-700 text-white',
        badgeClass: 'bg-teal-50 text-teal-700 border border-teal-200/70',
        icon: 'users',
      };
    case 'website':
      return {
        label: 'Website',
        btnText: 'Buka Web',
        btnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
        badgeClass: 'bg-blue-50 text-blue-700 border border-blue-200/70',
        icon: 'external-link',
      };
    default:
      return {
        label: 'WA Kontak',
        btnText: 'Chat WA',
        btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200/70',
        icon: 'message-circle',
      };
  }
}

function getAvailableChannels(sup) {
  const list = [];
  if (sup.wa_number) list.push({ type: 'wa_direct', label: 'Chat WA Kontak', icon: 'message-circle' });
  if (sup.wa_group_link) list.push({ type: 'wa_group', label: 'Buka Grup WA', icon: 'users' });
  if (sup.website_url) list.push({ type: 'website', label: 'Buka Website', icon: 'external-link' });
  return list;
}

function openDirectChannel(supplier, product = null, overrideChannel = null) {
  const channel = overrideChannel || supplier.contact_type || 'wa_direct';

  if (channel === 'wa_direct') {
    const num = normalizeWaNumber(supplier.wa_number);
    if (!num) {
      openQuickLinkModal(supplier, 'wa_direct', product);
      return;
    }
    const text = encodeURIComponent(buildWaMessage(supplier.name, product));
    const url = `https://wa.me/${num}?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast(`Membuka WhatsApp ${supplier.name}...`);
    return;
  }

  if (channel === 'wa_group') {
    const link = normalizeUrl(supplier.wa_group_link);
    if (!link) {
      openQuickLinkModal(supplier, 'wa_group', product);
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
    showToast(`Membuka Grup WA ${supplier.name}...`);
    return;
  }

  if (channel === 'website') {
    const web = normalizeUrl((product && product.contact_url) || supplier.website_url);
    if (!web) {
      openQuickLinkModal(supplier, 'website', product);
      return;
    }
    window.open(web, '_blank', 'noopener,noreferrer');
    showToast(`Membuka Website ${supplier.name}...`);
  }
}

// --- Data Loading ---
async function loadAll() {
  const [suppliers, products, settings] = await Promise.all([
    api('/api/suppliers'),
    api('/api/products'),
    api('/api/settings'),
  ]);
  state.suppliers = suppliers;
  state.products = products;
  if (settings && settings.wa_template) {
    state.settings = settings;
  }
  renderStats();
  populateCategoryFilter();
  populateSupplierSelect();
  renderCurrentView();
}

function renderStats() {
  document.getElementById('statProducts').textContent = state.products.length;
  document.getElementById('statSuppliers').textContent = state.suppliers.length;
  document.getElementById('statWaDirect').textContent = state.suppliers.filter(
    (s) => s.contact_type === 'wa_direct'
  ).length;
  document.getElementById('statWaGroup').textContent = state.suppliers.filter(
    (s) => s.contact_type === 'wa_group'
  ).length;
  document.getElementById('statWebsite').textContent = state.suppliers.filter(
    (s) => s.contact_type === 'website'
  ).length;
}

function populateCategoryFilter() {
  const select = document.getElementById('categoryFilter');
  const datalist = document.getElementById('productCategoryList');
  const current = state.categoryFilter;
  const cats = new Set();
  for (const p of state.products) {
    if (p.category) cats.add(p.category);
  }
  const sorted = Array.from(cats).sort((a, b) => a.localeCompare(b));
  select.innerHTML =
    '<option value="all">Semua Aplikasi</option>' +
    sorted.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (datalist) {
    datalist.innerHTML = sorted.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
  }
  if (sorted.includes(current)) {
    select.value = current;
  } else {
    state.categoryFilter = 'all';
    select.value = 'all';
  }
}

function populateSupplierSelect() {
  const select = document.getElementById('prodSupplier');
  const opts = state.suppliers
    .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
    .join('');
  select.innerHTML = opts + '<option value="__new__">+ Tambah Supplier Baru...</option>';
}

function setInlineNewSupplierMode(active) {
  const panel = document.getElementById('inlineNewSupplier');
  const select = document.getElementById('prodSupplier');
  const newName = document.getElementById('newSupName');
  const toggleBtn = document.getElementById('btnToggleNewSup');

  if (active) {
    panel.classList.remove('hidden');
    select.value = '__new__';
    newName.required = true;
    toggleBtn.textContent = 'Batal';
    newName.focus();
  } else {
    panel.classList.add('hidden');
    newName.required = false;
    newName.value = '';
    document.getElementById('newSupContact').value = '';
    toggleBtn.textContent = '+ Supplier Baru';
    if (select.value === '__new__' && state.suppliers.length > 0) {
      select.value = String(state.suppliers[0].id);
    }
  }
}

// --- Filtering ---
function getFilteredProducts() {
  const q = state.searchQuery.trim().toLowerCase();
  return state.products.filter((p) => {
    if (state.channelFilter !== 'all' && p.supplier_contact_type !== state.channelFilter) {
      return false;
    }
    if (
      state.categoryFilter !== 'all' &&
      p.category !== state.categoryFilter &&
      p.supplier_category !== state.categoryFilter
    ) {
      return false;
    }
    if (!q) return true;
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.notes || '').toLowerCase().includes(q) ||
      (p.supplier_name || '').toLowerCase().includes(q) ||
      (p.supplier_category || '').toLowerCase().includes(q)
    );
  });
}

function getFilteredSuppliers() {
  const q = state.searchQuery.trim().toLowerCase();
  return state.suppliers.filter((s) => {
    if (state.channelFilter !== 'all' && s.contact_type !== state.channelFilter) {
      return false;
    }
    if (state.categoryFilter !== 'all' && s.category !== state.categoryFilter) {
      return false;
    }
    if (!q) return true;
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q) ||
      (s.notes || '').toLowerCase().includes(q) ||
      (s.wa_number || '').toLowerCase().includes(q)
    );
  });
}

// --- Rendering ---
function renderCurrentView() {
  if (state.activeTab === 'products') {
    renderProductsTable();
  } else {
    renderSuppliersGrid();
  }
  refreshIcons();
}

function renderMessageSplitButton(supplier, productId = null, alignLeft = false) {
  const meta = getChannelMeta(supplier.contact_type);
  const channels = getAvailableChannels(supplier);
  const altChannels = channels.filter((c) => c.type !== supplier.contact_type);
  const pAttr = productId ? `data-product-id="${productId}"` : '';

  if (altChannels.length === 0) {
    return `
      <button class="inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap icon-sm ${meta.btnClass} js-msg-btn" data-supplier-id="${supplier.id}" ${pAttr}>
        <i data-lucide="${meta.icon}"></i>
        <span>${meta.btnText}</span>
      </button>
    `;
  }

  const menuPos = alignLeft ? 'left-0' : 'right-0';
  return `
    <div class="msg-split relative inline-flex items-center">
      <button class="inline-flex items-center justify-center gap-1.5 rounded-l-full pl-3.5 pr-2.5 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap icon-sm ${meta.btnClass} js-msg-btn" data-supplier-id="${supplier.id}" ${pAttr}>
        <i data-lucide="${meta.icon}"></i>
        <span>${meta.btnText}</span>
      </button>
      <button class="inline-flex items-center justify-center rounded-r-full border-l border-white/25 pl-2 pr-2.5 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer icon-sm ${meta.btnClass} js-alt-toggle" type="button" title="Pilih jalur kontak lain">
        <i data-lucide="chevron-down"></i>
      </button>
      <div class="alt-menu hidden absolute ${menuPos} top-full mt-1.5 min-w-[185px] rounded-2xl border border-border bg-card p-1.5 shadow-xl z-30 text-left">
        ${altChannels
          .map(
            (c) => `
          <button type="button" class="w-full flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer icon-sm js-msg-btn" data-supplier-id="${supplier.id}" data-channel="${c.type}" ${pAttr}>
            <i data-lucide="${c.icon}"></i>
            <span>${c.label}</span>
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderProductsTable() {
  const tbody = document.getElementById('productsTableBody');
  const rows = getFilteredProducts();

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-5 py-12 text-center text-sm text-muted-foreground">
          Tidak ada produk yang cocok. Coba ubah kata kunci atau klik <strong>+ Produk</strong>.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows
    .map((p) => {
      const supObj = {
        id: p.supplier_id,
        name: p.supplier_name,
        contact_type: p.supplier_contact_type,
        wa_number: p.supplier_wa_number,
        wa_group_link: p.supplier_wa_group_link,
        website_url: p.supplier_website_url,
      };
      const meta = getChannelMeta(p.supplier_contact_type);
      const contactPreview =
        p.supplier_contact_type === 'wa_direct'
          ? p.supplier_wa_number || 'Nomor WA belum diisi'
          : p.supplier_contact_type === 'wa_group'
          ? p.supplier_wa_group_link
            ? 'Link Grup WA tersedia'
            : 'Link Grup WA belum diisi'
          : p.contact_url || p.supplier_website_url || 'URL Web belum diisi';

      const modalInfo = p.harga_modal
        ? `Modal: ${formatRupiah(p.harga_modal)}`
        : `MOQ: ${p.min_order || 1} ${escapeHtml(p.unit || 'akun')}`;

      return `
        <tr class="hover:bg-muted/40 transition-colors">
          <td class="px-5 py-3.5 align-middle">
            <div class="text-sm font-semibold text-foreground">${escapeHtml(p.name)}</div>
            <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              ${p.sku ? `<span class="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">${escapeHtml(p.sku)}</span>` : ''}
              ${p.status ? `<span class="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">${escapeHtml(p.status)}</span>` : ''}
              ${p.notes ? `<span>${escapeHtml(p.notes)}</span>` : ''}
            </div>
          </td>
          <td class="px-5 py-3.5 align-middle">
            <span class="inline-flex items-center rounded-full border border-border bg-secondary/70 px-3 py-1 text-xs font-medium text-foreground whitespace-nowrap">${escapeHtml(p.category || p.supplier_category || '-')}</span>
          </td>
          <td class="px-5 py-3.5 align-middle whitespace-nowrap">
            <div class="text-sm font-semibold text-foreground">${formatRupiah(p.price)} <span class="text-xs font-normal text-muted-foreground">/ ${escapeHtml(p.unit || 'akun')}</span></div>
            <div class="mt-0.5 text-xs text-muted-foreground">${modalInfo}</div>
          </td>
          <td class="px-5 py-3.5 align-middle">
            <div class="text-sm font-semibold text-foreground">${escapeHtml(p.supplier_name)}</div>
            <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 icon-xs ${meta.badgeClass}">
                <i data-lucide="${meta.icon}"></i> ${meta.label}
              </span>
              <span class="truncate max-w-[210px]" title="${escapeHtml(contactPreview)}">${escapeHtml(contactPreview)}</span>
            </div>
          </td>
          <td class="px-5 py-3.5 align-middle text-right">
            <div class="inline-flex items-center justify-end gap-1.5">
              ${renderMessageSplitButton(supObj, p.id, false)}
              <button class="w-8 h-8 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center justify-center transition-colors cursor-pointer icon-sm js-edit-prod" data-id="${p.id}" title="Edit Produk" aria-label="Edit Produk">
                <i data-lucide="pencil"></i>
              </button>
              <button class="w-8 h-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-red-50 inline-flex items-center justify-center transition-colors cursor-pointer icon-sm js-del-prod" data-id="${p.id}" title="Hapus Produk" aria-label="Hapus Produk">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderSuppliersGrid() {
  const grid = document.getElementById('suppliersGrid');
  const list = getFilteredSuppliers();

  if (list.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-sm text-muted-foreground">Tidak ada supplier yang cocok. Klik <strong>+ Supplier</strong> untuk menambahkan.</div>`;
    return;
  }

  grid.innerHTML = list
    .map((s) => {
      const meta = getChannelMeta(s.contact_type);
      return `
        <article class="rounded-3xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col gap-3.5">
          <div class="flex items-start justify-between gap-2.5">
            <div class="min-w-0">
              <h3 class="text-sm font-semibold text-foreground truncate">${escapeHtml(s.name)}</h3>
              <p class="text-xs text-muted-foreground mt-0.5">${escapeHtml(s.category || 'Produk Digital')} &bull; ${s.product_count} produk</p>
            </div>
            <span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 icon-xs ${meta.badgeClass}">
              <i data-lucide="${meta.icon}"></i> ${meta.label}
            </span>
          </div>

          <div class="rounded-2xl bg-muted/60 p-3.5 space-y-2 text-xs text-muted-foreground icon-sm">
            <div class="flex items-center gap-2 min-w-0">
              <i data-lucide="message-circle"></i>
              <span class="truncate">${escapeHtml(s.wa_number || 'Belum ada nomor WA')}</span>
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <i data-lucide="users"></i>
              ${s.wa_group_link ? `<a class="truncate text-blue-600 hover:underline font-medium" href="${escapeHtml(normalizeUrl(s.wa_group_link))}" target="_blank" rel="noopener">Link Grup WA Tersedia</a>` : '<span class="truncate">Belum ada link grup WA</span>'}
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <i data-lucide="globe"></i>
              ${s.website_url ? `<a class="truncate text-blue-600 hover:underline font-medium" href="${escapeHtml(normalizeUrl(s.website_url))}" target="_blank" rel="noopener">${escapeHtml(s.website_url)}</a>` : '<span class="truncate">-</span>'}
            </div>
            ${s.notes ? `<div class="flex items-center gap-2 min-w-0"><i data-lucide="sticky-note"></i><span class="truncate">${escapeHtml(s.notes)}</span></div>` : ''}
          </div>

          <div class="mt-auto pt-3 border-t border-border/70 flex items-center justify-between gap-2">
            <div>
              ${renderMessageSplitButton(s, null, true)}
            </div>
            <div class="inline-flex items-center gap-1.5">
              <button class="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer icon-sm js-add-prod-for" data-id="${s.id}" title="Tambah produk untuk supplier ini">
                <i data-lucide="plus"></i> Produk
              </button>
              <button class="w-8 h-8 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center justify-center transition-colors cursor-pointer icon-sm js-edit-sup" data-id="${s.id}" title="Edit Supplier" aria-label="Edit Supplier">
                <i data-lucide="pencil"></i>
              </button>
              <button class="w-8 h-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-red-50 inline-flex items-center justify-center transition-colors cursor-pointer icon-sm js-del-sup" data-id="${s.id}" title="Hapus Supplier" aria-label="Hapus Supplier">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

// --- Modals ---
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function openSupplierModal(supplier = null) {
  document.getElementById('modalSupplierTitle').textContent = supplier ? 'Edit Supplier' : 'Tambah Supplier';
  document.getElementById('supId').value = supplier ? supplier.id : '';
  document.getElementById('supName').value = supplier ? supplier.name : '';
  document.getElementById('supCategory').value = supplier ? supplier.category : '';
  document.getElementById('supWaNumber').value = supplier ? supplier.wa_number : '';
  document.getElementById('supWaGroup').value = supplier ? supplier.wa_group_link : '';
  document.getElementById('supWebsite').value = supplier ? supplier.website_url : '';
  document.getElementById('supNotes').value = supplier ? supplier.notes : '';

  const type = supplier ? supplier.contact_type : 'wa_direct';
  const radio = document.querySelector(`input[name="supContactType"][value="${type}"]`);
  if (radio) radio.checked = true;

  openModal('modalSupplier');
  document.getElementById('supName').focus();
}

function openProductModal(product = null, preselectSupplierId = null) {
  populateSupplierSelect();
  setInlineNewSupplierMode(state.suppliers.length === 0 && !product);
  document.getElementById('modalProductTitle').textContent = product ? 'Edit Produk Akun Digital' : 'Tambah Produk Akun Digital';
  document.getElementById('prodId').value = product ? product.id : '';
  if (state.suppliers.length > 0) {
    document.getElementById('prodSupplier').value = product
      ? product.supplier_id
      : preselectSupplierId || state.suppliers[0].id;
  }
  document.getElementById('prodCategory').value = product ? (product.category || product.name) : '';
  document.getElementById('prodPlan').value = product ? (product.plan || '') : '';
  document.getElementById('prodDurasi').value = product ? (product.durasi || '') : '';

  // Extract Akses if stored in notes as "Akses: ..."
  let aksesVal = '';
  let cleanNotes = product ? (product.notes || '') : '';
  const aksesMatch = cleanNotes.match(/^Akses:\s*([^•]+?)(?:\s*•\s*(.*))?$/);
  if (aksesMatch) {
    aksesVal = aksesMatch[1].trim();
    cleanNotes = (aksesMatch[2] || '').trim();
  }
  document.getElementById('prodAkses').value = aksesVal;
  document.getElementById('prodStatus').value = product ? (product.status || 'Ready') : 'Ready';
  document.getElementById('prodPrice').value = product ? (product.price || '') : '';
  document.getElementById('prodHargaModal').value = product ? (product.harga_modal || '') : '';
  document.getElementById('prodContactUrl').value = product ? (product.contact_url || '') : '';
  document.getElementById('prodNotes').value = cleanNotes;

  openModal('modalProduct');
  document.getElementById('prodCategory').focus();
}

function openQuickLinkModal(supplier, channelType, product = null) {
  state.pendingQuickProduct = product;
  document.getElementById('qlSupplierId').value = supplier.id;
  document.getElementById('qlChannelType').value = channelType;
  const input = document.getElementById('qlValue');
  input.value = '';

  if (channelType === 'wa_group') {
    document.getElementById('qlDesc').textContent = `Link Grup WA untuk "${supplier.name}" belum diisi. Tempelkan link undangan grup WhatsApp di bawah ini:`;
    document.getElementById('qlLabel').textContent = 'Link Grup WhatsApp';
    input.placeholder = 'https://chat.whatsapp.com/...';
  } else if (channelType === 'website') {
    document.getElementById('qlDesc').textContent = `URL Website untuk "${supplier.name}" belum diisi. Masukkan alamat website supplier:`;
    document.getElementById('qlLabel').textContent = 'URL Website';
    input.placeholder = 'https://supplier.com';
  } else {
    document.getElementById('qlDesc').textContent = `Nomor WhatsApp untuk "${supplier.name}" belum diisi. Masukkan nomor WA supplier:`;
    document.getElementById('qlLabel').textContent = 'Nomor WhatsApp';
    input.placeholder = '081234567890';
  }

  openModal('modalQuickLink');
  input.focus();
}

// --- Event Listeners ---
window.addEventListener('load', refreshIcons);

document.addEventListener('DOMContentLoaded', () => {
  refreshIcons();
  loadAll().catch((err) => showToast(err.message));

  // Tabs
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      state.activeTab = tab.dataset.tab;

      document.getElementById('viewProducts').classList.toggle('active', state.activeTab === 'products');
      document.getElementById('viewSuppliers').classList.toggle('active', state.activeTab === 'suppliers');
      renderCurrentView();
    });
  });

  // Search & filters
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderCurrentView();
  });

  document.querySelectorAll('#channelFilter .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#channelFilter .pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.channelFilter = pill.dataset.channel;
      renderCurrentView();
    });
  });

  document.getElementById('categoryFilter').addEventListener('change', (e) => {
    state.categoryFilter = e.target.value;
    renderCurrentView();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => m.classList.add('hidden'));
      document.querySelectorAll('.alt-menu').forEach((m) => m.classList.add('hidden'));
    }
  });

  // Close modal buttons & backdrop click
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) bd.classList.add('hidden');
    });
  });

  // Topbar actions
  document.getElementById('btnAddSupplier').addEventListener('click', () => openSupplierModal());
  document.getElementById('btnAddProduct').addEventListener('click', () => openProductModal());

  document.getElementById('btnSettings').addEventListener('click', () => {
    document.getElementById('waTemplateInput').value = state.settings.wa_template || '';
    openModal('modalSettings');
  });

  document.getElementById('btnExport').addEventListener('click', async () => {
    try {
      const data = await api('/api/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `supplier-db-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Database berhasil di-export ke JSON.');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Form: Supplier
  document.getElementById('formSupplier').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('supId').value;
    const payload = {
      name: document.getElementById('supName').value.trim(),
      category: document.getElementById('supCategory').value.trim(),
      contact_type: document.querySelector('input[name="supContactType"]:checked').value,
      wa_number: document.getElementById('supWaNumber').value.trim(),
      wa_group_link: document.getElementById('supWaGroup').value.trim(),
      website_url: document.getElementById('supWebsite').value.trim(),
      notes: document.getElementById('supNotes').value.trim(),
    };

    try {
      if (id) {
        await api(`/api/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Supplier berhasil diperbarui.');
      } else {
        await api('/api/suppliers', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Supplier baru berhasil ditambahkan.');
      }
      closeModal('modalSupplier');
      await loadAll();
    } catch (err) {
      showToast(err.message);
    }
  });

  // Inline new supplier controls inside Product modal
  document.getElementById('prodSupplier').addEventListener('change', (e) => {
    setInlineNewSupplierMode(e.target.value === '__new__');
  });

  document.getElementById('btnToggleNewSup').addEventListener('click', () => {
    const isHidden = document.getElementById('inlineNewSupplier').classList.contains('hidden');
    setInlineNewSupplierMode(isHidden);
  });

  document.getElementById('btnCancelNewSup').addEventListener('click', () => {
    setInlineNewSupplierMode(false);
  });

  document.getElementById('newSupType').addEventListener('change', (e) => {
    const label = document.getElementById('newSupContactLabel');
    const input = document.getElementById('newSupContact');
    if (e.target.value === 'wa_group') {
      label.textContent = 'Link Grup WhatsApp';
      input.placeholder = 'https://chat.whatsapp.com/...';
    } else if (e.target.value === 'website') {
      label.textContent = 'URL Website Supplier';
      input.placeholder = 'https://supplier.com';
    } else {
      label.textContent = 'Nomor WhatsApp';
      input.placeholder = 'Contoh: 081234567890';
    }
  });

  // Form: Product
  document.getElementById('formProduct').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('prodId').value;
    const category = document.getElementById('prodCategory').value.trim();
    const plan = document.getElementById('prodPlan').value.trim();
    const durasi = document.getElementById('prodDurasi').value.trim();
    const akses = document.getElementById('prodAkses').value.trim();
    const rawNotes = document.getElementById('prodNotes').value.trim();

    const fullName = [category, plan, durasi].filter(Boolean).join(' — ');
    const combinedNotes = [akses ? `Akses: ${akses}` : '', rawNotes].filter(Boolean).join(' • ');

    try {
      let supplierId = Number(document.getElementById('prodSupplier').value);
      if (document.getElementById('prodSupplier').value === '__new__') {
        const newName = document.getElementById('newSupName').value.trim();
        if (!newName) {
          showToast('Nama supplier baru wajib diisi.');
          document.getElementById('newSupName').focus();
          return;
        }
        const newType = document.getElementById('newSupType').value;
        const newContact = document.getElementById('newSupContact').value.trim();
        const createdSup = await api('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify({
            name: newName,
            category: 'Produk Digital',
            contact_type: newType,
            wa_number: newType === 'wa_direct' ? newContact : '',
            wa_group_link: newType === 'wa_group' ? newContact : '',
            website_url: newType === 'website' ? newContact : '',
            notes: '',
          }),
        });
        supplierId = createdSup.id;
      }

      const payload = {
        supplier_id: supplierId,
        name: fullName || category,
        sku: '',
        category,
        plan,
        durasi,
        price: Number(document.getElementById('prodPrice').value) || 0,
        harga_modal: Number(document.getElementById('prodHargaModal').value) || 0,
        unit: 'akun',
        min_order: 1,
        status: document.getElementById('prodStatus').value || 'Ready',
        contact_url: document.getElementById('prodContactUrl').value.trim(),
        notes: combinedNotes,
      };

      if (id) {
        await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Produk akun berhasil diperbarui.');
      } else {
        await api('/api/products', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Produk akun baru berhasil ditambahkan.');
      }
      closeModal('modalProduct');
      await loadAll();
    } catch (err) {
      showToast(err.message);
    }
  });

  // Form: Quick Link
  document.getElementById('formQuickLink').addEventListener('submit', async (e) => {
    e.preventDefault();
    const supId = Number(document.getElementById('qlSupplierId').value);
    const channelType = document.getElementById('qlChannelType').value;
    const val = document.getElementById('qlValue').value.trim();
    if (!val) return;

    const patch = {};
    if (channelType === 'wa_group') patch.wa_group_link = val;
    else if (channelType === 'website') patch.website_url = val;
    else patch.wa_number = val;

    try {
      const updated = await api(`/api/suppliers/${supId}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      closeModal('modalQuickLink');
      await loadAll();
      openDirectChannel(updated, state.pendingQuickProduct, channelType);
      state.pendingQuickProduct = null;
    } catch (err) {
      showToast(err.message);
    }
  });

  // Form: Settings
  document.getElementById('formSettings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const wa_template = document.getElementById('waTemplateInput').value.trim();
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ wa_template }) });
      state.settings.wa_template = wa_template;
      closeModal('modalSettings');
      showToast('Template pesan WhatsApp disimpan.');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Global click delegation for table & cards
  document.addEventListener('click', async (e) => {
    // Close open alt menus when clicking outside
    if (!e.target.closest('.msg-split')) {
      document.querySelectorAll('.alt-menu').forEach((m) => m.classList.add('hidden'));
    }

    const altToggle = e.target.closest('.js-alt-toggle');
    if (altToggle) {
      const menu = altToggle.parentElement.querySelector('.alt-menu');
      const wasHidden = menu.classList.contains('hidden');
      document.querySelectorAll('.alt-menu').forEach((m) => m.classList.add('hidden'));
      if (wasHidden) menu.classList.remove('hidden');
      return;
    }

    const msgBtn = e.target.closest('.js-msg-btn');
    if (msgBtn) {
      const supId = Number(msgBtn.dataset.supplierId);
      const prodId = msgBtn.dataset.productId ? Number(msgBtn.dataset.productId) : null;
      const overrideChannel = msgBtn.dataset.channel || null;
      const supplier = state.suppliers.find((s) => s.id === supId);
      const product = prodId ? state.products.find((p) => p.id === prodId) : null;
      if (supplier) {
        openDirectChannel(supplier, product, overrideChannel);
      }
      return;
    }

    const editProd = e.target.closest('.js-edit-prod');
    if (editProd) {
      const prod = state.products.find((p) => p.id === Number(editProd.dataset.id));
      if (prod) openProductModal(prod);
      return;
    }

    const delProd = e.target.closest('.js-del-prod');
    if (delProd) {
      const id = Number(delProd.dataset.id);
      if (!confirm('Hapus produk ini dari database?')) return;
      try {
        await api(`/api/products/${id}`, { method: 'DELETE' });
        showToast('Produk dihapus.');
        await loadAll();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const addProdFor = e.target.closest('.js-add-prod-for');
    if (addProdFor) {
      openProductModal(null, Number(addProdFor.dataset.id));
      return;
    }

    const editSup = e.target.closest('.js-edit-sup');
    if (editSup) {
      const sup = state.suppliers.find((s) => s.id === Number(editSup.dataset.id));
      if (sup) openSupplierModal(sup);
      return;
    }

    const delSup = e.target.closest('.js-del-sup');
    if (delSup) {
      const id = Number(delSup.dataset.id);
      if (!confirm('Hapus supplier ini beserta semua produknya?')) return;
      try {
        await api(`/api/suppliers/${id}`, { method: 'DELETE' });
        showToast('Supplier dihapus.');
        await loadAll();
      } catch (err) {
        showToast(err.message);
      }
    }
  });
});
