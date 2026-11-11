# StockPlan Client — Handoff

Status per 11 Nov 2026. Dokumen ini untuk sesi Claude Code berikutnya dan developer yang melanjutkan **web client** (repo ini). Baca dari atas sebelum menulis kode.

Dokumen lain yang jadi acuan:

- [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md): kontrak API dari backend (auth, error, endpoint per layar). Skema lengkap ada di Swagger backend (`/docs`).
- [ADMIN_HANDOFF.md](ADMIN_HANDOFF.md): hubungan admin ↔ client, port, deploy, dan aksi admin yang terlihat di client.
- `stockplan-app-handoff/HANDOFF.md` + `design/screens/*.dc.html`: acuan produk, copy, dan design.

Dokumen ini hanya mencatat **cara client terhubung ke API, apa yang sudah tersambung, dan celah terhadap kontrak backend/admin**.

---

## 1. Menjalankan

```bash
npm install
npm run dev -- -p 3002   # backend di 3000, admin di 3001 (ADMIN_HANDOFF §2)
npm test                 # node --test lib/*.test.ts
npx tsc --noEmit && npx eslint app components lib
```

- Backend harus jalan di `http://localhost:3000`. Kalau di tempat lain, set `BACKEND_URL` saat menjalankan Next (dibaca saat start, untuk `next.config.ts` dan `lib/backend.ts`).
- Port 3001 dipakai admin menurut ADMIN_HANDOFF. Jangan menjalankan client di 3001 kalau admin juga jalan.
- Akun dev: daftar lewat `/daftar`, lalu set `emailVerified` manual (email belum terkirim):
  `UPDATE auth_users SET "emailVerified" = true WHERE email = '…';`
- **Next.js 16** dengan `cacheComponents: true`. API dan konvensinya berbeda dari versi lama. Baca `node_modules/next/dist/docs/` sebelum menulis kode (lihat `AGENTS.md`). `middleware` sekarang bernama **`proxy.ts`**.

## 2. Cara client terhubung ke backend

```
Browser ──► Next (client) ── rewrite /api/:path* ──► Backend Express :3000/:path*
              │
              └─ Server Component ── fetch + cookie sid ──► Backend (langsung, tanpa /api)
```

| Bagian | File | Catatan |
| --- | --- | --- |
| Proxy ke backend | `next.config.ts` (`rewrites`) | `/api/auth/login` → `{BACKEND_URL}/auth/login`. Backend tidak memasang CORS, jadi cookie `sid` harus first-party di origin client |
| Fetch dari browser | `lib/api.ts` → `api(method, path, body?)` | Tidak pernah melempar: gagal jaringan = `status: 0` + `NETWORK_MSG`. 401 di luar `/auth/*` membuka `SessionExpiredDialog` |
| Fetch dari server | `lib/backend.ts` | **Satu-satunya** modul yang memakai `cookies()`. Meneruskan `sid` ke backend. 401 → `redirect("/masuk")`, 404 → `null` (halaman memanggil `notFound()`) |
| Mapper API → tipe UI | `lib/themes.ts`, `lib/theme-detail.ts`, `lib/emiten.ts`, `lib/emiten-detail.ts`, `lib/emiten-ipo.ts`, `lib/watchlist.ts` | Fungsi murni `toX(api)`. Komponen memakai tipe UI, bukan bentuk API. Test: `lib/mappers.test.ts` |
| Aksi bersama | `lib/watch.ts` | `setWatched(ticker, on)`, `setAlert(ticker, kind, on)`. Toast hasil, `false` bila gagal (komponen mengembalikan state) |
| Auth | `lib/auth.ts` | `login`, `register`, `logout` (muat ulang penuh ke `/masuk`) |
| Penjaga halaman | `proxy.ts` | Semua path di `app/(app)` tanpa cookie `sid` → `/masuk?next=…`. Hanya cek keberadaan cookie; validitas sesi dicek `lib/backend.ts` (401 → `/masuk`) |

Path API di dokumen backend (`/me`, `/companies`, …) di client selalu dipanggil dengan prefix `/api` dari browser.

## 3. Konvensi (wajib diikuti)

- **Data runtime di dalam `<Suspense>`.** Dengan Cache Components, `cookies()` di luar Suspense membuat route gagal diprerender. Halaman memakai `loading.tsx` atau membungkus komponen async dengan `<Suspense>` (contoh: `app/(app)/layout.tsx`, `app/(app)/akun/profil/page.tsx`).
- **File `lib/` yang diimpor komponen client tidak boleh mengimpor `next/headers`.** Fetch server hanya di `lib/backend.ts`; tipe, mapper, dan helper di file domain.
- **Impor runtime antar file `lib/` yang dites memakai ekstensi `.ts`** (`import { fmtDate } from "./format.ts"`), karena test dijalankan langsung oleh `node --test` (`allowImportingTsExtensions` aktif). Impor tipe saja boleh tanpa ekstensi.
- **Satu fetch per request:** fungsi di `lib/backend.ts` yang dipakai di beberapa tempat (layout, `generateMetadata`, halaman) dibungkus `cache()` dari React.
- **Uang dan tanggal diformat di client:** `lib/format.ts` (`rupiah`, `rupiahShort`, `fmtDate`, `fmtDateTime`, `decId`). Zona `Asia/Jakarta`.
- **Aksi optimistis:** ubah state dulu, kembalikan kalau API gagal, tampilkan `error.message` dari server (sudah Bahasa Indonesia). Cabang logika berdasarkan `error.code`, bukan `message`.
- **Copy:** dari `design/screens/*.dc.html`. Copy yang dikarang ditandai `// COPY: perlu review`.
- **Shortcut:** `// shortcut: <batasan>, <kapan di-upgrade>`. Data contoh yang belum tersambung ditandai `STUB`. Daftar: `grep -rn "STUB\|shortcut:" app components lib`.
- **Logout dan hapus akun** memakai `window.location.assign("/masuk")` (muat ulang penuh) supaya cache router berisi data akun ikut hilang. Ini sengaja, dan peringatan lint-nya sudah dimatikan dengan alasan.

## 4. Status per layar

| Layar | Path | Status | Endpoint |
| --- | --- | --- | --- |
| Masuk | `/masuk` | Tersambung | `POST /auth/login`. `?next=` dari `proxy.ts` (hanya path internal) |
| Daftar | `/daftar` | Tersambung | `POST /auth/register` |
| Header, menu akun, dialog sesi habis | `app/(app)/layout.tsx` | Tersambung | `GET /me`, `POST /auth/logout`, login ulang via `POST /auth/login` |
| Profil | `/akun/profil` | Tersambung, kecuali Google & foto | `PATCH /me`, `POST /me/password`, `GET`/`DELETE /me/sessions` |
| Pengaturan | `/akun/pengaturan` | Tersambung, kecuali unduh CSV | `PATCH /me/prefs`, `POST /me/email`, `DELETE /me` |
| Tema | `/tema` | Tersambung | `GET /sectors` |
| Tema sektor | `/tema/sektor/[sektor]` | Tersambung, kecuali "Kabari saya" | `GET /sectors/:slug`. Sektor "Segera hadir" → 404 |
| Detail tema | `/tema/[slug]` | Tersambung | `GET /themes/:slug`, simpan watchlist dari drawer |
| Cari emiten | `/emiten?q=&sektor=` | Tersambung, kecuali riwayat | `GET /companies?q=&sector=` (debounce 200 ms) |
| Detail emiten / IPO / data tertunda | `/emiten/[kode]` | Tersambung | `GET /companies/:ticker`, alert `listing` & `data-update` |
| Watchlist | `/watchlist` | Tersambung, kecuali "Perubahan bisnis" | `GET`/`POST`/`PATCH`/`DELETE /watchlist` |
| Konfirmasi email | `/konfirmasi-email` | **Stub** | lihat §5 |
| Lupa password, password baru | `/lupa-password`, `/password-baru` | **Stub** | lihat §5 |
| Beranda, Tesis, Portofolio | `/beranda`, `/tesis`, `/portofolio` | **Stub** (data contoh) | API belum ada |
| Notifikasi, ⌘K, Bantuan, Masukan, Langganan | — | **Stub** | API belum ada |
| Pemeliharaan | `/pemeliharaan` | **Stub** (`lib/maintenance.ts`) | Pengaturan aplikasi admin belum punya endpoint |

## 5. Celah terhadap kontrak backend & admin

Urut dari dampak terbesar. Semua ini **belum dikerjakan**.

1. **`/atur-ulang-password?token=` tidak ada.** Backend dan admin mengirim tautan reset password ke path itu (FRONTEND_HANDOFF §3.1, ADMIN_HANDOFF §5), tetapi client memakai `/password-baru` dengan stub `resetPassword` (`lib/auth-stub.ts`). Tautan dari admin akan 404. Perbaikan: halaman `/atur-ulang-password` yang membaca `token` dan memanggil `POST /auth/reset-password { token, password }`. Form yang ada (`components/auth/reset-password-form.tsx`) bisa dipakai ulang.
2. **`/konfirmasi-email?token=` tidak memanggil API.** Halaman hanya membaca `?email=` dan tombol "Kirim ulang" memakai stub. Tautan konfirmasi daftar, ganti email, dan kirim ulang dari admin belum mengonfirmasi apa pun. Perbaikan: bila ada `token`, panggil `POST /auth/confirm-email-change { token }`, tangani `400 BAD_TOKEN`. Kirim ulang mandiri belum ada endpoint-nya.
3. **`/daftar?email=` (undangan admin) tidak mengisi form.** `RegisterForm` belum membaca query `email`.
4. **Login akun ditangguhkan.** `lib/auth.ts` hanya menangani `BAD_CREDENTIALS` dan `EMAIL_UNCONFIRMED`. `403 ACCOUNT_SUSPENDED` jatuh ke toast "Tidak dapat terhubung ke server". Perlu pesan khusus di `LoginForm`.
5. **Tema dengan tahap utama kustom bisa crash.** `GET /themes/:slug` sekarang mengirim `groups` (judul, ikon, warna per tahap utama, bisa diatur admin), `theme.drivers`, dan `stages[].shares` (porsi pendapatan per emiten). Client mengabaikan ketiganya:
   - `toThemeDetail` hanya mengenal `hulu`/`tengah`/`hilir`. Kunci grup lain membuat `GROUP_UI[g]` undefined dan halaman error.
   - `GROUP_DESC` di `lib/theme-detail.ts` masih copy khusus Batubara; seharusnya dari `groups[].description`.
6. **`prefs.numberFormat` belum dipakai.** Semua angka besar memakai format singkat (`rupiahShort`), walau pengguna memilih "Lengkap" di Pengaturan.
7. **Logo emiten.** `EmitenAvatar` memakai daftar tetap 7 logo di `public/logos/emiten/` dan mengabaikan `logoUrl` dari API. Logo baru dari admin tidak tampil. Perbaikan: pakai `logoUrl` dan tambahkan rewrite `/logos/:path*` ke backend (sama seperti saran di ADMIN_HANDOFF §6).

Yang sudah sesuai kontrak: 401 dari endpoint mana pun → sesi berakhir; 404 → `notFound()` (emiten/tema belum terbit tidak tampil); `204` tidak di-`json()`; error validasi `fields` ditampilkan per input.

## 6. Belum tersedia di API (tetap stub di client)

Dari FRONTEND_HANDOFF §3.3 dan backend HANDOFF §8. Lokasi stub di client:

| Fitur | Stub di client |
| --- | --- |
| ⌘K `GET /search` + riwayat pencarian | `lib/search-stub.ts`, `components/app/search-command.tsx`, `RECENT_SEARCHES`/`RECENT_VIEWED` di `lib/emiten.ts` |
| "Kabari saya" industri Segera hadir | `components/tema/sector-industries.tsx` (hanya state lokal) |
| "Perubahan bisnis" di Watchlist | `lib/watchlist.ts` (`sig: null`) |
| Label "Di tesis Anda", "Ada emiten Anda" | Disembunyikan / `mine: false` di `lib/themes.ts` |
| Tesis, Portofolio, Beranda | `lib/theses.ts`, `lib/thesis-wizard-data.ts`, `lib/portfolio-data.ts`, `lib/dashboard.ts` |
| Notifikasi | `lib/notifications.ts`, `components/app/notification-panel.tsx` |
| Bantuan & tiket, Masukan, Langganan | `lib/akun-data.ts`, `components/akun/bantuan.tsx`, `langganan.tsx`, `lib/auth-stub.ts` (`sendContact`) |
| Lupa password mandiri, kirim ulang konfirmasi | `lib/auth-stub.ts` |
| Login Google, foto profil | `components/auth/google-button.tsx`, `components/akun/profil.tsx` |
| Ekspor CSV pengguna | `components/akun/pengaturan.tsx` (toast saja) |
| Unduh laporan / prospektus (`url` selalu `null`) | Tombol memanggil `soon(…)` di `components/emiten/detail-parts.tsx` |

Saat endpoint tersedia: tambahkan fetch di `lib/backend.ts` (server) atau panggil `api()` (browser), tambahkan mapper + test, hapus stub-nya.

## 7. Cara menguji ujung-ke-ujung

1. `npm test`, `npx tsc --noEmit`, `npx eslint app components lib`. Error di `.next/types` karena `app/page` tidak ada sudah ada sejak lama, abaikan.
2. Dengan backend dan Next jalan, daftar user uji lewat `/api/auth/register`, set `emailVerified`, login dengan cookie jar `curl -c/-b` ke `http://localhost:<port>/api/auth/login`.
3. Render halaman dengan cookie yang sama (`curl -b jar http://localhost:<port>/tema/sektor/energi`) dan cari teks yang diharapkan. `NEXT_HTTP_ERROR_FALLBACK;404` di HTML berarti `notFound()`.
4. Hapus user uji: `DELETE /api/me { "confirm": "HAPUS" }` (data miliknya ikut terhapus lewat cascade). Jangan menyentuh akun lain di database dev.

Perubahan backend baru aktif setelah proses backend di-restart.
