# StockPlan Backend — Handoff

Status per 10 Nov 2026. Dokumen ini untuk sesi Claude Code berikutnya (dan developer) yang melanjutkan backend. Baca dari atas sebelum menulis kode.

Acuan produk dan design ada di `stockplan-app-handoff/HANDOFF.md` (disebut "handoff design" di bawah). Dokumen ini hanya mencatat **apa yang sudah dibangun, keputusan yang diambil, dan apa yang belum**.

---

## 1. Menjalankan

```bash
cp .env.example .env          # isi DB_*; APP_URL opsional (default http://localhost:3000, dipakai link email)
npm install
npm run migrate               # sequelize-cli db:migrate
npx sequelize-cli db:seed:all # data dev; lihat §6 sebelum menjalankan ulang
npm run dev                   # nodemon, port 3000 (PORT untuk mengganti)
npm test                      # node --test, unit test di lib/*.test.js
```

- Swagger UI: `GET /docs`, spec mentah: `GET /docs.json`.
- Semua respons JSON. Error selalu `{ error: { code, message, fields? } }`.
- Login di Swagger ("Try it out" `POST /auth/login`) memasang cookie `sid`; endpoint lain lalu bisa dicoba di tab yang sama.
- User baru `emailVerified=false` dan belum bisa login karena email konfirmasi belum terkirim (§7). Untuk dev, set manual:
  `UPDATE auth_users SET "emailVerified" = true WHERE email = '…';`

## 2. Stack dan struktur

Express 4 (generator), Sequelize 6 + PostgreSQL, `sequelize-cli` untuk migrasi/seed, `swagger-ui-express`, test dengan `node:test` bawaan. Tidak ada dependency validasi atau auth tambahan — hash password memakai `crypto.scrypt`.

> Handoff design menyarankan Prisma; repo ini sudah memakai Sequelize sejak awal dan tetap begitu.

Pola MVC:

```
routes/        hanya memetakan URL → controller (+ requireAuth)
controllers/   baca request, panggil model + lib, tulis respons
models/        definisi Sequelize (tableName eksplisit, lihat §3)
lib/           fungsi murni: validasi, kalkulasi, bentuk respons. Semua logika yang bisa dites ada di sini
lib/*.test.js  unit test
middleware/    requireAuth
migrations/    skema (jangan edit migrasi yang sudah jalan; buat migrasi baru)
seeders/       data dev + seeders/data/*
docs/openapi.js  spec OpenAPI, ditulis manual
public/logos/emiten/  logo emiten (disajikan statis)
```

`routes/index.js`, `routes/users.js`, dan `views/` (jade) adalah sisa generator Express dan tidak dipakai API. Aman dihapus bila ingin bersih.

## 3. Konvensi (wajib diikuti)

- **Nama tabel**: `<domain>_<jamak>` snake_case, set lewat `tableName` di model. Nama kolom tetap camelCase (default Sequelize). Domain yang sudah dipakai: `auth_`, `theme_`, `market_`, `watchlist_`, `admin_`. Rencana: `thesis_`, `portfolio_`, `notification_`, `support_` (tiket).
- **Migrasi**: satu perubahan = satu file baru `YYYYMMDDHHMMSS-…js`. Enum Postgres ikut di-drop di `down`.
- **Validasi** di `lib/<modul>.js`: fungsi `validateX(body)` → `{ values, errors }` (`errors` = `null` atau `{ field: pesan }`). Update parsial: hanya field yang dikirim yang divalidasi dan diubah.
- **Error**: pakai `fail(res, status, code, message, fields)` dari `lib/http.js`. Kode yang dipakai: `VALIDATION` (422), `UNAUTHENTICATED` (401), `NOT_FOUND` (404), `EMAIL_TAKEN` (409), `BAD_CREDENTIALS` (401), `EMAIL_UNCONFIRMED` (403), `BAD_TOKEN` (400), `CURRENT_SESSION` (400), `NOT_IPO` (422), `BAD_REQUEST`/`SERVER_ERROR` (handler global di `app.js`).
- **Copy**: pesan berbahasa Indonesia diambil persis dari `stockplan-app-handoff/design/screens/*.dc.html`. Pesan yang tidak ada di design ditandai `// COPY: perlu review`. Jangan mengarang copy tanpa tanda itu (`grep -rn "COPY: perlu review"` untuk daftar).
- **Uang** dalam Rupiah utuh (number), rasio dalam angka (`roePct: 7`), tanggal ISO. Frontend yang memformat (`Rp44,9 T`, `1,5x`). Kolom `BIGINT` dikonversi `Number()` di `lib/` karena pg mengembalikan string.
- **Status turunan dihitung, tidak disimpan**: status sektor/industri (Siap/Baru/Segera hadir), tahap watchlist (baru/pel/siap), state jadwal IPO, `failedDays`. Ikuti pola ini untuk `suggestVerdict`, `evalTier`, drift portofolio, dll.
- **Tanggal bursa** dihitung di zona `Asia/Jakarta` (`jakartaDate()` di `lib/companies.js`).
- **Data orang nyata** di seed diganti placeholder `[Nama …]` (handoff design §1.3).
- **Larangan produk** (handoff design §1.1): tidak ada endpoint beli/jual/order, harga realtime, prediksi, atau rekomendasi.
- Setiap endpoint baru: route + controller + fungsi `lib/` dengan test + entri di `docs/openapi.js`.
- Shortcut yang disengaja diberi komentar `// shortcut: <batasan>, <kapan di-upgrade>`.

## 4. Auth dan sesi

- Cookie `sid` httpOnly, `SameSite=Lax`, `Secure` di production. Token acak 32 byte; yang disimpan hanya SHA-256-nya (`auth_sessions.tokenHash`).
- Login: "Ingat saya" (`remember`, default `true`) → sesi 30 hari + cookie persisten; `false` → 24 jam + cookie sesi browser.
- `middleware/requireAuth.js` mengisi `req.user` dan `req.session`, menolak sesi kedaluwarsa, dan memperbarui `updatedAt` sesi paling sering sekali per menit (dipakai sebagai "aktif terakhir").
- Admin memakai tabel, sesi, dan cookie sendiri; sesi customer tidak bisa masuk `/admin/api` dan sebaliknya.
- Login gagal memakai hash dummy supaya waktu respons tidak membocorkan email terdaftar.
- Ganti password → semua sesi lain dihapus, sesi saat ini tetap.
- Aturan password: daftar = min 8 + huruf besar + angka; ganti password = min 8 + huruf + angka (mengikuti design apa adanya; **belum diputuskan** apakah disamakan).

## 5. Endpoint yang sudah ada

Semua butuh cookie `sid` kecuali yang ditandai *publik*. Detail skema ada di Swagger.

| Endpoint | Halaman design | Catatan |
| --- | --- | --- |
| `POST /auth/register` *publik* | Register | Tidak membuat sesi; user harus konfirmasi email |
| `POST /auth/login` *publik* | Login | |
| `POST /auth/logout` | menu akun | |
| `POST /auth/confirm-email-change` *publik* | link email | Token sekali pakai, 24 jam |
| `GET /me` | semua | User + `prefs` lengkap (default diisi otomatis) |
| `PATCH /me` | Profil | nama, pengalaman, jangka waktu, tema minat |
| `DELETE /me` | Pengaturan | body `{ "confirm": "HAPUS" }` |
| `PATCH /me/prefs` | Pengaturan | tampilan, biaya, jadwal evaluasi, notifikasi (§6.8 handoff design). Merge per jenis × kanal |
| `POST /me/email` | Pengaturan | email lama berlaku sampai link diklik |
| `POST /me/password` | Profil | |
| `GET /me/sessions`, `DELETE /me/sessions/:id` | Profil | tidak bisa menghapus sesi saat ini (pakai logout) |
| `GET /sectors` | Tema | + `industryNames` untuk kotak cari |
| `GET /sectors/:slug` | TemaSektor | subsektor → industri, `notice` untuk banner "Data baru" |
| `GET /companies?q=&sector=` | EmitenSearch | urutan "Paling cocok" sesuai design, chip sektor; tanpa `q` + `sector` = jelajah satu sektor; per baris `themes` (Tema terkait) + `inWatchlist` |
| `GET /companies/:ticker` | Emiten, EmitenIPO, EmitenDataTertunda | + `themes` (badge tahap), `peers` ("Satu tahap"), `viewer` (status tombol) |
| `PUT\|DELETE /companies/:ticker/alerts/:kind` | EmitenIPO, EmitenDataTertunda | `listing` (hanya status ipo), `data-update` |
| `GET /themes/:slug` | TemaDetail, TemaDetailTabel, panel emiten | hanya tema `published`; isi drawer dari `profile.highlights`; `viewer.watchlist` |
| `GET /watchlist` | Watchlist | + data emiten dan tema/tahap utama per item |
| `POST /watchlist`, `DELETE /watchlist/:ticker` | tombol watchlist | idempoten |
| `PATCH /watchlist/:ticker` | Watchlist | catatan dan/atau checklist; memperbarui `touchedAt` |

**Admin** (`/admin/api`, cookie terpisah `asid` path `/admin/api`; detail di Swagger tag *Admin: Auth*):

| Endpoint | Halaman design | Catatan |
| --- | --- | --- |
| `POST /admin/api/auth/login` *publik* | AdminLogin | Email `@stockplan.id`. Berhasil → `{ step: 'two_factor' }` + cookie `asid` sementara 5 menit; perangkat tepercaya (`atd`) langsung dapat `{ admin }` |
| `POST /admin/api/auth/verify` | AdminLogin2FA | `{ code, method: totp\|backup, trustDevice }`. Token sesi diganti setelah 2FA |
| `POST /admin/api/auth/logout` | menu akun, "Ganti akun" | Idempoten, juga untuk sesi yang belum lewat 2FA |
| `GET /admin/api/auth/me` | shell admin | `{ admin: { id, name, email, role }, perms }` — `perms` untuk menyembunyikan/menonaktifkan aksi di UI |
| `POST /admin/api/auth/accept-invite` *publik* | (belum didesain) | `{ token, password ≥ 10, name? }` → secret TOTP + kode cadangan (sekali tampil); lalu masuk biasa |

**Admin: Data emiten** (`/admin/api/companies`, perlu sesi admin + izin modul `em` dari `lib/adminRoles.js`):

| Endpoint | Izin | Halaman design | Catatan |
| --- | --- | --- | --- |
| `GET /admin/api/companies?q=&tab=&sector=&page=&pageSize=` | `em:view` | AdminEmiten | Tab: `all`/`review`/`incomplete`/`ready` (hitungan mengikuti q + sektor); kelengkapan 5 bagian; `reportCount` selalu 0 |
| `GET /admin/api/companies/export.csv?tickers=` | `em:view` | AdminEmiten | Semua, atau hanya yang dipilih |
| `POST /admin/api/companies/bulk-review` | `em:edit` | AdminEmiten | `{ tickers }` 1–200 → status "Perlu ditinjau" |
| `POST /admin/api/companies` | `em:edit` | AdminEmitenIPO | Buat emiten IPO sebagai draf; wajib `ticker` + `name`; 409 `TICKER_TAKEN` |
| `GET /admin/api/companies/:ticker` | `em:view` | AdminEmitenEdit, AdminEmitenIPO | `form` + `sections` (kelengkapan) + `canPublish` + `themes` (hanya baca) |
| `PATCH /admin/api/companies/:ticker` | `em:edit` | keduanya | Simpan draf; hanya bagian yang dikirim diganti |
| `POST /admin/api/companies/:ticker/publish` | `em:publish` | keduanya | Draf → data yang dilihat customer; 422 `INCOMPLETE` bila ada bagian belum lengkap |

Alur draf/terbit: `market_companies.draft` (JSONB) menampung form yang belum terbit; `publishStatus` = `draft`/`review`/`published`; `publishedAt` NULL = belum pernah terbit dan **disembunyikan dari endpoint customer** (`GET /companies`, `/companies/:ticker`, peers, hitungan sektor, tambah watchlist). Data seed otomatis `published` lewat default DB. Form ↔ kolom dipetakan di `lib/adminCompanies.js` (`columnsToForm`/`formToColumns`); isi editorial tambahan disimpan di `profile` (`revenueSources`, `keyTips`, `trading`, `overviewSource`, `asOfSource`, `subsector`). Status "IPO baru" dihitung: `status=ipo` dan `publishStatus=draft`. Ticker tidak bisa diubah setelah dibuat (kunci utama dipakai watchlist/tema).

**Admin: Pengguna** (`/admin/api/users`, izin modul `usr`):

| Endpoint | Izin | Catatan |
| --- | --- | --- |
| `GET /admin/api/users?q=&tab=&plan=&page=&pageSize=` | `usr:view` | `summary` (4 kartu) + `tabs` + baris. Status dihitung (`lib/adminUsers.js` `statusOf`, dan `STATUS_SQL` untuk filter/hitungan di SQL; keduanya harus sama): `sus` > `new` > `idle` (30 hari tanpa aktivitas) > `act` |
| `GET /admin/api/users/export.csv?q=&plan=` | `usr:view` | Tanpa isi tesis/portofolio |
| `GET /admin/api/users/:id` | `usr:view` | Panel detail; hanya jumlah pemakaian, `actions` = tombol yang tampil |
| `POST /admin/api/users/:id/suspend` | `usr:delete` | `{ reason, note? }`; alasan dari daftar design; menghapus semua sesi; login berikutnya 403 `ACCOUNT_SUSPENDED` |
| `POST /admin/api/users/:id/restore` | `usr:delete` | |
| `POST /admin/api/users/:id/resend-confirmation` | `usr:edit` | Memakai ulang token ganti email dengan `pendingEmail` = email sekarang; dikonfirmasi lewat `POST /auth/confirm-email-change` |
| `POST /admin/api/users/:id/password-reset` | `usr:edit` | Tautan 1 jam; dipakai lewat `POST /auth/reset-password` *publik* (sekali pakai, mengeluarkan semua sesi) |
| `POST /admin/api/users/invite` | `usr:edit` | Hanya mengirim tautan daftar (lihat §7) |

Perubahan sisi customer dari modul ini: `auth_users.lastActiveAt` (diisi saat login dan tiap sentuhan sesi), `suspendedAt` memblokir login dan `requireAuth`, `POST /auth/reset-password`. Kolom suspend/reset tidak pernah ikut `User.toJSON()`.

**Admin: Tema & rantai nilai** (`/admin/api/themes`, izin modul `tm`):

| Endpoint | Izin | Halaman design | Catatan |
| --- | --- | --- | --- |
| `GET /admin/api/themes?q=&tab=&sector=&queue=` | `tm:view` | AdminTema | 4 kartu, tab `all`/`open`/`draft`/`review`, kesiapan emiten, antrean "Emiten belum masuk tema mana pun" + usulan tema |
| `POST /admin/api/themes` | `tm:edit` | AdminTema, AdminTemaBaru | Draf baru; wajib nama (≥ 3, unik → 409 `THEME_TAKEN`) + sektor; slug dari nama, tetap walau nama diganti |
| `GET /admin/api/themes/:slug` | `tm:view` | AdminTemaEdit | `form` + 5 `checks` + profil emiten + total porsi lintas tahap + riwayat |
| `PATCH /admin/api/themes/:slug` | `tm:edit` | AdminTemaEdit, AdminTemaBaru | Simpan draf; peran tanpa `tm:publish` → status "Perlu ditinjau" |
| `POST /admin/api/themes/:slug/companies` | `tm:edit` | AdminTema "Petakan" | `{ ticker, stage? }` ke draf, porsi kosong |
| `POST /admin/api/themes/:slug/publish` | `tm:publish` | AdminTemaEdit | Draf → tema + **semua tahap diganti** dalam satu transaksi |

Alur draf/terbit sama dengan emiten: `theme_themes.draft` (form), `status` hanya label admin, **`publishedAt` = terlihat pengguna** (endpoint customer sekarang menyaring `publishedAt`, bukan `status`). Tahap utama di `theme_themes.groups` (NULL = Hulu/Tengah/Hilir bawaan); porsi + sumber per emiten di `theme_stages.shares` (`tickers` tetap urutan & indeks GIN). `GET /themes/:slug` customer kini juga mengembalikan `groups`, `theme.drivers`, dan `stages[].shares`. Pemilihan emiten untuk tahap / pool drag & drop memakai `GET /admin/api/companies?q=&sector=`.

**Admin: Akses & peran** (`/admin/api/access`, izin modul `acc`; bawaan hanya Super admin):

| Endpoint | Izin | Catatan |
| --- | --- | --- |
| `GET /admin/api/access/members` | `acc:view` | AdminAkses: peran, kunci, 2FA, masuk terakhir + gagal hari ini (dari `admin_audit_logs`), status, `actions` |
| `POST /admin/api/access/members/invite` | `acc:edit` | `{ email @stockplan.id, role }` → status Undangan, tautan 72 jam |
| `PATCH /admin/api/access/members/:id` | `acc:edit` | `{ role }` |
| `POST /admin/api/access/members/:id/resend-invite` | `acc:edit` | Tautan baru |
| `POST /admin/api/access/members/:id/deactivate` / `reactivate` | `acc:delete` | Nonaktif = semua sesi + perangkat tepercaya dihapus |
| `GET /admin/api/access/roles` | `acc:view` | AdminAksesPeran: `modules` (baris matriks) + `roles` dengan `perms` efektif |
| `POST /admin/api/access/roles`, `PUT /admin/api/access/roles/:id` | `acc:edit` | Buat peran / simpan izin |

Peran ada di tabel `admin_roles` (5 bawaan dibuat migrasi; `admin_users.role` FK ke sini) dan **dibaca tiap request** di `requireAdmin` → `req.adminPerms` (dipakai `requirePerm` dan `can(req.adminPerms, …)`), jadi perubahan peran/izin langsung berlaku. Modul & aksi di `lib/adminRoles.js` `MODULES`. Pengaman (`lib/adminAccess.js`): tidak bisa mengubah/menonaktifkan diri sendiri; hanya super admin yang memberi/mencabut peran super admin atau mengubah anggota super admin; minimal 1 super admin aktif; izin super admin tidak bisa diubah; anggota tidak bisa mengubah izin peran yang sedang ia pegang (mencegah eskalasi). Status anggota: `invited` → `active` → `disabled`.

Aturan: 5 kegagalan (password atau kode 2FA) per email dalam 15 menit → 429 `ACCOUNT_LOCKED` 15 menit (dihitung dari `admin_audit_logs`, jadi email tak dikenal berperilaku sama); sesi berakhir 30 menit tanpa aktivitas; perangkat tepercaya 7 hari; kode cadangan sekali pakai. Middleware: `requireAdmin` (sudah lewat 2FA) dan `requireAdmin.pending` (baru langkah 1). Seeder admin dev: `admin@stockplan.id` / `StockPlanDev2026`, TOTP secret dan kode cadangan dicetak seeder (`npx sequelize-cli db:seed --seed 20261111000001-admin-users.js`).

Penyimpangan dari §9 handoff design (disengaja):
- `GET /sectors/:slug` mengganti `GET /sectors/:id/themes` (satu panggilan berisi seluruh halaman).
- Pencarian emiten di `GET /companies?q=`; `GET /search` (gabungan ⌘K) belum dibuat.
- Pengingat emiten (`/companies/:ticker/alerts/:kind`) tidak ada di §9; ditambahkan untuk tombol di design.

## 6. Data

### 6.1 Tabel

| Tabel | Isi |
| --- | --- |
| `auth_users` | akun + `prefs` (JSONB) + profil + `pendingEmail*` |
| `auth_sessions` | sesi login |
| `theme_sectors` → `theme_subsectors` → `theme_industries` | hierarki IDX-IC. Industri: `dataStatus` (`soon`/`ready`), `dataUpdatedAt`, `updateNote`, `themeSlug` |
| `theme_themes`, `theme_stages` | tema rantai nilai; `theme_stages.tickers` = array JSONB berurutan (indeks GIN), `shares` = porsi + sumber per emiten. Satu emiten boleh di beberapa tahap. Tema: `groups` (tahap utama), `drivers`, `draft`, `publishedAt` |
| `market_companies` | emiten. Kolom untuk query/sort; isi editorial halaman di `profile` (JSONB) dan `ipo` (JSONB). `dataDelayed` JSONB → banner data tertunda |
| `admin_roles` | peran admin + `perms` JSONB `{ modul: [aksi] }`; `system` = peran bawaan |
| `admin_users`, `admin_sessions`, `admin_trusted_devices`, `admin_audit_logs` | akun admin (`role` FK ke `admin_roles`, `status` invited/active/disabled, undangan + `twoFactorEnabledAt`, TOTP + kode cadangan ter-hash), sesi (`verified` = lewat 2FA), perangkat tepercaya, log percobaan masuk (fondasi Riwayat perubahan; bukan milik user customer, tanpa cascade dari `auth_users`) |
| `watchlist_items` | per user × ticker, `checklist` 4 boolean, `note` |
| `market_company_alerts` | per user × ticker × `listing`/`data_update` |

Semua tabel milik user `ON DELETE CASCADE` ke `auth_users`. **Tabel baru milik user (tesis, portofolio, dst.) wajib ikut cascade**, karena `DELETE /me` mengandalkannya.

### 6.2 Seed (dev saja)

Urutan file penting (`db:seed:all` berjalan sesuai nama file):

1. `…01-theme-sectors.js` — 11 sektor dari board `Tema`; subsektor/industri **hanya Energi** dari board `TemaSektor`. Tanggal Batu Bara dibuat relatif (kemarin) supaya status "Baru" terlihat.
2. `…02-market-companies.js` — 35 emiten dari array data board `EmitenSearch` (`seeders/data/companies-search.json`) + ABNU (contoh IPO fiktif). Detail halaman lengkap hanya **BUMI** dan **ABNU** (`seeders/data/companies-detail.js`). Market cap hanya untuk 5 emiten yang angkanya ada di design.
3. `…03-theme-batubara.js` — tema Batubara dari `fixtures/theme-batubara.json` (5 tahap, 21 emiten) + 14 emiten tambahan dari fixture.
4. `…04-theme-batubara-highlights.js` — isi editorial TemaDetail: `tagline` (Pembeda utama), market cap per 16 Okt 2026, dan `profile.highlights` (angka kunci, insight, komposisi pendapatan, anak usaha) untuk drawer. Hanya mengisi kolom yang kosong. Di DB yang sudah ter-seed: `npx sequelize-cli db:seed --seed 20261110000004-theme-batubara-highlights.js`.

Catatan:
- `sequelize-cli` tidak mencatat seed yang sudah jalan. Menjalankan ulang `db:seed:all` akan gagal karena slug/ticker unik. Untuk reset: `npx sequelize-cli db:seed:undo:all && npx sequelize-cli db:seed:all`.
- Pembagian industri untuk emiten di luar design (kontraktor → Jasa & Peralatan, penambang → Batu Bara, TCPI/PSSI → Transportasi) adalah tebakan dev, **bukan IDX-IC resmi**.
- Logo emiten bersumber dari TradingView (handoff design §0.5); ganti dengan aset berlisensi sebelum rilis publik.

## 7. Shortcut yang diketahui

| Lokasi | Batasan | Kapan di-upgrade |
| --- | --- | --- |
| `lib/mailer.js` | Email tidak terkirim; link hanya di-log ke console | Sebelum beta publik: pasang SMTP/Resend. Dipakai juga untuk konfirmasi daftar dan reset password |
| `controllers/sectorController.js` | Memuat field ringan semua emiten untuk menghitung jumlah per sektor/industri | Kalau emiten > beberapa ribu: ganti ke `COUNT … GROUP BY` |
| `controllers/companyController.js` | "Satu tahap" fallback ke industri yang sama kalau emiten belum masuk tema | Hapus fallback kalau semua emiten sudah dipetakan ke tema |
| Login | Belum ada rate limit / lockout untuk customer | Sebelum go-live |
| `admin_users.totpSecret` | TOTP secret disimpan polos | Enkripsi AES-GCM (kunci dari env) sebelum production |
| `market_companies` (admin list) | Daftar admin memuat semua emiten + `profile` lalu menghitung kelengkapan/tab di JS | Kalau lambat: simpan kolom kelengkapan, filter di SQL |
| Admin emiten: file | Logo, laporan keuangan (XBRL/PDF), dan prospektus IPO belum ada (belum ada penyimpanan file); bagiannya tidak ikut cek kelengkapan | Saat modul upload (bersama `reports[].url`, `ipo.documents[].url`) |
| Admin emiten: `reportCount`/`reports` | Selalu 0/kosong, belum ada modul Masukan | Saat modul Masukan & laporan |
| Admin emiten: `ipo.settings` | `showUpcoming`/`autoConvert` hanya disimpan, belum dibaca | Saat daftar IPO customer / otomatisasi pindah ke tercatat |
| Admin emiten: sub-sektor | Teks bebas; terhubung ke `industryId` hanya bila namanya cocok dengan `theme_industries` (data hanya Energi), selain itu tersimpan di `profile.subsector` | Saat data IDX-IC 10 sektor lain masuk |
| Admin pengguna | Kartu "Sudah menulis tesis", kolom Tesis, evaluasi, tema dibuka, dan Laporan & masukan selalu 0/kosong; "Masuk dengan" selalu Email; Login terakhir diambil dari sesi yang masih ada (hilang setelah logout) | Saat modul Tesis, Masukan, Google login, dan tabel riwayat login ada |
| Admin pengguna: undangan | `POST /users/invite` hanya mengirim tautan daftar; tidak ada tabel undangan dan pendaftaran tetap terbuka | Saat beta ditutup: tabel undangan + pendaftaran bertoken |
| Admin pengguna: "Tidak aktif" | Ambang 30 hari tanpa aktivitas dikarang dev (design tidak menyebut) | Konfirmasi ke produk |
| Email (`lib/mailer.js`) | Konfirmasi daftar/atur ulang/undangan hanya di-log | Sebelum beta publik |
| Admin: akun dikunci | "Super admin diberi tahu" hanya tercatat di audit log + `console.warn` | Saat ada notifikasi admin |
| Admin: aktivasi undangan | `accept-invite` mengembalikan secret TOTP langsung; tidak ada konfirmasi kode sebelum aktif (2FA tercatat aktif saat login pertama). Layar belum didesain (handoff design §12) | Saat layar aktivasi didesain |
| Admin akses | Tidak ada hapus peran/anggota (design tidak punya tombolnya); atur ulang password admin ("Minta super admin mengirim tautan") belum ada; lokasi ("Jakarta") di masuk terakhir tidak ada (tanpa GeoIP) | Saat dibutuhkan |
| Admin akses: copy | Design menulis perubahan peran "Berlaku di sesi berikutnya", tapi server menerapkannya langsung (lebih aman untuk pencabutan) | Samakan copy di client |
| `/docs` | Swagger terbuka untuk publik | Batasi/matikan di production |
| `market_companies.profile.reports[].url`, `ipo.documents[].url` | Selalu `null`; belum ada penyimpanan file | Saat modul upload/admin |
| Admin tema | Kolom/angka Tesis ("dipakai 412 tesis") selalu null; pemberitahuan ke pengguna yang tesisnya memakai tema belum ada | Saat modul Tesis & Notifikasi |
| Admin tema: daftar | Memuat semua tema + semua emiten (field ringan) untuk kesiapan dan antrean | Kalau emiten/tema membesar: hitung di SQL |
| Admin tema: usulan pemetaan | Hanya dari `theme_industries.themeSlug` lalu sektor yang sama; design juga menyebut anak usaha & prospektus | Saat data anak usaha/prospektus terstruktur |

## 8. Belum dibuat

Urutan yang disarankan, dimulai dari yang paling sedikit ketergantungannya.

### 8.1 Tema bisnis & emiten (melanjutkan yang ada)
1. ~~`GET /themes/:slug`~~ dan ~~Tema terkait + `inWatchlist`~~ di `GET /companies` — selesai (§5).
2. **`GET /search?q=`** gabungan emiten + tema untuk ⌘K (`LayoutCari`) + **riwayat pencarian** per user (tampil, hapus per item, "Hapus riwayat").
3. **"Kabari saya"** untuk industri "Segera hadir" (`TemaSektor`).

### 8.2 Modul lain (lihat handoff design §6 dan §9)
- **Watchlist — sisa**: "Perubahan bisnis" per emiten (feed keterbukaan BEI) belum ada; client menampilkan kosong.
- **Tesis**: daftar, wizard 5 langkah (draf), arsip/pulihkan, evaluasi + `suggestVerdict`/`evalTier` (rumus di handoff design §6.4). Membuka "Hubungkan ke tesis", "Buat tesis dari tema ini", label "Di tesis Anda".
- **Portofolio**: holdings, transaksi, dana tunai, riwayat keputusan (berbasis modal, bukan nilai pasar). Membuka "Ada emiten Anda", "Di portofolio".
- **Beranda**: `GET /dashboard` (perlu tindakan, drift ±5 poin, IPO 14 hari, dll.).
- **Notifikasi**: tabel + endpoint §9, pengiriman sesuai `prefs.notifications`, dan pemicu dari `market_company_alerts`.
- **Bantuan & tiket**.
- **Auth tambahan**: konfirmasi email daftar (endpoint ada lewat `confirm-email-change`, tinggal dikirim saat daftar), lupa password mandiri (`reset-password` sudah ada, tinggal `POST /auth/forgot`), Google, upload foto profil.
- **Ekspor CSV** (`GET /me/export.csv`) — design: tautan dikirim lewat email.
- **Admin** (`/admin/api`, handoff design §8): ~~login + 2FA~~ dan ~~Data emiten (daftar, edit, tambah IPO)~~ selesai (§5); ~~Pengguna~~ dan ~~Tema~~ selesai (§5); ~~Akses & peran (RBAC kustom)~~ selesai (§5); sisanya Dashboard, Masukan, sinkron BEI (mengisi `dataDelayed`), riwayat/audit log. Saat ini semua data referensi hanya dari seed.

### 8.3 Keputusan yang masih terbuka
- Samakan aturan password daftar vs ganti password?
- Data IDX-IC resmi untuk 10 sektor selain Energi (sumber dan cara impor).
- Rentang biaya transaksi di Pengaturan dibatasi 0–10% — angka dari dev, belum dikonfirmasi.
- Semua pesan bertanda `// COPY: perlu review`.

## 9. Cara kerja yang terbukti di repo ini

- Untuk setiap layar: buka `stockplan-app-handoff/design/screenshots/<Board>.jpg`, baca script `<script type="text/x-dc">` di `design/screens/<Board>.dc.html` untuk data contoh, copy, dan logika (mis. skor pencarian, aturan validasi), lalu bangun endpoint yang mengembalikan semua isi halaman dalam satu panggilan bila wajar.
- Uji ujung-ke-ujung dengan server di port lain (`PORT=39xx node bin/www`), daftar user uji, set `emailVerified`, login dengan cookie jar `curl -c/-b`, lalu hapus user uji (data miliknya ikut terhapus lewat cascade). Jangan menyentuh akun lain di database dev.
