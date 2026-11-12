# StockPlan API — Handoff untuk Frontend (Client & Admin)

Status per 12 Nov 2026. Dokumen ini untuk tim yang membangun **web client** (aplikasi pengguna) dan **panel admin**. Isinya: cara terhubung, cara auth, kontrak error, dan endpoint mana yang dipakai di layar mana.

Skema request/response lengkap ada di Swagger. Dokumen ini tidak mengulanginya:

- Swagger UI: `GET /docs`
- Spec mentah (OpenAPI 3.0): `GET /docs.json`. Bisa dipakai untuk generate tipe, misalnya `npx openapi-typescript http://localhost:3000/docs.json -o src/api/schema.d.ts`.

Nama layar di dokumen ini (`EmitenSearch`, `AdminEmiten`, dst.) mengikuti board di `stockplan-app-handoff/design/screens/`.

---

## 1. Menghubungkan frontend ke API

| | Nilai |
| --- | --- |
| Base URL dev | `http://localhost:3000` |
| API client | path langsung: `/auth`, `/me`, `/sectors`, `/companies`, `/themes`, `/watchlist` |
| API admin | prefix `/admin/api` |
| Format | JSON (`Content-Type: application/json`), kecuali endpoint `*.csv` |
| Logo emiten | file statis, mis. `/logos/emiten/logo-ptba.svg` (nilai `logoUrl` di respons sudah berupa path ini) |

**Backend tidak memasang CORS.** Auth memakai cookie httpOnly, jadi browser harus memanggil API di origin frontend sendiri, lalu server frontend meneruskannya ke backend (rewrite/proxy). Begitu cara client dan admin (keduanya Next.js) terhubung sekarang:

| Frontend | Path di browser | Diteruskan ke backend | Detail |
| --- | --- | --- | --- |
| Client | `/api/:path*` | `{BACKEND_URL}/:path*` (prefix `/api` dibuang) | [CLIENT_HANDOFF.md](CLIENT_HANDOFF.md) §2 |
| Admin | `/admin/api/:path*` | `{ADMIN_API_ORIGIN}/admin/api/:path*` (path sama) | [ADMIN_HANDOFF.md](ADMIN_HANDOFF.md) §1 |

Jadi path di dokumen ini (`/me`, `/companies`, …) adalah path **di backend**. Dari browser client, panggil dengan prefix `/api` (`/api/me`). Server Component boleh memanggil backend langsung asal meneruskan cookie `sid`.

```ts
// next.config.ts (client)
rewrites: async () => [{ source: '/api/:path*', destination: `${process.env.BACKEND_URL}/:path*` }],
```

Frontend di subdomain sendiri (mis. `admin.stockplan.id`) tetap aman selama API dipanggil lewat rewrite di origin itu. CORS baru dibutuhkan kalau browser harus memanggil backend di domain lain secara langsung; kabari tim backend dulu.

**Logo emiten** (`logoUrl` = `/logos/emiten/…`) disajikan backend. Tambahkan rewrite `/logos/:path*` ke backend, jangan menyalin file logo ke `public/` frontend.

## 2. Kontrak umum

### 2.1 Error

Setiap error memakai bentuk yang sama:

```json
{ "error": { "code": "VALIDATION", "message": "Periksa lagi isian Anda.", "fields": { "email": "Format email belum benar" } } }
```

- `message` sudah dalam Bahasa Indonesia dan boleh ditampilkan langsung ke pengguna.
- `fields` hanya ada pada error validasi. Kuncinya nama field di body, nilainya pesan untuk ditampilkan di bawah input.
- Logika UI sebaiknya bercabang berdasarkan `code`, bukan `message` (copy masih bisa berubah).

| HTTP | `code` | Arti / yang perlu dilakukan UI |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | Sesi tidak ada atau habis. Arahkan ke halaman login |
| 401 | `BAD_CREDENTIALS` | Email/password salah |
| 401 | `BAD_CODE` | (admin) Kode 2FA atau kode cadangan salah |
| 403 | `EMAIL_UNCONFIRMED` | Login ditolak, email belum dikonfirmasi |
| 403 | `ACCOUNT_SUSPENDED` | Login ditolak, akun ditangguhkan |
| 403 | `FORBIDDEN` | (admin) Peran tidak punya izin untuk aksi ini |
| 403 | `OWN_ROLE`, `SUPER_LOCKED` | (admin) Pengaman di Akses & peran |
| 404 | `NOT_FOUND` | Data tidak ada (atau belum terbit untuk client) |
| 409 | `EMAIL_TAKEN`, `TICKER_TAKEN`, `THEME_TAKEN`, `ROLE_TAKEN` | Nilai unik sudah dipakai |
| 409 | `ALREADY_*`, `NOT_SUSPENDED`, `BAD_STATE`, `CANNOT_RESET`, `NOT_REVERTABLE`, `CONFLICT`, `IN_THEME` | Aksi tidak cocok dengan status data sekarang. Muat ulang data |
| 400 | `BAD_TOKEN` | Token di tautan email tidak valid/kedaluwarsa |
| 400 | `CURRENT_SESSION` | Tidak bisa menghapus sesi perangkat ini dari daftar sesi (pakai logout) |
| 422 | `VALIDATION` | Tampilkan `fields` per input |
| 422 | `INCOMPLETE` | (admin) Terbit ditolak, masih ada bagian belum lengkap |
| 422 | `NOT_IPO` | Pengingat "listing" hanya untuk emiten berstatus IPO |
| 429 | `ACCOUNT_LOCKED` | (admin) 5 gagal dalam 15 menit, dikunci 15 menit |
| 4xx | `BAD_REQUEST` | Error generik (mis. JSON tidak valid) |
| 500 | `SERVER_ERROR` | Tampilkan pesan umum |

Respons sukses tanpa isi memakai `204 No Content` (logout, hapus, dll.). Jangan memanggil `res.json()` untuk 204.

### 2.2 Format data

- **Uang dalam Rupiah utuh** (number), mis. `44900000000000`. Frontend yang memformat (`Rp44,9 T`). Hormati `prefs.numberFormat` user (`short` / `full`).
- **Rasio dan persen berupa angka**, nama field menunjukkan satuannya: `roePct: 7` berarti 7%, `pbv: 1.5` ditampilkan `1,5x`.
- **Tanggal** ISO 8601. `date` = `YYYY-MM-DD`, `date-time` = UTC. Tampilkan dalam zona `Asia/Jakarta`.
- **Status turunan sudah dihitung server** (status sektor Baru/Siap/Segera hadir, tahap watchlist, state jadwal IPO, status pengguna di admin). Pakai field `status`/`statusLabel` dari respons; jangan menghitung ulang di client.
- Banyak respons admin menyertakan `label` siap tampil di samping `key` (mis. `{ key: 'draft', label: 'Draf tersimpan' }`). Pakai `label` untuk teks, `key` untuk logika/warna.

### 2.3 Larangan produk

Aplikasi tidak punya fitur beli/jual/order, harga realtime, prediksi, atau rekomendasi, dan API tidak menyediakan data untuk itu. Jangan menambahkan UI yang menyiratkan fitur tersebut.

---

## 3. Client (aplikasi pengguna)

### 3.1 Auth

Cookie `sid` (httpOnly, `SameSite=Lax`, `Secure` di production). Frontend tidak bisa dan tidak perlu membacanya.

**Daftar → konfirmasi → masuk**

1. `POST /auth/register` `{ name, email, password, agreeTerms: true, agreeNotAdvice: true }` → `201 { user, message }`. **Tidak membuat sesi.** Tampilkan layar "cek email".
   Password: min. 8 karakter, ada huruf besar dan angka.
2. Pengguna klik tautan di email → frontend membuka `/konfirmasi-email?token=…` → panggil `POST /auth/confirm-email-change` `{ token }`.
3. `POST /auth/login` `{ email, password, remember }` → `{ user }` + cookie.
   `remember` (default `true`) = sesi 30 hari; `false` = 24 jam dan hilang saat browser ditutup.
   Tangani `EMAIL_UNCONFIRMED` dan `ACCOUNT_SUSPENDED` dengan pesan khusus.
4. `POST /auth/logout` → 204.

**Saat app dibuka:** panggil `GET /me`. 200 = sudah masuk (berisi user + `prefs` lengkap), 401 = tampilkan login. Anggap 401 dari endpoint mana pun sebagai "sesi berakhir".

**Halaman yang harus ada di frontend** karena tautan email mengarah ke sana (base dari env `APP_URL` backend):

| Path frontend | Query | Panggil |
| --- | --- | --- |
| `/konfirmasi-email` | `token` | `POST /auth/confirm-email-change { token }`. Dipakai untuk konfirmasi daftar, ganti email, dan kirim ulang dari admin |
| `/atur-ulang-password` | `token` | `POST /auth/reset-password { token, password }`. Tautan 1 jam, sekali pakai, mengeluarkan semua sesi |
| `/daftar` | `email` | Isi awal form daftar (undangan beta dari admin) |

> Email belum benar-benar terkirim di dev; tautannya dicetak di log server. Lihat §5.

### 3.2 Peta layar → endpoint

Semua endpoint di bawah butuh sesi, kecuali yang di §3.1.

| Layar | Endpoint | Catatan |
| --- | --- | --- |
| Shell / menu akun | `GET /me`, `POST /auth/logout` | |
| Profil | `PATCH /me` | `name`, `experience`, `horizon`, `interestedThemes`. Kirim hanya field yang berubah |
| Profil: password | `POST /me/password` | `{ currentPassword, newPassword, confirmPassword }`. Sesi lain ikut keluar, sesi ini tetap |
| Profil: perangkat | `GET /me/sessions`, `DELETE /me/sessions/:id` | Sesi saat ini punya `current: true`; tidak bisa dihapus lewat sini |
| Pengaturan | `PATCH /me/prefs` | Tampilan, biaya transaksi, jadwal evaluasi, notifikasi. Notifikasi di-merge per jenis × kanal, jadi cukup kirim yang diubah |
| Pengaturan: email | `POST /me/email` `{ email }` | Email lama tetap berlaku sampai tautan konfirmasi diklik. Tampilkan `pendingEmail` dari `GET /me` |
| Pengaturan: hapus akun | `DELETE /me` `{ confirm: "HAPUS" }` | Semua data pengguna ikut terhapus |
| Tema | `GET /sectors` | 11 sektor + `industryNames` untuk kotak cari + `themes` (tema terbit per sektor). `status` sektor hanya mengikuti industrinya: semua industri `soon` (atau belum ada industri) = "Segera hadir", walau ada tema terbit; `themes` tetap dikirim |
| TemaSektor | `GET /sectors/:slug` | Subsektor → industri; `notice` untuk banner "Data baru"; `themes` tema terbit di sektor ini. Industri dan tema sekarang satu data (diatur admin di menu Tema): tiap industri bisa punya rantai nilai. `themeSlug` = slug industri itu bila rantainya terbit → tombol "Lihat" ke `/tema/{themeSlug}`; null = belum ada rantai. `status` industri hanya mengikuti `dataStatus` yang diatur admin (soon → "Segera hadir", ready → "Siap" atau "Baru" ≤ 7 hari), walau rantainya sudah terbit; jadi `themeSlug` bisa terisi saat `status: soon`. `themes[]` = industri sektor ini yang rantainya terbit (data yang sama dengan baris di `subsectors`) |
| TemaDetail, TemaDetailTabel | `GET /themes/:slug` | Tahap, emiten per tahap + porsi, `groups`, `drivers`; isi drawer emiten dari `profile.highlights`; `viewer.watchlist` untuk status tombol. **Kunci `groups` diatur admin** (maks. 8, tidak hanya `hulu`/`tengah`/`hilir`): ambil judul, ikon, warna, dan deskripsi dari `groups[]`, jangan di-hardcode |
| EmitenSearch | `GET /companies?q=&sector=` | Urutan "Paling cocok" dari server. Tanpa `q` + dengan `sector` = jelajah satu sektor. Per baris ada `themes` dan `inWatchlist` |
| Emiten, EmitenIPO, EmitenDataTertunda | `GET /companies/:ticker` | Satu panggilan untuk seluruh halaman: detail, `themes`, `peers` ("Satu tahap"), `viewer` (status watchlist dan pengingat). `status: 'ipo'` → layout IPO; `dataDelayed` terisi → banner data tertunda |
| Tombol pengingat | `PUT` / `DELETE /companies/:ticker/alerts/:kind` | `kind` = `listing` ("Ingatkan saat tercatat", hanya emiten IPO) atau `data-update` ("Kabari saat diperbarui"). Status sekarang di `viewer.alerts` |
| Watchlist | `GET /watchlist` | Item + data emiten + tema/tahap utama. `stage` (`baru`/`pel`/`siap`) dihitung dari checklist |
| Tombol watchlist | `POST /watchlist { ticker, note? }`, `DELETE /watchlist/:ticker` | Idempoten: 201 baru, 200 sudah ada |
| Watchlist: catatan & checklist | `PATCH /watchlist/:ticker` | `{ note? , checklist? }`; `checklist` = array tepat 4 boolean |

### 3.3 Belum tersedia di API (client)

Tampilkan state kosong atau sembunyikan dulu:

- Pencarian gabungan ⌘K (`GET /search`) dan riwayat pencarian. Sementara pakai `GET /companies?q=`.
- "Kabari saya" untuk industri "Segera hadir".
- "Perubahan bisnis" di Watchlist (selalu kosong).
- Tesis, Portofolio, Beranda/dashboard, Notifikasi, Bantuan & tiket, Ekspor CSV pengguna.
- Lupa password mandiri (`POST /auth/forgot`), login Google, upload foto profil.
- Unduh laporan keuangan / dokumen IPO: `reports[].url` dan `ipo.documents[].url` selalu `null`.

---

## 4. Admin

### 4.1 Auth (2 langkah + 2FA)

Cookie terpisah dari client: `asid` (sesi) dan `atd` (perangkat tepercaya), keduanya dengan path `/admin/api`. Sesi client tidak berlaku di admin, begitu pula sebaliknya.

1. **AdminLogin** — `POST /admin/api/auth/login { email, password }` (email harus `@stockplan.id`).
   - Perangkat biasa → `{ step: 'two_factor', email }`. Sesi sementara berlaku 5 menit; lanjut ke langkah 2.
   - Perangkat tepercaya → langsung `{ admin }`. Masuk ke shell.
2. **AdminLogin2FA** — `POST /admin/api/auth/verify { code, method: 'totp' | 'backup', trustDevice }` → `{ admin }`.
   `trustDevice: true` = tidak perlu 2FA lagi di browser ini selama 7 hari. Kode cadangan hanya bisa dipakai sekali.
   Kalau dapat 401 `UNAUTHENTICATED` di sini, sesi sementara sudah habis: kembali ke langkah 1.
3. "Ganti akun" / keluar — `POST /admin/api/auth/logout` (idempoten, juga berlaku di langkah 2).

Aturan yang perlu dicerminkan di UI:

- 5 kali gagal (password atau kode) dalam 15 menit → `429 ACCOUNT_LOCKED` selama 15 menit.
- **Sesi berakhir setelah 30 menit tanpa request.** Tangani 401 dari endpoint mana pun dengan kembali ke login.
- Aktivasi undangan: tautan email membuka `/admin/undangan?token=…` (base dari env `ADMIN_URL`, default `APP_URL`). Panggil `POST /admin/api/auth/accept-invite { token, password, name? }` (password min. 10). Respons berisi **secret TOTP + kode cadangan yang hanya tampil sekali**; tampilkan sebagai QR/teks dan minta admin menyimpannya, lalu arahkan ke login biasa. Layar ini belum ada di design.

### 4.2 Izin (RBAC)

Setelah masuk, panggil `GET /admin/api/auth/me` → `{ admin: { id, name, email, role }, perms }`.

`perms` berbentuk `{ modul: [aksi] }`, mis. `{ "em": ["view", "edit"], "tm": ["view"] }`. Pakai untuk menyembunyikan menu dan menonaktifkan tombol. Server tetap menolak dengan `403 FORBIDDEN`, jadi UI cukup mencerminkannya.

| Modul | Nama di UI | Aksi |
| --- | --- | --- |
| `dash` | Dashboard | view |
| `em` | Data emiten | view, edit, publish, delete |
| `tm` | Tema & rantai nilai | view, edit, publish, delete |
| `usr` | Pengguna | view, edit, delete (delete = tangguhkan/pulihkan) |
| `fb` | Masukan & laporan | view, edit, delete |
| `log` | Riwayat perubahan | view, edit (edit = "Kembalikan") |
| `sync` | Sinkron data BEI | view, edit |
| `set` | Pengaturan aplikasi | view, edit, publish |
| `acc` | Akses & peran | view, edit, delete |

Perubahan peran berlaku **langsung** di request berikutnya (bukan "di sesi berikutnya" seperti tertulis di design). Sesuaikan copy di UI, dan muat ulang `auth/me` setelah mengubah peran sendiri atau saat menerima 403.

### 4.3 Pola daftar dan form

- **Daftar** menerima `q`, `tab`, filter lain, `page` (mulai 1), `pageSize` (default 14). Respons: `{ total, page, pageSize, tabs, items, ... }`. `tabs` berisi hitungan per tab yang sudah mengikuti filter lain, jadi badge angka di tab cukup dibaca dari situ.
- **Ekspor CSV**: buka sebagai tautan unduhan biasa (`<a href="/admin/api/companies/export.csv?...">`). Cookie ikut otomatis karena lewat rewrite di origin admin.
- **Draf → terbit** (Emiten dan Tema): `PATCH` menyimpan draf (hanya bagian yang dikirim yang diganti) → `POST …/publish` menerbitkan. Data yang dilihat pengguna baru berubah setelah terbit. Pengecualian Tema: tema berstatus `draft` disembunyikan dari client sampai diterbitkan lagi (`review` tetap terlihat). `GET` detail mengembalikan `form`, kelengkapan per bagian (`sections`/`checks`), dan `canPublish` untuk mengaktifkan tombol "Terbitkan". Kalau terbit ditolak `422 INCOMPLETE`, tampilkan bagian yang belum lengkap.
- **`actions`** di respons detail (Pengguna, Akses) = tombol yang boleh tampil untuk baris itu. Pakai apa adanya.

### 4.4 Peta layar → endpoint

| Layar | Endpoint | Izin | Catatan |
| --- | --- | --- | --- |
| Shell | `GET /admin/api/auth/me` | — | |
| AdminEmiten | `GET /admin/api/companies?q=&tab=&sector=&page=&pageSize=` | `em:view` | Tab: `all`, `review`, `incomplete`, `ready`. Kelengkapan 5 bagian per baris |
| | (respons daftar) `sectors[].subsectors` | `em:view` | `[{ id, name }]` untuk dropdown Sektor → Subsektor di form emiten. Nilai Subsektor yang dikirim ke `PATCH` = `name`. Industri tidak lagi diganti oleh isian ini kecuali namanya sama dengan nama industri |
| | `GET /admin/api/companies/export.csv?tickers=` | `em:view` | Tanpa `tickers` = semua; `tickers=BUMI,PTBA` = yang dipilih |
| | `POST /admin/api/companies/bulk-review { tickers }` | `em:edit` | 1–200 ticker → "Perlu ditinjau" |
| AdminEmitenEdit, AdminEmitenIPO | `GET /admin/api/companies/:ticker` | `em:view` | `themes` hanya baca (dikelola di modul Tema) |
| | `PATCH /admin/api/companies/:ticker` | `em:edit` | Simpan draf |
| | `DELETE /admin/api/companies/:ticker` | `em:delete` | `204`. Menghapus emiten + watchlist/pengingat pengguna terkait. `409 IN_THEME` bila masih ada di tahap tema (keluarkan dulu dari tema). Tidak bisa dikembalikan dari Riwayat |
| | `POST /admin/api/companies/:ticker/publish` | `em:publish` | |
| AdminEmitenIPO (baru) | `POST /admin/api/companies { ticker, name, ... }` | `em:edit` | Dibuat sebagai draf. Ticker tidak bisa diubah setelah dibuat |
| AdminPengguna | `GET /admin/api/users?q=&tab=&plan=&page=&pageSize=` | `usr:view` | `summary` (4 kartu) + `tabs` + baris. Status: `act`, `new`, `idle`, `sus` |
| | `GET /admin/api/users/export.csv?q=&plan=` | `usr:view` | |
| | `POST /admin/api/users/invite { email }` | `usr:edit` | Kirim tautan daftar |
| Panel detail pengguna | `GET /admin/api/users/:id` | `usr:view` | |
| | `POST …/:id/suspend { reason, note? }`, `POST …/:id/restore` | `usr:delete` | `reason` dari daftar alasan di design |
| | `POST …/:id/resend-confirmation`, `POST …/:id/password-reset` | `usr:edit` | |
| AdminTema | `GET /admin/api/themes?q=&tab=&sector=&queue=` | `tm:view` | Tab: `all`, `open`, `map`, `draft`, `review`. Status `map` ("Peta sektor") = baris halaman sektor yang terbit tanpa rantai; `kind` `chain`/`map`, `readiness` null untuk `map`. `sectors[].subsectors` untuk pilihan form. Termasuk antrean "Emiten belum masuk tema mana pun" |
| AdminTema "Petakan" | `POST /admin/api/themes/:slug/companies { ticker, stage? }` | `tm:edit` | Masuk ke draf, porsi kosong |
| AdminTemaBaru | `POST /admin/api/themes { name, sectorSlug, sectorMap: { subsectorId }, ... }` | `tm:edit` | **Sub-sektor wajib** (tema = industri, selalu di satu sub-sektor; 422 `fields['sectorMap.subsectorId']`). Nama ≥ 3 karakter dan unik. Slug dibuat dari nama dan tidak berubah |
| AdminTemaEdit | `GET /admin/api/themes/:slug` | `tm:view` | `form` + `checks` + total porsi + riwayat. Bagian form baru `sectorMap { subsectorId, icon, dataStatus, updateNote }` = baris di halaman sektor; ikon dari kosakata sektor (lihat Swagger), sub-sektor harus milik sektor tema. `theme.kind`/`theme.onSectorMap` |
| | `PATCH /admin/api/themes/:slug` | `tm:edit` | Peran tanpa `tm:publish` → status otomatis "Perlu ditinjau" |
| | `DELETE /admin/api/themes/:slug` | `tm:delete` | `204`. Menghapus tema + tahapnya. Kalau sudah terbit, hilang juga dari halaman sektor dan `/themes/:slug` client. Emiten terpetakan kembali ke antrean. Tidak bisa dikembalikan dari Riwayat |
| | `POST /admin/api/themes/:slug/publish` | `tm:publish` | Semua tahap diganti sekaligus. Tema tanpa tahap yang belum pernah terbit (`kind: map`) terbit hanya ke halaman sektor (syarat: nama, sektor, sub-sektor, ikon); detail `/themes/:slug` tetap 404 |
| Pilih emiten (pool drag & drop) | `GET /admin/api/companies?q=&sector=` | `em:view` | |
| AdminAkses | `GET /admin/api/access/members` | `acc:view` | |
| | `POST /admin/api/access/members/invite { email, role }` | `acc:edit` | Tautan berlaku 72 jam |
| | `PATCH /admin/api/access/members/:id { role }`, `POST …/:id/resend-invite` | `acc:edit` | |
| | `POST …/:id/deactivate`, `POST …/:id/reactivate` | `acc:delete` | Nonaktif = semua sesi dan perangkat tepercaya dihapus |
| AdminAksesPeran | `GET /admin/api/access/roles` | `acc:view` | `modules` = baris matriks, `roles[].perms` = izin efektif |
| | `POST /admin/api/access/roles`, `PUT /admin/api/access/roles/:id` | `acc:edit` | Mencentang aksi apa pun otomatis menambah `view` |
| AdminRiwayat | `GET /admin/api/history?q=&module=&who=&range=&tab=&page=&pageSize=` | `log:view` | Dikelompokkan per hari. Tiap entri: pelaku, kalimat (`verb`/`target`/`rest`), `changes` (sebelum/sesudah), `canRevert` |
| | `GET /admin/api/history/export.csv` | `log:view` | Filter sama, maks. 5.000 baris |
| | `POST /admin/api/history/:id/revert` | `log:edit` + izin modul terkait | `409 CONFLICT` bila data sudah berubah lagi sejak entri itu |
| AdminDashboard | `GET /admin/api/dashboard` | `dash:view` | Satu panggilan: `kpis`, `queue` (jumlah > 0, urut dampak), `sync.jobs`, `coverage`, `activity`. Blok yang peran tidak boleh lihat (`usr`, `sync`, `tm`, `log`, `em`) bernilai `null` / item dibuang: sembunyikan saja. "Sinkron ulang" = `POST /admin/api/sync/run` |
| AdminSinkron | `GET /admin/api/sync` | `sync:view` | `stats`, `jobs` (status `running`/`queued`/`failed`/`ok`/`never`, `summary` sudah jadi teks), `failures`, `conflicts` (`changes` = Di StockPlan vs Dari BEI), `history` 14 hari. Poll selama ada job `running`/`queued` |
| | `POST /admin/api/sync/run { key? }` | `sync:edit` | Masuk antrean crawler, bukan langsung selesai. Tanpa `key` = semua |
| | `POST /admin/api/sync/failures/:id/retry` | `sync:edit` | "Coba lagi". Baris tetap ada (`retrying: true`) sampai crawler melapor berhasil |
| | `POST /admin/api/sync/conflicts/:id/resolve { use: 'bei' \| 'team' }` | `sync:edit` (+ `em:publish` untuk `bei`) | `bei` = setujui: langsung ke data terbit. `team` = tolak. `409 ALREADY_RESOLVED` |
| | `POST /admin/api/sync/conflicts/resolve { use, ids? }` | sama | Setujui/tolak banyak sekaligus; tanpa `ids` = semua kartu terbuka (maks. 500) |

Pengaman di Akses & peran yang perlu tercermin di UI (server menolaknya dengan 403/409): tidak bisa mengubah atau menonaktifkan diri sendiri; hanya super admin yang bisa memberi/mencabut peran super admin; minimal satu super admin aktif; izin super admin tidak bisa diubah; tidak bisa mengubah izin peran yang sedang dipegang sendiri.

### 4.5 Belum tersedia di API (admin)

- Modul Masukan & laporan, Pengaturan aplikasi (modulnya sudah ada di matriks izin, endpoint-nya belum).
- Dashboard: item antrean "Laporan Data salah dari pengguna" dan "Laporan keuangan belum diproses" serta `kpis.review.fromReports` belum ada (menunggu modul Masukan dan data laporan keuangan).
- Sinkron data BEI: endpoint ada, tetapi datanya kosong sampai `stock-plan-crawler` diarahkan ke `/admin/api/sync/agent/*` (lihat Swagger, tag Admin: Sinkron). Sebelum itu semua job berstatus `never`.
- Data BEI (manajemen, pemegang saham, anak usaha, papan + tahun tercatat) **tidak** ditulis otomatis: semua jadi kartu di AdminSinkron dan baru tampil di aplikasi setelah disetujui. `reason` kartu membedakan data baru dan bagian yang pernah diubah tim. UI perlu tombol "Setujui semua" (puluhan kartu per sinkron).
- Upload file: logo emiten, laporan keuangan, prospektus IPO.
- `reportCount` emiten selalu 0. Kolom tesis, evaluasi, dan "tema dibuka" di Pengguna selalu 0/kosong. Angka "dipakai N tesis" di Tema selalu `null`.
- Hapus peran/anggota, reset password admin.
- Lokasi login ("Jakarta"): tidak ada GeoIP.

---

## 5. Lingkungan dev

```bash
npm install && npm run migrate && npx sequelize-cli db:seed:all && npm run dev   # port 3000
```

- **Admin dev**: `admin@stockplan.id` / `StockPlanDev2026` (super admin). Secret TOTP dan kode cadangan dicetak saat seeder admin dijalankan:
  `npx sequelize-cli db:seed --seed 20261111000001-admin-users.js`. Masukkan secret ke aplikasi authenticator.
- **User client**: daftar lewat `POST /auth/register`, lalu ambil tautan konfirmasi dari log server (email belum terkirim). Alternatif: `UPDATE auth_users SET "emailVerified" = true WHERE email = '…';`
- **Data contoh**: 11 sektor; sub-sektor/industri untuk Energi, Barang Baku, Keuangan, Infrastruktur, dan Teknologi (sektor lain "Segera hadir"). Status data campuran: Siap, Baru (Telekomunikasi, dengan banner), Segera hadir. Industri dengan rantai nilai (halaman `/tema/:slug`): `batubara`, `nikel`, `telekomunikasi`. Nama industri dan porsi/sumber di tahap adalah ilustrasi dev, bukan IDX-IC resmi atau data laporan keuangan. Emiten dari board EmitenSearch; detail halaman lengkap hanya **BUMI** (tercatat) dan **ABNU** (IPO fiktif). Seeder tambahan bisa dijalankan sendiri dan aman diulang: `npx sequelize-cli db:seed --seed 20261112000001-themes-industries.js` (batalkan: `db:seed:undo --seed …`).
- **Semua emiten BEI (944)**: seeder `20261112000002-idx-companies.js` dari snapshot crawler `seeders/data/idx-companies.json` (bangun ulang: `node bin/build-idx-companies.js <crawler>/dist/idx/minify/company/detail`). Hanya menambah ticker yang belum ada, sebagai **draf** (tidak tampil di client sampai diterbitkan dari Admin Emiten). Isinya nama, sektor, sub-sektor, papan, tahun tercatat, manajemen, pemegang saham, 30 anak usaha terbesar. Jalankan setelah seeder emiten design supaya 35 emiten contoh tetap terbit.
- Semua tautan email (konfirmasi, atur ulang password, undangan) hanya dicetak ke console server.

## 6. Kontak dan perubahan

- Sumber kebenaran skema: `docs/openapi.js` (disajikan di `/docs`). Kalau respons nyata berbeda dari Swagger, laporkan sebagai bug backend.
- Copy yang belum final ditandai `// COPY: perlu review` di kode backend. Pesan error dari server bisa berubah. Jangan dipakai sebagai kunci logika.
