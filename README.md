# SupplierHub — Manajemen Database Supplier & Produk Digital

Aplikasi web admin untuk mengelola database supplier dan produk akun digital dengan pencarian instan serta tombol **Message** auto-direct ke **WhatsApp Kontak**, **Grup WhatsApp**, atau **Website Supplier**.

## Fitur Utama
- **Pencarian & Filter Instan**: Cari berdasarkan nama produk, aplikasi, plan, durasi, catatan, atau nama supplier (shortcut `/`), plus filter jalur kontak (`WA Kontak`, `WA Grup`, `Website`) dan aplikasi.
- **Auto-Direct Message**:
  - **WA Kontak**: Otomatis mengonversi nomor ke format `https://wa.me/62...` dengan template pesan siap kirim.
  - **WA Grup**: Langsung mengarah ke link undangan grup WhatsApp (`https://chat.whatsapp.com/...`).
  - **Website**: Langsung mengarah ke URL produk spesifik atau website supplier.
- **Manajemen Produk & Supplier**: Tambah, edit, dan hapus supplier/produk, termasuk fitur **+ Supplier Baru** langsung di dalam form tambah produk.
- **Cloud Database (InsForge Postgres)**: Data tersimpan permanen di cloud sehingga mendukung penuh baca/tulis di Vercel Serverless Functions maupun lokal.
- **UI Modern**: Tailwind CSS + desain shadcn/ui full-rounded dengan Lucide Icons.

## Deploy di Vercel
Set 2 Environment Variables berikut di **Vercel Project → Settings → Environment Variables**:
- `INSFORGE_URL`
- `INSFORGE_API_KEY`

## Cara Menjalankan Lokal
1. Salin `.env.example` menjadi `.env` dan isi `INSFORGE_URL` serta `INSFORGE_API_KEY`.
2. Install dependensi dan jalankan:

```bash
npm install
npm start
```

Lalu buka `http://localhost:3456` di browser.
