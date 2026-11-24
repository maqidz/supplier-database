# SupplierHub — Manajemen Database Supplier & Produk Digital

Aplikasi web admin untuk mengelola database supplier dan produk akun digital dengan pencarian instan serta tombol **Message** auto-direct ke **WhatsApp Kontak**, **Grup WhatsApp**, atau **Website Supplier**.

## Fitur Utama
- **Pencarian & Filter Instan**: Cari berdasarkan nama produk, aplikasi, plan, durasi, catatan, atau nama supplier (shortcut `/`), plus filter jalur kontak (`WA Kontak`, `WA Grup`, `Website`) dan aplikasi.
- **Auto-Direct Message**:
  - **WA Kontak**: Otomatis mengonversi nomor ke format `https://wa.me/62...` dengan template pesan siap kirim.
  - **WA Grup**: Langsung mengarah ke link undangan grup WhatsApp (`https://chat.whatsapp.com/...`).
  - **Website**: Langsung mengarah ke URL produk spesifik atau website supplier.
- **Manajemen Produk & Supplier**: Tambah, edit, dan hapus supplier/produk, termasuk fitur **+ Supplier Baru** langsung di dalam form tambah produk.
- **Database SQLite Lokal**: Menggunakan `node:sqlite` bawaan Node.js v22+ tanpa dependensi eksternal.
- **UI Modern**: Tailwind CSS + gaya shadcn/ui full-rounded dengan Lucide Icons.

## Cara Menjalankan
Pastikan menggunakan **Node.js v22+**:

```bash
npm start
```

Lalu buka `http://localhost:3456` di browser.
