# Prompt: sambungkan stock-plan-crawler ke backend StockPlan (Sinkron data BEI)

> Salin seluruh isi file ini sebagai prompt di repo `stock-plan-crawler`.

---

Kamu bekerja di repo `stock-plan-crawler` (Node ESM, Playwright). Tugasmu: kirim hasil crawling profil emiten IDX ke backend StockPlan, dan laporkan status run-nya, supaya data masuk ke database dan terlihat di halaman admin "Sinkron data BEI".

Baca dulu: `lib/crawler.js` (entry interaktif), `crawler/idx/2_company-summary.js` (scraper profil), dan `middleware/idx/2_company-summary.parser.js` (parser ke format minify).

## Keadaan sekarang

- `2_company-summary.js` menulis dua file per ticker:
  - `dist/idx/company/detail/[TICKER].json`: mentah, key Bahasa Indonesia. **Jangan dikirim.**
  - `dist/idx/minify/company/detail/[TICKER].json`: hasil parser, bentuk `{ total, data: { ticker, board, ipo_date, directors, commissioners, shareholders, subsidiaries, … }, scraped_at }`. **Ini yang dikirim, apa adanya.**
- `main()` melewati ticker yang filenya sudah ada, jadi run kedua tidak memperbarui apa pun.
- Ticker yang gagal hanya di-`console.log`, tidak dikumpulkan.

## Kontrak backend

Base URL dari env `BACKEND_URL` (dev: `http://localhost:3000`). Semua request pakai header `Authorization: Bearer ${SYNC_TOKEN}` dan `Content-Type: application/json`. `SYNC_TOKEN` harus sama persis dengan di `.env` backend.

### 1. Kirim data profil: `POST /admin/api/sync/agent/companies`

Body: `{ "data": [ <isi field `data` dari file minify>, … ] }`. Maksimal **100 emiten per request** dan body maksimal 5 MB. Pakai batch 50.

```json
{ "data": [ { "ticker": "AADI", "board": { "name": "Utama" }, "ipo_date": "2024-12-05", "directors": [...], "commissioners": [...], "shareholders": [...], "subsidiaries": [...] } ] }
```

Respons 200:

```json
{ "updated": 0, "review": 1, "unchanged": 0, "unknown": 0, "invalid": 0,
  "results": [ { "ticker": "AADI", "status": "review", "review": ["management", "listing"] } ] }
```

- Backend **tidak** menulis data langsung. Setiap perubahan menunggu persetujuan admin di `/admin/sinkron`. `updated` selalu 0, dan dipertahankan hanya supaya build lama tidak rusak.
- `status` per emiten: `review` (ada perubahan menunggu persetujuan), `unchanged`, `unknown` (ticker belum ada di DB, abaikan), `invalid` (lihat `errors`). Ringkasan yang dicetak: review, unchanged, unknown, invalid.
- Backend sudah menangani: buang baris "Masyarakat …", ambil 30 anak usaha terbesar, abaikan daftar kosong, dan tidak memunculkan lagi nilai yang pernah ditolak admin. **Crawler tidak perlu mengolah data.** Kirim saja apa adanya.
- Idempoten: mengirim data yang sama dua kali aman.

### 2. Laporkan run: `POST /admin/api/sync/agent/jobs/:key/report`

Panggil sekali per job setelah semua batch terkirim. Satu scrape profil mengisi tiga job: `prof` (Profil perusahaan), `mgmt` (Manajemen), dan `sub` (Anak usaha). Kirim laporan yang sama ke ketiganya.

```json
{
  "startedAt": "2026-11-12T06:00:00+07:00",
  "finishedAt": "2026-11-12T06:04:31+07:00",
  "nextRunAt": "2026-11-13T06:00:00+07:00",
  "ok": 955, "total": 958,
  "failures": [ { "ticker": "BUMI", "message": "Halaman profil BEI tidak bisa dibaca", "log": "GET /profil-perusahaan-tercatat/BUMI → 503 (3x)" } ]
}
```

- `message` maksimal 200 karakter, Bahasa Indonesia, untuk dibaca admin. `log` maksimal 500 karakter, berisi detail teknis.
- `ticker: null` = seluruh job gagal (mis. BEI tidak bisa diakses sama sekali).
- Untuk run sebagian (retry beberapa ticker), tambahkan `"tickers": ["BUMI"]`. Backend hanya mengganti kegagalan ticker itu dan tidak mengubah kolom "Terakhir".
- Jangan kirim `conflicts` di sini. Konflik dibuat backend dari endpoint nomor 1.

### 3. (Fase 2) Antrean dari admin: `GET /admin/api/sync/agent/queue`

Respons: `{ "jobs": [ { "key": "mgmt", "tickers": null }, { "key": "prof", "tickers": ["BUMI"] } ] }`. Panggilan ini meng-*claim* job: job yang diambil **wajib** dilaporkan lewat endpoint nomor 2, kalau tidak statusnya "Berjalan…" selama 2 jam. `tickers: null` = scrape semua, daftar = hanya ticker itu.

### Error

Format: `{ "error": { "code", "message", "fields"? } }`.
- `401 UNAUTHENTICATED`: token salah.
- `503 SYNC_DISABLED`: `SYNC_TOKEN` backend belum diisi.
- `422 VALIDATION`: lihat `fields`. Jangan retry.
- `5xx` atau error jaringan: retry.

## Yang harus dikerjakan

1. **`lib/backend.js`**: client kecil memakai `fetch` bawaan Node:
   - `postCompanies(items)`, `reportRun(key, payload)`, `getQueue()`;
   - baca `BACKEND_URL` dan `SYNC_TOKEN` dari `process.env`. Kalau kosong, gagal dengan pesan jelas;
   - timeout 30 detik, retry 3x dengan jeda untuk 5xx/jaringan, tanpa retry untuk 4xx;
   - **jangan pernah me-log token**.
2. **Kumpulkan hasil di `2_company-summary.js`**:
   - `main()` mengembalikan `{ startedAt, finishedAt, scraped: [ticker…], failed: [{ ticker, message, log }] }`;
   - pesan untuk admin diterjemahkan dari error. Contoh: Cloudflare/blocked/timeout → "Halaman profil BEI tidak bisa dibaca", parser gagal → "Format halaman BEI berubah".
3. **Opsi `force`** di `main(options)` untuk scrape ulang semua ticker walau filenya sudah ada. Sinkron harian butuh ini. Perilaku default tanpa opsi tetap seperti sekarang.
4. **Langkah push** (`lib/push.js`, ekspor `pushCompanies({ tickers? })`):
   - baca file minify (semua, atau hanya `tickers`), lalu kirim per 50 lewat `postCompanies`;
   - tampilkan ringkasan: updated, review, unchanged, unknown, invalid;
   - file JSON yang rusak dicatat sebagai failure, tidak menghentikan proses.
5. **Sambungkan ke alur**:
   - setelah "Company Profile" IDX selesai di `lib/crawler.js`, jalankan push, lalu `reportRun` ke `prof`, `mgmt`, dan `sub`;
   - `ok` = jumlah ticker yang berhasil di-scrape **dan** tidak `invalid` saat dikirim; `total` = jumlah ticker yang dicoba.
6. **Script npm**:
   - `"push": "node --env-file=.env lib/push-cli.js"`: kirim file yang sudah ada tanpa scrape. Berguna sekarang, karena data sudah di `dist/`;
   - tambahkan `--env-file=.env` ke script `build` juga;
   - buat `.env.example` berisi `BACKEND_URL=http://localhost:3000` dan `SYNC_TOKEN=`;
   - pastikan `.env` ada di `.gitignore`.
7. **(Opsional, fase 2)** `npm run worker`: loop `getQueue()` tiap 60 detik, jalankan scrape untuk job `prof`/`mgmt`/`sub` (dengan `tickers` kalau ada, plus `force`), push, lalu report dengan `tickers` yang sama. Job lain (`px`, `idx`, `kip`, `lk`, `ipo`) belum punya endpoint data. Laporkan sebagai gagal dengan `ticker: null` dan message "Belum didukung crawler", supaya tidak tertahan di "Berjalan…".

## Batasan

- Jangan ubah format file minify, karena backend bergantung pada field `ticker`, `board.name`, `ipo_date`, `directors[].name/position.id`, `commissioners[]`, `shareholders[].name/type.id/percentage`, dan `subsidiaries[].name/type.id/total_assets/ownership_percentage`.
- Jangan tambah dependency. `fetch` dan `--env-file` sudah ada di Node ≥ 20.6.
- Jangan kirim ke backend lama (`localhost:3200`, `/v1/change-request`, `/v1/scraping-batch`). Itu sudah tidak dipakai.
- Tidak ada data harga, rekomendasi, atau prediksi yang dikirim.

## Cara cek

1. Backend jalan (`npm run dev` di `stockplan-backend`) dengan `SYNC_TOKEN` terisi.
2. `npm run push` dengan file `AADI.json` di folder minify. Hasil yang diharapkan: `AADI updated` (atau `unchanged` kalau sudah pernah dikirim).
3. Kirim ulang: hasilnya harus `unchanged`.
4. Jalankan laporan run, lalu buka admin `/admin/sinkron`. Job "Profil perusahaan", "Manajemen", dan "Anak usaha" harus menampilkan "Terakhir" dan jumlah emiten, dan ticker gagal muncul di "Gagal di sinkron terakhir".
5. Tes token salah: harus berhenti dengan pesan jelas, tanpa retry dan tanpa token tercetak.

Kontrak lengkap ada di Swagger backend: `http://localhost:3000/docs`, tag **Admin: Sinkron**.
