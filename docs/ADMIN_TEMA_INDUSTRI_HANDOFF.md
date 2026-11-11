# Admin — Penyesuaian "Tema = Industri"

Status per 12 Nov 2026. Untuk tim (dan sesi Claude Code) yang mengerjakan **panel admin** (stockplan-admin). Isinya: apa yang berubah di backend pada modul Tema, kontrak API terbarunya, dan apa yang harus diubah di admin.

Dokumen ini mencakup dua perubahan backend sekaligus, karena admin belum menyesuaikan yang pertama:

1. Baris "industri" di halaman sektor client (TemaSektor) sekarang diatur lewat form Tema (bagian **Peta sektor**).
2. Tabel tema digabung ke tabel industri. **Satu tema = satu industri**, dan setiap tema wajib berada di satu sub-sektor.

Kontrak umum (auth, error, izin) tetap mengikuti [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) §4. Skema lengkap ada di Swagger backend (`/docs`).

---

## 1. Apa yang tidak berubah

- Path API: `/admin/api/themes`, `/admin/api/themes/:slug`, `…/companies`, `…/publish`, `/admin/api/history`.
- Izin: modul `tm` (`view`, `edit`, `publish`).
- Alur draf → terbit, bentuk `form` lama (`name`, `sectorSlug`, `description`, `drivers`, `groups`, `stages`), `checks`, `canPublish`, `summary`, antrean `unmapped`.
- Kalimat riwayat ("memperbarui peta sektor", "menerbitkan ke peta sektor") dan label perubahan ("Peta sektor › icon") sudah dirender server.

## 2. Konsep baru

Setiap tema adalah industri di sebuah sub-sektor (hierarki IDX-IC: sektor → sub-sektor → industri). Setelah diterbitkan, tema selalu muncul sebagai baris di halaman sektor client. Ada dua jenis:

| `kind` | Arti | Saat diterbitkan |
| --- | --- | --- |
| `chain` | Rantai nilai: punya tahap, atau pernah terbit sebagai rantai | Baris di halaman sektor + halaman detail `/tema/:slug` di client |
| `map` | Baris peta sektor saja: belum pernah terbit sebagai rantai dan 0 tahap (contoh: "Minyak & Gas — Segera hadir") | Hanya baris di halaman sektor. Detail `/tema/:slug` tetap 404 |

Tema `map` berubah menjadi `chain` setelah admin menambah tahap lalu menerbitkannya.

Tema yang **belum pernah diterbitkan** tidak terlihat di client sama sekali, walaupun sub-sektornya sudah dipilih.

Tema berstatus `draft` (Simpan draf / Petakan / Kembalikan oleh peran yang punya izin terbit) **disembunyikan dari client** sampai diterbitkan lagi: hilang dari halaman sektor, kartu tema, `/themes/:slug` (404), tema terkait emiten, pencarian, dan watchlist. Status `review` (disimpan Editor tema tanpa izin terbit) tetap terlihat dengan versi terbitnya. Di UI admin, beri peringatan sebelum menyimpan draf tema yang sedang terbit, misalnya "Tema akan disembunyikan dari pengguna sampai diterbitkan lagi." (`// COPY: perlu review`).

## 3. Kontrak API terbaru

### 3.1 `GET /admin/api/themes` (AdminTema)

| Field | Perubahan |
| --- | --- |
| `items[].status` | Tambah `map`. Nilai: `open` (Terbuka), `map` (Peta sektor), `draft` (Draf), `review` (Perlu ditinjau) |
| `items[].kind` | **Baru**: `chain` \| `map` |
| `items[].dataStatus` | **Baru**: `{ key: 'soon' \| 'ok' \| 'new', label: 'Segera hadir' \| 'Siap' \| 'Baru', updatedAt }`. Status data seperti yang dilihat pengguna di halaman sektor, dari versi **terbit** (bukan draf). Tampilkan sebagai kolom/badge "Status data" di tabel, terpisah dari `status`/`statusLabel` (alur terbit) |
| `items[].readiness` | **Bisa `null`** (untuk `kind: map`). Dulu selalu objek |
| `tabs` | Tambah key `map`. Selalu berlaku open + map + draft + review = all |
| `?tab=` | Tambah nilai `map` |
| `sectors` | Sekarang `[{ slug, name, subsectors: [{ id, name }] }]` |
| `summary` | Bentuk tetap. `open` dan `draft` tidak menghitung baris `map` |
| `unmapped.items[].suggestion` | Usulan hanya ke tema yang punya tahap. `via: 'industri'` = emiten diklasifikasikan ke industri itu |

Urutan `items` dari server: open, map, review, draft (lalu terbaru diubah).

### 3.2 `GET /admin/api/themes/:slug` (AdminTemaEdit), juga respons POST/PATCH/publish

| Field | Perubahan |
| --- | --- |
| `theme.kind` | **Baru**: `chain` \| `map` |
| `theme.onSectorMap` | **Baru**: versi terbitnya tampil di halaman sektor client |
| `theme.statusLabel` | Tambah "Terbit di peta sektor" (status `published` tapi belum terbit sebagai rantai) |
| `sectors` | **Baru**: pilihan sektor + sub-sektor, sama dengan di daftar |
| `form.sectorMap` | **Baru**, lihat §3.3 |
| `readiness` | **Bisa `null`** (untuk `kind: map`) |
| `checks` | Jumlah berubah, lihat §3.4 |

### 3.3 Bagian form `sectorMap`

```json
"sectorMap": {
  "subsectorId": "5bb346ea-bcbf-42bc-b79d-86411bdc9047",
  "icon": "flame",
  "dataStatus": "ready",
  "updateNote": "diperbarui dari laporan keuangan Q3 2026"
}
```

| Field | Aturan |
| --- | --- |
| `subsectorId` | UUID dari `sectors[].subsectors[].id`, harus milik `sectorSlug` yang dipilih. **Wajib saat membuat tema** |
| `icon` | `''` atau salah satu: `bolt cube factory basket bag plus bank building chip tower truck flame droplet wrench sun leaf`. Ini kosakata ikon **sektor**, berbeda dari ikon tahap utama (`mine`, `truck`, `bolt`, …) |
| `dataStatus` | `soon` = "Segera hadir", `ready` = Siap (atau "Baru" ≤ 7 hari, dihitung server) |
| `updateNote` | Maks. 200 karakter. Tampil di banner "Data baru" client |

- Dikirim lewat `PATCH` sebagai satu bagian utuh, sama seperti bagian lain.
- Tanggal "data diperbarui" dicap otomatis oleh server saat terbit, kalau `dataStatus` berubah menjadi `ready` atau `updateNote` berubah. Tidak ada field tanggal di form.
- Status industri di client mengikuti `dataStatus` saja: `soon` tetap "Segera hadir" walaupun rantainya sudah terbit. Admin harus memilih Siap supaya tampil "Siap"/"Baru".

### 3.4 Syarat terbit (`checks`)

| `kind` | Isi `checks` (urut) |
| --- | --- |
| `chain` | `identity` "Identitas & tahap utama lengkap", `stages`, `shares`, `totals`, `readiness`, **`sectorMap` "Peta sektor lengkap"** (6 item; dulu 5) |
| `map` | `identity` "Nama & sektor terisi", `sectorMap` "Peta sektor lengkap" (2 item) |

`sectorMap` lolos bila sub-sektor dan ikon terisi. `note`-nya "Pilih sub-sektor" atau "Pilih ikon". Render `checks` apa adanya dari server; jangan menganggap jumlahnya tetap.

### 3.5 Membuat tema: `POST /admin/api/themes`

Body minimal sekarang:

```json
{ "name": "Panas bumi", "sectorSlug": "energi", "sectorMap": { "subsectorId": "dd3bdc7c-63bb-4840-bd31-c29566f1ce7a" } }
```

Tanpa sub-sektor → `422` dengan `fields['sectorMap.subsectorId'] = "Pilih sub-sektor."`. **Tambah cepat dari AdminTema dengan nama + sektor saja tidak lagi diterima.**

### 3.6 Error baru

| Status | `code` | `fields` | Kapan |
| --- | --- | --- | --- |
| 422 | `VALIDATION` | `sectorMap.subsectorId` | Sub-sektor kosong saat membuat, bukan UUID, atau bukan milik sektor terpilih ("Sub-sektor tidak ada di sektor ini.") |
| 422 | `VALIDATION` | `sectorMap.icon`, `sectorMap.dataStatus` | Nilai di luar daftar |
| 422 | `INCOMPLETE` | `sectorMap` | Terbit tanpa sub-sektor / ikon |

Key `fields` memakai titik (`sectorMap.icon`). Petakan ke input yang sesuai.

## 4. Yang harus diubah di admin

1. **Tipe dan mapper API tema**: `kind`, status `map`, `readiness` nullable, tab `map`, `sectors[].subsectors`, `theme.kind`, `theme.onSectorMap`, `form.sectorMap`. Pastikan tidak ada yang crash saat `readiness` null atau status `map` (lookup label/warna status, sort, progress bar).
2. **AdminTema (daftar)**:
   - Tab "Peta sektor" dengan hitungan `tabs.map`.
   - Baris `map`: badge dari `statusLabel`; kolom kesiapan diganti "—".
   - Kartu ringkasan tetap dari `summary`.
3. **Tambah tema (AdminTema quick add dan AdminTemaBaru)**: tambah pilihan sub-sektor (dari `sectors` sesuai sektor terpilih) dan kirim `sectorMap.subsectorId`. Tampilkan error `fields['sectorMap.subsectorId']`.
4. **AdminTemaEdit**: tambah bagian **Peta sektor**:
   - Sub-sektor (dropdown dari `sectors` sesuai `sectorSlug`). Kalau sektor diganti, kosongkan sub-sektor yang bukan milik sektor baru.
   - Ikon (kosakata ikon sektor). Pakai komponen ikon sektor yang sudah ada di admin atau client; jangan menggambar ikon baru.
   - Status data (Segera hadir / Siap).
   - Catatan pembaruan (maks. 200).
5. **Tema `kind: map`**: panel "Siap diterbitkan?" merender `checks` dari server (2 item). Sembunyikan bagian yang membutuhkan `readiness` non-null (kesiapan emiten, multi-tahap). Bagian tahap tetap bisa diisi.
6. **Copy** yang tidak ada di design (label "Peta sektor", tab, teks bantu, opsi dropdown) diberi tanda `// COPY: perlu review`. Label dari server (`statusLabel`, `checks[].label`, `checks[].note`) dipakai apa adanya.
7. **ADMIN_HANDOFF.md §4** (aksi admin → efek di client), tambahkan:
   - Tema: Terbitkan (kind `map`) → muncul sebagai baris di `GET /sectors/:slug`; `/themes/:slug` tetap 404.
   - Tema: Terbitkan (kind `chain`) → baris di halaman sektor dengan tombol "Lihat" + halaman detail tema.
8. Salin [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) terbaru dari backend ke repo admin.

## 5. Efek samping di Data emiten

Isian **Sub-sektor** di AdminEmitenEdit dicocokkan ke nama industri (tidak peka huruf besar). Karena tema sekarang adalah industri, mengetik nama tema (mis. "Batu bara") mengaitkan emiten ke industri itu, dan emiten tersebut ikut terhitung di "[n] emiten" pada baris tema di halaman sektor client. Tidak ada perubahan UI yang dibutuhkan; cukup diketahui.

## 6. Data dev saat ini

- Hanya ada satu tema: `batu-bara` (rantai, 3 tahap, terbit) di Energi › Minyak, Gas & Batu Bara.
- **`batu-bara` belum punya ikon** (`sectorMap.icon` kosong) dan `dataStatus` masih `soon`. Akibatnya cek "Peta sektor lengkap" gagal; tema ini baru bisa diterbitkan ulang setelah ikon diisi. Client sementara memakai ikon sektor.
- Sub-sektor hanya ada di Energi: "Minyak, Gas & Batu Bara" dan "Energi Alternatif". Sektor lain belum bisa diisi tema.

## 7. Cara menguji

Dengan backend jalan (ADMIN_HANDOFF §2):

1. Buka AdminTema: 1 baris `batu-bara` (Terbuka, `chain`). Tab Peta sektor = 0.
2. Buka `batu-bara`: bagian Peta sektor terisi sub-sektor, ikon kosong; cek "Peta sektor lengkap" merah.
3. Buat tema uji tanpa sub-sektor → error "Pilih sub-sektor.". Ulangi dengan sub-sektor Energi Alternatif → berhasil, belum terlihat di client.
4. Isi ikon `sun`, status Segera hadir, terbitkan → status "Terbit di peta sektor", tab Peta sektor = 1. Di backend, `GET /sectors/energi` memuat barisnya; `GET /themes/<slug>` = 404.
5. Ubah ikon, lalu Kembalikan dari Riwayat → ikon draf kembali.
6. Hapus tema uji lewat SQL di DB dev, termasuk baris `admin_audit_logs` dengan target `theme:<slug>`. Belum ada tombol hapus tema.

## 8. Di luar cakupan

- Mengatur urutan baris di sub-sektor (backend menaruh baris baru paling bawah).
- Membuat sub-sektor baru, mengisi sektor selain Energi.
- Menghapus tema.
- Memakai `perms` untuk menyembunyikan tombol.
