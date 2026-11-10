# StockPlan App — Handoff untuk Claude Code

Paket ini berisi semua yang dibutuhkan untuk membangun aplikasi StockPlan (customer + admin) dari design. Bacalah dokumen ini dari atas ke bawah sebelum menulis kode. Kerjakan per fase di §11, dan cek "Selesai kalau" di akhir setiap fase.

Versi design: canvas StockPlan per 10 Nov 2026, 84 board (82 layar app + 2 landing). Landing page sudah punya brief sendiri (`stockplan-landing-handoff.zip` / `IMPLEMENTATION.md`); di paket ini landing hanya disertakan sebagai referensi.

---

## 0. Cara memakai paket ini

### 0.1 Mulai dari sini

1. Ekstrak paket ini ke repo, mis. `docs/design-handoff/`.
2. Tempel isi `CLAUDE-snippet.md` ke `CLAUDE.md` di root repo supaya aturannya selalu terbaca.
3. Beri Claude Code perintah: *"Baca docs/design-handoff/HANDOFF.md, lalu kerjakan Fase 1 di §11. Bandingkan hasilnya dengan screenshot sebelum lanjut."*

### 0.2 Isi paket

```
HANDOFF.md                  ← dokumen ini (sumber keputusan)
CLAUDE-snippet.md           ← aturan singkat untuk ditempel ke CLAUDE.md repo
design/
  screens/<Board>.dc.html   ← source tiap board: struktur, copy, CSS, logika state, data contoh
  screenshots/<Board>.jpg   ← render 1440px (landing mobile 390px) untuk acuan visual
  screens.json              ← indeks: board → judul, ukuran, route, file target, state
tokens/tokens.css           ← CSS variables (format shadcn) + skeleton + reduced motion
spec/types.ts               ← model data & enum yang diturunkan dari design
fixtures/*.json             ← data contoh yang konsisten antar layar (dipakai untuk seed/dev)
assets/logos/               ← logo StockPlan (full + mark) dan logo emiten
```

### 0.3 Urutan prioritas kalau ada yang bertentangan

1. **HANDOFF.md** — keputusan final (termasuk standardisasi yang mengoreksi design).
2. **design/screens/*.dc.html** — copy persis, spacing, warna, perilaku state.
3. **design/screenshots/*.jpg** — tampilan akhir yang diharapkan.

Jangan mengarang copy. Kalau teks tidak ada di file design, tulis dengan gaya yang sama (§1.3) dan tandai dengan komentar `// COPY: perlu review`.

### 0.4 Cara membaca file `.dc.html`

File design dibuat dalam format "Design Component", bukan kode produksi. Ambil isinya, tulis ulang sebagai komponen React. Jangan menyalin runtime-nya.

| Yang Anda lihat | Artinya | Yang dilakukan |
| --- | --- | --- |
| `<x-dc>`, `<helmet>`, `<script src="./support.js">` | Pembungkus runtime canvas | Abaikan |
| `<style>` di dalam `<helmet>` | CSS board ini | Terjemahkan ke Tailwind + token. Nilai px boleh dipakai apa adanya |
| `style="…"` inline | Styling elemen | Sama: terjemahkan ke kelas Tailwind |
| `{{nama}}` | Nilai dinamis dari `renderVals()` di `<script type="text/x-dc">` | Baca fungsi itu untuk tahu cara nilainya dihitung |
| `<sc-for list="{{items}}" as="x">` | Loop | `items.map(x => …)` |
| `<sc-if value="{{cond}}">` | Render bersyarat | `{cond && …}` |
| `class Component extends DCLogic { constructor… this.state = {…} }` | State lokal + data contoh | State → React state/URL; data contoh → `fixtures/` atau API |
| `href="Xxx.dc.html"` | Link antar board | Ganti dengan route dari §5 |
| `/_blob/<id>` | Gambar yang diunggah ke canvas | Logo emiten → `assets/logos/emiten/` (peta di §0.5); lainnya pakai placeholder |
| Beberapa board dengan nama mirip (`TesisBuat`…`TesisBuat5`) | Satu halaman, state berbeda | Satu komponen, bukan lima halaman |

### 0.5 Logo emiten

| Blob di design | File |
| --- | --- |
| `/_blob/a7814f85…` | `assets/logos/emiten/logo-ptba.svg` |
| `/_blob/fee48679…` | `assets/logos/emiten/logo-aadi.svg` |
| `/_blob/f5a05927…` | `assets/logos/emiten/logo-untr.svg` |
| `/_blob/cd089486…` | `assets/logos/emiten/logo-itmg.svg` |
| `/_blob/8feb1117…` | `assets/logos/emiten/logo-indy.svg` |
| `/_blob/d05174a2…` | `assets/logos/emiten/logo-bumi.png` |

Emiten tanpa logo memakai avatar bulat berisi 2 huruf pertama kode, dengan warna `--sp-cat-1…6` yang dipilih dari hash kode (warnanya stabil per emiten). Logo emiten bersumber dari TradingView; ganti dengan aset berlisensi jelas sebelum rilis publik.

---

## 1. Produk dan aturan yang tidak boleh dilanggar

StockPlan adalah aplikasi perencanaan investasi saham Indonesia untuk investor pemula jangka panjang. Pengguna memahami bisnis lewat **tema & rantai nilai**, menulis **tesis** (alasan memegang saham, batas gugur, jadwal evaluasi), mencatat **portofolio** yang terhubung ke tesis, dan menyimpan kandidat di **watchlist**.

### 1.1 Larangan produk

- Tidak ada tombol beli/jual, order, integrasi broker, atau eksekusi transaksi. "Catat transaksi" hanya mencatat.
- Tidak ada harga realtime, grafik intraday, atau ticker berjalan. Data harga yang boleh dipakai hanya **harga penutupan harian BEI** (untuk bobot aktual di Beranda).
- Tidak ada prediksi harga, target harga, skor beli, atau rekomendasi. Hindari kata "beli sekarang", "potensi naik", "rekomendasi".
- Setiap data pasar diberi label sumber dan tanggal: `Data BEI per 3 Nov 2026`, `Sumber: Keterbukaan informasi · BEI`.
- Halaman yang menyentuh keputusan (evaluasi, portofolio, IPO) menyertakan catatan "bukan rekomendasi" seperti di design.

### 1.2 Model bisnis

Selama beta semua fitur terbuka dan gratis. Setelah rilis hanya ada paket berbayar (tanpa versi gratis, tanpa iklan): **Rp79.000/bulan** atau **Rp790.000/tahun** ("Hemat 2 bulan"). Tidak ada penagihan otomatis; pengguna diberi tahu minimal 14 hari sebelumnya. Checkout belum didesain (§12).

### 1.3 Gaya copy

- Bahasa Indonesia, sapaan "Anda", kalimat pendek dan konkret.
- Huruf kapital hanya di awal kalimat dan nama diri ("Tema bisnis", bukan "Tema Bisnis").
- Angka: titik ribuan, koma desimal (`Rp8.570.000`, `0,15%`). Format pendek: `Rp12,4 T`, `Rp8,6 jt`.
- Tanggal: `3 Nov 2026`, bulan disingkat `Jan Feb Mar Apr Mei Jun Jul Ags Sep Okt Nov Des`.
- Nama orang nyata di data contoh diganti placeholder `[Nama …]`. Jangan isi dengan nama karangan.

---

## 2. Stack dan struktur

Ikuti stack yang sama dengan brief landing page supaya satu repo:

- **Next.js App Router + TypeScript**, **Tailwind CSS**, **shadcn/ui**.
- Font **Geist** dan **Geist Mono** lewat `next/font/google`. Geist Mono dipakai untuk kode emiten, angka di badge, dan kode tiket.
- Ikon: satu set saja di seluruh repo. Design memakai ikon garis 24px dengan stroke 1.8; pakai set yang sudah dipakai landing (Heroicons outline) kecuali repo sudah memakai lucide-react.
- Form: react-hook-form + zod. Pesan validasi diambil persis dari design.
- Backend: Express REST API (lanjutkan yang dibuat untuk landing). Kalau belum ada database, pakai PostgreSQL + Prisma. Endpoint di §9.
- State server: TanStack Query (atau Server Components + Server Actions bila repo sudah begitu). State UI yang perlu bisa dibagikan (tab, dialog, langkah wizard, filter) disimpan di URL search params, sesuai kolom Route di §5.

Struktur yang disarankan:

```
app/
  (public)/            landing, syarat-layanan, kebijakan-privasi, pusat-bantuan, pemeliharaan
  (auth)/              masuk, daftar, lupa-password, konfirmasi-email
  (app)/               layout.tsx (shell) + beranda, tema, emiten, tesis, portofolio, watchlist, akun
  admin/(auth)/        masuk
  admin/(panel)/       layout.tsx (shell admin) + modul admin
components/
  ui/                  shadcn
  app/                 app-sidebar, app-header, search-command, notification-bell, notification-panel,
                       account-menu, offline-banner, session-expired-dialog, empty-state, page-skeleton
  tema/ emiten/ tesis/ portofolio/ watchlist/ akun/ admin/
lib/
  format.ts            rupiah, angka pendek, tanggal Indonesia
  thesis.ts            suggestVerdict(), evalTier()
  portfolio.ts         modal, alokasi, drift
  watchlist.ts         stageOf()
  permissions.ts       can(role, module, action)
```

---

## 3. Token dan komponen dasar

Salin `tokens/tokens.css` ke `app/globals.css` dan petakan ke tema shadcn. Ringkasan:

| Peran | Nilai |
| --- | --- |
| Teks utama / tombol hitam / avatar | `#1C1917` |
| Teks keterangan | `#716A65` (bukan `#A8A29E`, yang hanya untuk dekoratif/disabled) |
| Border | `#E7E5E4`; input `#D6D3D1`; pemisah dalam kartu `#F0EEEC` |
| Latar | putih; sidebar & hover `#FAFAF9`; chip netral `#F5F5F4` |
| Aksen (tombol utama) | `#FEA722`, hover `#F59E0B`, teks di atasnya `#1C1917` |
| Tag amber | teks `#92400E` di `#FFF4E2`, border `#FCDDA8` |
| Sukses / bahaya / info | `#15803D`/`#F0FDF4` · `#B91C1C`/`#FEF2F2` (solid `#DC2626`) · `#1D4ED8`/`#EFF6FF` |
| Tahap Hulu / Tengah / Hilir | amber / biru / hijau (lihat `--sp-stage-*`) |

### 3.1 Standardisasi (mengoreksi design)

Design memakai beberapa nilai yang tidak seragam. Pakai nilai ini di semua layar:

| Elemen | Nilai final | Catatan |
| --- | --- | --- |
| Tombol | tinggi 40px (kecil 34px), radius **8px**, 14px/600, padding x 16px | Design campur 8px dan 9px |
| Input | tinggi **44px**, radius 8px, 15px, border `--input`, fokus border `#1C1917` + ring `rgba(28,25,23,.1)` 3px | Design campur 42px dan 44px; 44px juga memenuhi target sentuh |
| Kartu | radius 12px, border, padding 20px, bayangan `--sp-shadow-card` | |
| Popover / dropdown | radius 12px, `--sp-shadow-popover`, offset 8px dari pemicu | |
| Dialog | radius 16px, lebar 480–560px | |
| Chip status | 12px/600, radius 6px, tinggi 20px, border 1px | |
| Badge hitungan | pill, Geist Mono 10.5–11.5px/700 | |

### 3.2 Pemetaan komponen shadcn

`button` (varian: default=amber, secondary=hitam, outline, ghost, destructive, destructive-outline), `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `tabs`, `dialog`, `alert-dialog`, `popover`, `command` (cari ⌘K), `dropdown-menu`, `sheet` (drawer mobile), `badge`, `card`, `table`, `tooltip` (penjelasan istilah), `skeleton`, `sonner` (toast), `progress`, `separator`, `avatar`.

Komponen buatan sendiri yang dipakai berulang:

- `EmitenAvatar` — logo atau inisial berwarna; ukuran 28/32/40.
- `StageTag` — tag Hulu/Tengah/Hilir.
- `StatusChip` — `ok` "Sesuai tesis", `review` "Perlu ditinjau", dll.
- `SourceNote` — baris kecil "Sumber: … · BEI" dengan ikon info.
- `EmptyState` — ikon, satu kalimat, satu tombol utama.
- `PageSkeleton` — skeleton per halaman, bentuknya sama dengan kontennya.

---

## 4. Shell aplikasi customer

Lihat `Layout`, `LayoutCari`, `LayoutProfil`, `LayoutNotif`.

- **Sidebar 240px**, latar `#FAFAF9`, border kanan. Atas: logo mark + "StockPlan" + tag "Beta". Menu: **Beranda** · bagian **RISET**: Tema bisnis, Emiten · bagian **PERENCANAAN**: Tesis saya, Portofolio, Watchlist. Bawah: kartu "Akses beta tester" + Pengaturan. Item aktif: latar putih, border, 600, `aria-current="page"`.
- **Header** (tinggi 64px, padding 12px 28px, border bawah): breadcrumb kiri · kanan: tombol cari (min 260px, label "Cari tema atau emiten…", hint `⌘K`) · lonceng notifikasi · avatar (lingkaran hitam, huruf amber).
- Hanya satu popover terbuka dalam satu waktu. Klik di luar atau `Esc` menutup dan mengembalikan fokus ke pemicu.

### 4.1 Cari (⌘K / Ctrl+K)

Popover `command`: riwayat pencarian terakhir (bisa dihapus per item / "Hapus riwayat") dan saran saat kosong; saat mengetik, hasil dibagi **Emiten** dan **Tema**. `↑/↓` pindah, `Enter` buka, "Lihat semua hasil" → `/emiten?q=`.

### 4.2 Notifikasi

- Lonceng 40×40 bulat dengan badge merah `#DC2626` (border 2px putih) berisi jumlah belum dibaca; `>9` tampil `9+`; 0 → badge hilang. `aria-label="Notifikasi, 5 belum dibaca"`.
- Panel 404px: judul + chip "N baru" + "Tandai semua dibaca" · tab **Semua (n)** / **Belum dibaca (n)** · grup **Hari ini** / **Minggu ini** (lebih lama: "Lebih lama") · daftar maks tinggi 468px dengan scroll · footer "Disimpan 30 hari" + "Atur notifikasi" → `/akun/pengaturan#notifikasi`.
- Item: ikon jenis berwarna 34px, judul (600 kalau belum dibaca), satu kalimat, waktu. Belum dibaca: latar `#FFFBF3` + titik amber di kanan yang bisa diklik ("Tandai dibaca", tidak menavigasi). Klik item = tandai dibaca + buka `href`.
- Tab Belum dibaca kosong → "Semua notifikasi sudah dibaca" + tombol "Lihat semua notifikasi".
- Jenis & warna ikon: `thesis_eval` amber, `ticket_reply` hijau, `report_published` biru, `data_delayed` merah, `ipo` netral, `theme_update` amber tua, `feature` netral. Data contoh: `fixtures/notifications.json`.
- Optimistic update untuk tandai dibaca; badge di semua tab browser sinkron lewat refetch saat fokus.

### 4.3 Menu akun

Nama, email, kartu "Akses beta", link Profil saya / Langganan / Pengaturan / Bantuan & masukan, lalu **Keluar**.

---

## 5. Peta layar → route

Kolom **Board** = nama file di `design/screens/` dan `design/screenshots/`. Board dengan route sama adalah state berbeda dari satu halaman.

| Board | Judul di canvas | Route | File target | State / catatan |
| --- | --- | --- | --- | --- |
| `Login` | 00.a · Masuk | `/masuk` | `app/(auth)/masuk/page.tsx` | Form email+password, Google, error, link konfirmasi belum diklik |
| `Register` | 00.b · Daftar | `/daftar` | `app/(auth)/daftar/page.tsx` | Form daftar + Google, validasi |
| `LupaPassword` | 00.c · Lupa password | `/lupa-password` | `app/(auth)/lupa-password/page.tsx` | 2 state: form email -> "Cek email Anda" |
| `KonfirmasiEmail` | 00.d · Konfirmasi email | `/konfirmasi-email` | `app/(auth)/konfirmasi-email/page.tsx` | Kirim ulang link, ganti email |
| `SyaratLayanan` | 00.e · Syarat layanan | `/syarat-layanan` | `app/(public)/syarat-layanan/page.tsx` | Dokumen 12 bagian + daftar isi lengket |
| `KebijakanPrivasi` | 00.f · Kebijakan privasi | `/kebijakan-privasi` | `app/(public)/kebijakan-privasi/page.tsx` | Dokumen 11 bagian + daftar isi lengket |
| `BantuanPublik` | 00.g · Bantuan (tanpa login) | `/pusat-bantuan` | `app/(public)/pusat-bantuan/page.tsx` | FAQ + form kontak tanpa login |
| `Layout` | 01.a · Layout dasar (sidebar + navbar) | `(layout)` | `app/(app)/layout.tsx` | Sidebar + header; semua popover tertutup |
| `LayoutCari` | 02.b · Navbar: cari emiten aktif | `(layout)` | `components/app/search-command.tsx` | Popover cari ⌘K terbuka |
| `LayoutProfil` | 03.c · Navbar: menu profil aktif | `(layout)` | `components/app/account-menu.tsx` | Menu akun terbuka |
| `LayoutNotif` | 04.d · Navbar: notifikasi terbuka | `(layout)` | `components/app/notification-panel.tsx` | Panel notifikasi terbuka |
| `Profil` | 04.a · Akun: Profil saya | `/akun/profil` | `app/(app)/akun/profil/page.tsx` | Foto, nama, ubah password, sesi perangkat |
| `Langganan` | 04.b · Akun: Langganan | `/akun/langganan` | `app/(app)/akun/langganan/page.tsx` | Akses beta + paket setelah rilis (info saja) |
| `Pengaturan` | 04.c · Akun: Pengaturan | `/akun/pengaturan` | `app/(app)/akun/pengaturan/page.tsx` | Email, tampilan, default portofolio/tesis, data, hapus akun |
| `Bantuan` | 04.d · Akun: Bantuan & masukan | `/akun/bantuan` | `app/(app)/akun/bantuan/page.tsx` | FAQ + form masukan |
| `BantuanTiket` | 04.e · Akun: Masukan saya | `/akun/bantuan/masukan` | `app/(app)/akun/bantuan/masukan/page.tsx` | Daftar masukan saya + thread |
| `Main` | 01 · Beranda | `/beranda` | `app/(app)/beranda/page.tsx` | Perlu tindakan, perubahan bisnis, IPO mendatang, kesehatan tesis, alokasi |
| `Tema` | 02 · Tema bisnis: peta sektor | `/tema` | `app/(app)/tema/page.tsx` | Peta sektor |
| `TemaLoading` | 02c · Tema bisnis (loading state) | `/tema` | `app/(app)/tema/loading.tsx` | Skeleton |
| `TemaSektor` | 02b · Sektor Energi: daftar industri | `/tema/sektor/[sektor]` | `app/(app)/tema/sektor/[sektor]/page.tsx` | Daftar industri dalam sektor |
| `TemaSektorLoading` | 02d · Sektor Energi (loading state) | `/tema/sektor/[sektor]` | `app/(app)/tema/sektor/[sektor]/loading.tsx` | Skeleton |
| `TemaDetail` | 03.a · Tema Batubara: rantai nilai | `/tema/[slug]` | `app/(app)/tema/[slug]/page.tsx` | Tab "Rantai nilai" (default) + panel detail emiten |
| `TemaDetailLoading` | 03.c · Tema Batubara (loading state) | `/tema/[slug]` | `app/(app)/tema/[slug]/loading.tsx` | Skeleton |
| `TemaDetailTabel` | 03.b · Tema Batubara: tabel | `/tema/[slug]?tampilan=tabel` | `app/(app)/tema/[slug]/page.tsx` | Tab "Tabel" |
| `Emiten` | 04 · Emiten: BUMI | `/emiten/[kode]` | `app/(app)/emiten/[kode]/page.tsx` | Detail emiten tercatat (contoh BUMI) |
| `EmitenKosong` | 04c · Emiten (empty state) | `/emiten` | `app/(app)/emiten/page.tsx` | Belum ada pencarian |
| `EmitenSearch` | 04d · Emiten (hasil pencarian) | `/emiten?q=` | `app/(app)/emiten/page.tsx` | Hasil pencarian + filter sektor |
| `EmitenSearchKosong` | 04e · Emiten (pencarian tidak ditemukan) | `/emiten?q=` | `app/(app)/emiten/page.tsx` | Tidak ditemukan |
| `EmitenSearchLoading` | 04f · Emiten (pencarian — loading) | `/emiten?q=` | `app/(app)/emiten/loading.tsx` | Skeleton |
| `EmitenLoading` | 04b · Emiten (loading state) | `/emiten/[kode]` | `app/(app)/emiten/[kode]/loading.tsx` | Skeleton |
| `EmitenIPO` | 04g · Emiten masa IPO (ABNU) | `/emiten/[kode]` | `app/(app)/emiten/[kode]/page.tsx` | Varian saat status = ipo (contoh ABNU) |
| `EmitenIPOLoading` | 04h · Emiten masa IPO (loading state) | `/emiten/[kode]` | `app/(app)/emiten/[kode]/loading.tsx` | Skeleton varian IPO |
| `Tesis` | 05 · Tesis saya | `/tesis` | `app/(app)/tesis/page.tsx` | Master-detail: daftar tesis + detail, edit, arsip, draf |
| `TesisKosong` | 05c · Tesis (empty state) | `/tesis` | `app/(app)/tesis/page.tsx` | Empty |
| `TesisLoading` | 05b · Tesis (loading state) | `/tesis` | `app/(app)/tesis/loading.tsx` | Skeleton |
| `TesisBuat` | 05d · Tulis tesis — 1. Pernyataan | `/tesis/baru?langkah=1` | `app/(app)/tesis/baru/page.tsx` | Langkah 1 Pernyataan + pilih tema |
| `TesisBuat2` | 05e · Tulis tesis — 2. Alasan | `/tesis/baru?langkah=2` | `app/(app)/tesis/baru/page.tsx` | Langkah 2 Alasan |
| `TesisBuat3` | 05f · Tulis tesis — 3. Batas gugur | `/tesis/baru?langkah=3` | `app/(app)/tesis/baru/page.tsx` | Langkah 3 Batas gugur |
| `TesisBuat4` | 05g · Tulis tesis — 4. Emiten | `/tesis/baru?langkah=4` | `app/(app)/tesis/baru/page.tsx` | Langkah 4 Emiten + bobot |
| `TesisBuat5` | 05h · Tulis tesis — 5. Jangka & evaluasi | `/tesis/baru?langkah=5` | `app/(app)/tesis/baru/page.tsx` | Langkah 5 Jangka & jadwal evaluasi |
| `TesisBuatSelesai` | 05i · Tulis tesis — tersimpan | `/tesis/baru` | `app/(app)/tesis/baru/page.tsx` | State tersimpan |
| `TesisEvaluasi` | 05j · Evaluasi tesis — mulai | `/tesis/[id]/evaluasi` | `app/(app)/tesis/[id]/evaluasi/page.tsx` | Kosong, siap diisi |
| `TesisEvaluasi2` | 05k · Evaluasi tesis — terisi | `/tesis/[id]/evaluasi` | `app/(app)/tesis/[id]/evaluasi/page.tsx` | Terisi |
| `TesisEvaluasiSelesai` | 05l · Evaluasi tesis — tersimpan | `/tesis/[id]/evaluasi` | `app/(app)/tesis/[id]/evaluasi/page.tsx` | Tersimpan |
| `Portofolio` | 06.a · Portofolio | `/portofolio` | `app/(app)/portofolio/page.tsx` | Emiten per tesis, komposisi dana, riwayat keputusan |
| `PortofolioTambah` | 06.b · Tambah emiten | `/portofolio?dialog=tambah` | `app/(app)/portofolio/page.tsx` | Dialog tambah emiten |
| `PortofolioCatat` | 06.c · Catat transaksi | `/portofolio?dialog=catat` | `app/(app)/portofolio/page.tsx` | Dialog catat transaksi (beli/jual) |
| `PortofolioKelola` | 06.d · Kelola emiten | `/portofolio?dialog=kelola&kode=` | `app/(app)/portofolio/page.tsx` | Dialog kelola emiten (pindah tesis, keluarkan) |
| `PortofolioDanaTunai` | 06.e · Ubah dana tunai | `/portofolio?dialog=dana-tunai` | `app/(app)/portofolio/page.tsx` | Dialog ubah dana tunai |
| `PortofolioKosong` | 06.f · Portofolio (empty state) | `/portofolio` | `app/(app)/portofolio/page.tsx` | Empty |
| `PortofolioLoading` | 06.g · Portofolio (loading state) | `/portofolio` | `app/(app)/portofolio/loading.tsx` | Skeleton |
| `Watchlist` | 07.a · Watchlist | `/watchlist` | `app/(app)/watchlist/page.tsx` | Pipeline baru/dipelajari/siap, catatan, checklist |
| `WatchlistKosong` | 07.b · Watchlist (empty state) | `/watchlist` | `app/(app)/watchlist/page.tsx` | Empty |
| `WatchlistLoading` | 07.c · Watchlist (loading state) | `/watchlist` | `app/(app)/watchlist/loading.tsx` | Skeleton |
| `Error404` | 09.a · Sistem: Halaman tidak ditemukan (404) | `(not-found)` | `app/(app)/not-found.tsx` | Di dalam shell + cari + saran |
| `Error500` | 09.b · Sistem: Server error (500) | `(error)` | `app/global-error.tsx` | Mandiri, auto-retry 30 dtk, kode kejadian |
| `Pemeliharaan` | 09.c · Sistem: Sedang pemeliharaan | `/pemeliharaan` | `app/(public)/pemeliharaan/page.tsx` | Mandiri, perkiraan selesai |
| `BerandaOffline` | 09.d · Sistem: Koneksi terputus | `(semua halaman app)` | `components/app/offline-banner.tsx` | Banner offline + antrean simpan lokal |
| `SesiHabis` | 09.e · Sistem: Sesi berakhir | `(semua halaman app)` | `components/app/session-expired-dialog.tsx` | Dialog password ulang |
| `EmitenDataTertunda` | 09.f · Sistem: Data BEI tertunda (BUMI) | `/emiten/[kode]` | `components/emiten/data-delayed-banner.tsx` | Banner data BEI tertunda |
| `BerandaKosong` | 01b · Beranda (empty state) | `/beranda` | `app/(app)/beranda/page.tsx` | Empty: belum ada tesis/portofolio |
| `BerandaLoading` | 01c · Beranda (loading state) | `/beranda` | `app/(app)/beranda/loading.tsx` | Skeleton |
| `Main-cxwy` | Landing page — Desktop | `/` | `app/(public)/page.tsx` | Landing desktop (sudah punya brief sendiri: stockplan-landing-handoff.zip) |
| `Mobile-f2ec` | Landing page — Mobile | `/` | `app/(public)/page.tsx` | Landing mobile 390px, halaman yang sama dengan desktop |
| `AdminDashboard` | 01.a · Admin: Dashboard | `/admin` | `app/admin/(panel)/page.tsx` | KPI, antrian kerja, status sinkron |
| `AdminEmiten` | 02.a · Admin: Data emiten | `/admin/emiten` | `app/admin/(panel)/emiten/page.tsx` | Tabel emiten |
| `AdminEmitenIPO` | 02.d · Admin: Tambah emiten IPO | `/admin/emiten/ipo/baru` | `app/admin/(panel)/emiten/ipo/baru/page.tsx` | Form emiten IPO |
| `AdminEmitenIPOLoading` | 02.e · Admin: Tambah emiten IPO (loading state) | `/admin/emiten/ipo/baru` | `app/admin/(panel)/emiten/ipo/baru/loading.tsx` | Skeleton |
| `AdminEmitenEdit` | 02.b · Admin: Edit emiten (BUMI) | `/admin/emiten/[kode]` | `app/admin/(panel)/emiten/[kode]/page.tsx` | Form edit lengkap (contoh BUMI) |
| `AdminEmitenEditLoading` | 02.c · Admin: Edit emiten (loading state) | `/admin/emiten/[kode]` | `app/admin/(panel)/emiten/[kode]/loading.tsx` | Skeleton |
| `AdminTema` | 03.a · Admin: Tema & rantai nilai | `/admin/tema` | `app/admin/(panel)/tema/page.tsx` | Daftar tema |
| `AdminTemaBaru` | 03.c · Admin: Tambah tema (drag & drop) | `/admin/tema/baru` | `app/admin/(panel)/tema/baru/page.tsx` | Tambah tema, drag & drop emiten |
| `AdminTemaEdit` | 03.b · Admin: Edit tema (Batubara) | `/admin/tema/[slug]` | `app/admin/(panel)/tema/[slug]/page.tsx` | Edit tema + kelola tahap utama |
| `AdminPengguna` | 04.a · Admin: Pengguna | `/admin/pengguna` | `app/admin/(panel)/pengguna/page.tsx` | Tabel + panel detail + tangguhkan |
| `AdminMasukan` | 04.b · Admin: Masukan & laporan | `/admin/masukan` | `app/admin/(panel)/masukan/page.tsx` | Inbox tiket + thread |
| `AdminLogin` | 05.a · Admin: Masuk | `/admin/masuk` | `app/admin/(auth)/masuk/page.tsx` | Langkah 1 email kerja + password, kunci setelah 5x |
| `AdminLogin2FA` | 05.b · Admin: Masuk (verifikasi 2 langkah) | `/admin/masuk` | `app/admin/(auth)/masuk/page.tsx` | Langkah 2 TOTP / kode cadangan |
| `AdminRiwayat` | 06.a · Admin: Riwayat perubahan | `/admin/riwayat` | `app/admin/(panel)/riwayat/page.tsx` | Audit log + kembalikan |
| `AdminSinkron` | 06.b · Admin: Sinkron data BEI | `/admin/sinkron` | `app/admin/(panel)/sinkron/page.tsx` | Status sinkron BEI + konflik |
| `AdminAkses` | 07.a · Admin: Akses — anggota tim | `/admin/akses` | `app/admin/(panel)/akses/page.tsx` | Tab anggota tim |
| `AdminAksesPeran` | 07.b · Admin: Akses — peran & izin | `/admin/akses?tab=peran` | `app/admin/(panel)/akses/page.tsx` | Tab peran & matriks izin |
| `AdminPengaturan` | 08.a · Admin: Pengaturan — merek | `/admin/pengaturan` | `app/admin/(panel)/pengaturan/page.tsx` | Tab merek |
| `AdminPengaturanLanding` | 08.b · Admin: Pengaturan — landing page | `/admin/pengaturan?tab=landing` | `app/admin/(panel)/pengaturan/page.tsx` | Tab landing page |
| `AdminPengaturanApp` | 08.c · Admin: Pengaturan — aplikasi | `/admin/pengaturan?tab=aplikasi` | `app/admin/(panel)/pengaturan/page.tsx` | Tab aplikasi |

---

## 6. Aturan per modul

Logika di bawah diambil dari script board. Implementasikan sebagai fungsi murni di `lib/` dan beri unit test.

### 6.1 Beranda (`Main`)

- Salam "Halo, {nama depan} 👋" + "Data BEI per {tanggal}".
- **Perlu tindakan**: hanya hal yang menuntut keputusan, dikelompokkan per emiten. Jenis: `Suspensi` (merah), `Kondisi tesis terpicu` (amber), `Bobot melenceng` (biru). Tiap item: label jenis, waktu, judul, penjelasan, sumber, satu CTA, dan tombol "Selesai" (disembunyikan untuk pengguna itu).
- **Bobot melenceng** muncul kalau bobot aktual menyimpang lebih dari **±5 poin** dari target. Bobot aktual = lot × 100 × harga penutupan BEI terakhir, dibagi total.
- **Perubahan bisnis**: pemegang saham, anak usaha, manajemen (dari keterbukaan BEI).
- **IPO mendatang**: 14 hari ke depan, dengan catatan "Info jadwal dari BEI, bukan ajakan ikut IPO."
- **Kesehatan tesis** dan **Alokasi** (donut).
- `BerandaKosong`: pengguna baru tanpa tesis/portofolio.

### 6.2 Tema bisnis

- `Tema`: peta sektor → `TemaSektor`: daftar industri/tema dalam sektor.
- `TemaDetail`: header tema (jumlah tahap & emiten, tombol "Buat tesis dari tema ini" → `/tesis/baru?tema={slug}`), tab **Rantai nilai** / **Tabel**, catatan tanggal kapitalisasi pasar.
- Rantai nilai dikelompokkan per tahap utama (Hulu → Tengah → Hilir); tiap baris tahap anak: nama, "Tahap n dari N · m emiten", deskripsi singkat, deretan emiten (`<button aria-pressed>`). Emiten yang muncul di lebih dari satu tahap diberi badge angka biru.
- Klik emiten → panel detail emiten di tema (ringkasan, tahap, "Buka halaman bisnis" → `/emiten/{kode}`).
- Data contoh lengkap tema Batubara (5 tahap, 21 emiten): `fixtures/theme-batubara.json`.

### 6.3 Emiten

- `/emiten` tanpa query: `EmitenKosong` (ajakan cari + "Jelajahi dari tema bisnis"). Dengan `?q=`: hasil + tema terkait + pencarian terakhir + jelajahi per sektor; tidak ketemu: `EmitenSearchKosong`.
- Detail tercatat (`Emiten`): ringkasan bisnis (Kekuatan/Kelemahan/Yang dipantau), tren keuangan, struktur grup, pemegang saham, manajemen, risiko utama, laba bersih (induk), emiten satu tahap, laporan analisis, berita & perkembangan. Aksi: "Hubungkan ke tesis", simpan ke watchlist.
- Varian IPO (`EmitenIPO`, `status = 'ipo'`): jadwal IPO, ringkasan bisnis, penggunaan dana, keuangan sebelum IPO, risiko, pemegang saham setelah IPO, penjamin emisi, emiten satu tahap, dokumen (unduh prospektus awal).
- `EmitenDataTertunda`: banner saat laporan periode terbaru belum masuk dari BEI; angka tetap tampil dari periode terakhir dengan label jelas.

### 6.4 Tesis

**Daftar (`Tesis`)**: master-detail. Detail tesis: pernyataan, "Kenapa saya yakin", "Tesis gugur kalau…" (dengan status tiap kondisi), emiten dalam tesis (bobot, tahap, status, alasan), riwayat. Aksi: Edit, Arsipkan (konfirmasi), Pulihkan, Mulai evaluasi. Draf tampil terpisah dengan "Lanjutkan menulis".

Tingkat jadwal evaluasi (`evalTier`), `days` = hari menuju jadwal (negatif = lewat):

```ts
export const evalTier = (days: number) => days < -30 ? 'red' : days <= 30 ? 'warn' : 'normal';
```

**Tulis tesis (`TesisBuat`…`TesisBuatSelesai`)**: wizard 5 langkah, satu halaman, `?langkah=1..5`, tombol Kembali/Lanjut, "Simpan sebagai draf" kapan saja, indikator "Draf tersimpan", pratinjau di samping ("n/5 terisi").

1. Pernyataan + pilih tema (opsional). Wajib: `"Tulis pernyataan tesis dulu — cukup satu kalimat pendek."`
2. Alasan (tambah/hapus baris).
3. Batas gugur (tambah kondisi, contoh kondisi yang bisa diklik).
4. Emiten (opsional): saran dari tema terpilih + cari manual; emiten dari sektor lain diberi peringatan "bukan dari sektor yang sama" dengan pilihan "Tetap tambahkan"; bobot bisa "Bagi rata"; total bobot 100.
5. Jangka waktu (`1–3 tahun`, `3–5 tahun`, `Lebih dari 5 tahun`) + evaluasi rutin (tiap 3/6/12 bulan, default dari Pengaturan) + tanggal evaluasi pertama. Wajib: `"Pilih jangka waktu dan jadwal evaluasi dulu."` Lalu ringkasan "Periksa sekali lagi" dengan tautan "Ubah" ke tiap langkah.

**Evaluasi (`TesisEvaluasi`…`TesisEvaluasiSelesai`)**: tiga bagian lalu kesimpulan.

| Bagian | Pilihan |
| --- | --- |
| Alasan masih berlaku? | `ok` Masih berlaku · `weak` Melemah · `no` Tidak berlaku (+ catatan) |
| Batas gugur tersentuh? | `no` Belum terjadi · `near` Mulai mendekati · `yes` Sudah terjadi (+ catatan) |
| Tiap emiten masih sejalan? | `keep` Tetap · `reweight` Ubah bobot · `out` Keluarkan |

```ts
export function suggestVerdict(e: { reasons: ('ok'|'weak'|'no')[]; kills: ('no'|'near'|'yes')[]; holdings: ('keep'|'reweight'|'out')[] }) {
  const all = [...e.reasons, ...e.kills, ...e.holdings];
  if (all.some(v => !v)) return null;                                  // belum semua dijawab
  const killHit = e.kills.includes('yes');
  const reasonsDead = e.reasons.filter(r => r === 'no').length >= 2;
  if (killHit || reasonsDead) return 'gugur';                          // "Tesis gugur, arsipkan"
  const anyChange = e.reasons.some(r => r !== 'ok') || e.kills.includes('near') || e.holdings.some(h => h !== 'keep');
  return anyChange ? 'revisi' : 'tetap';                               // "Lanjut dengan penyesuaian" / "Tesis tetap berlaku"
}
```

Saran hanya ditandai "Disarankan"; pengguna tetap memilih sendiri. Kalau `gugur`, tesis diarsipkan bersama catatan dan tidak ada jadwal berikutnya. Selain itu tanggal evaluasi berikutnya default dari jadwal rutin dan bisa diubah. Selalu tampil catatan: "Evaluasi adalah catatan pribadi Anda. StockPlan tidak memproses transaksi dan isi halaman ini bukan rekomendasi saham."

### 6.5 Portofolio

- Semua angka berbasis **modal** (bukan nilai pasar): `modal = lot × 100 × hargaRataRata`.
- Total = Σ modal + dana tunai. Dikelompokkan per tesis; emiten tanpa tesis masuk grup "Tanpa tesis" dengan ajakan "Masukkan ke tesis" / "Tulis tesis".
- Komposisi dana: donut per sektor (toggle per emiten) + dana tunai abu `#D6D3D1`.
- Riwayat keputusan: log setiap tambah/catat/pindah/keluarkan/ubah dana tunai.
- Dialog: **Tambah emiten**, **Catat transaksi** (beli/jual, lot, harga, biaya default dari Pengaturan: beli 0,15%, jual 0,25%), **Kelola** (pindah tesis, ubah target, "Keluarkan" dengan konfirmasi "Ya, keluarkan"), **Dana tunai**. Dialog dibuka lewat `?dialog=`.
- Data contoh: `fixtures/portfolio.json`.

### 6.6 Watchlist

- Tiap item punya checklist 4 langkah: Bisnis dipahami · Laporan dibaca · Risiko dicatat · Alasan ditulis.
- Tahap dihitung, tidak disimpan: `0 centang = 'baru'` (Baru disimpan), `4 = 'siap'` (Siap jadi tesis), lainnya `'pel'` (Sedang dipelajari). Bar pipeline di atas bisa diklik untuk memfilter.
- Item: catatan alasan (bisa diedit inline), sinyal terbaru dari keterbukaan BEI, "disimpan n hari lalu". Hapus dengan toast + Urungkan.
- Data contoh: `fixtures/watchlist.json`.

### 6.7 Akun

- **Profil**: foto, nama, ubah password, daftar sesi perangkat dengan "Keluarkan".
- **Langganan**: status akses beta (bergabung, jumlah tesis, emiten dipantau) + kartu dua paket (informasi saja).
- **Pengaturan**: email akun (ganti email → link konfirmasi; email lama berlaku sampai diklik) · Tampilan (bahasa, format angka besar, penjelasan istilah) · Portofolio & tesis (biaya beli/jual, jadwal evaluasi bawaan) · **Notifikasi** (§6.8, belum ada di design) · Data Anda (unduh CSV) · Hapus akun (ketik `HAPUS`). Bar "Ada perubahan yang belum disimpan" muncul saat form kotor.
- **Bantuan & masukan**: FAQ + form masukan (jenis: Laporkan masalah, Data salah, Usulan fitur, Lainnya). **Masukan saya**: daftar tiket + thread, balas, "Buka lagi", "Apakah ini membantu? Ya / Belum". Status pengguna: Terkirim · Sedang dicek · Perlu balasan Anda · Selesai.

### 6.8 Notifikasi — tambahan yang belum ada di design

Dua bagian ini sudah diputuskan tetapi belum digambar. Bangun dengan komponen dan gaya yang sama.

**Pengaturan notifikasi** (kartu baru di `/akun/pengaturan`, id `#notifikasi`, setelah "Portofolio & tesis"): tabel tujuh jenis notifikasi × dua kolom switch **Di aplikasi** / **Email**. Default: semua di aplikasi aktif; email aktif hanya untuk `thesis_eval`, `ticket_reply`, `data_delayed`. Disimpan bersama tombol "Simpan perubahan" yang sudah ada.

**Halaman semua notifikasi** (`/notifikasi`): judul "Notifikasi", tab Semua / Belum dibaca, filter jenis (chip), daftar dengan pola item yang sama seperti panel tapi lebar konten penuh, pagination "Muat lebih banyak" (20 per halaman), empty state yang sama. Panel menautkan "Lihat semua notifikasi" ke halaman ini.

### 6.9 Halaman publik & auth

- Masuk/daftar dengan email + password atau Google. Lupa password: 2 state (form → "Cek email Anda"). Konfirmasi email: kirim ulang link, ganti email.
- Syarat layanan (12 bagian) dan Kebijakan privasi (11 bagian) memakai daftar isi lengket di kiri.
- Pusat bantuan publik: FAQ + "Tidak bisa masuk?" + form kontak.

---

## 7. State standar dan state sistem

| Kondisi | Perilaku | Board |
| --- | --- | --- |
| Loading | `loading.tsx` per route berisi skeleton yang bentuknya sama dengan konten. Shell tetap tampil. `aria-busy="true"` | `*Loading` |
| Kosong | `EmptyState`: ikon, satu kalimat, satu aksi utama | `*Kosong` |
| 404 | Di dalam shell aplikasi: judul, kolom cari dengan saran, link ke halaman utama | `Error404` |
| 500 | Halaman mandiri (`global-error.tsx`): "Ada masalah di server kami", jaminan data aman, coba lagi otomatis tiap 30 detik + tombol "Coba lagi sekarang", kode kejadian yang bisa disalin | `Error500` |
| Pemeliharaan | Halaman mandiri dengan perkiraan selesai (mis. 23.00 WIB); diaktifkan dari Admin › Pengaturan › Aplikasi | `Pemeliharaan` |
| Offline | Banner di atas konten: "Koneksi internet terputus" → "Mencoba menyambung…". Data terakhir tetap tampil dengan jam muat; perubahan disimpan di perangkat dan dikirim otomatis saat online | `BerandaOffline` |
| Sesi berakhir | Setelah 24 jam aktif: dialog minta password di atas halaman (halaman tidak di-reload), "Masuk dengan akun lain", "Lupa password?". Draf tesis disimpan lokal | `SesiHabis` |
| Data BEI tertunda | Banner di halaman emiten | `EmitenDataTertunda` |
| Toast | `sonner`, pill hitam di bawah tengah, ±2,6 detik; dengan aksi "Urungkan" bila bisa dibatalkan | banyak |

---

## 8. Panel admin

Shell sama (sidebar 240px + header). Sidebar admin: Dashboard · Data emiten · Tema & rantai nilai · Pengguna · Masukan & laporan (badge jumlah terbuka) · bagian **Sistem**: Riwayat perubahan, Sinkron data BEI, Akses, Pengaturan · Keluar.

### 8.1 Masuk admin

- Langkah 1: email kerja wajib berakhiran `@stockplan.id`, password minimal 10 karakter. Salah 5 kali → akun dikunci 15 menit dan super admin diberi tahu. Tidak ada reset mandiri ("Minta super admin mengirim tautan atur ulang").
- Langkah 2: TOTP 6 digit (atau kode cadangan format `xxxx-xxxx`), "Percayai perangkat ini selama 7 hari".
- Sesi admin berakhir setelah 30 menit tidak aktif. Semua percobaan masuk dicatat di Riwayat (IP + perangkat).

### 8.2 RBAC

Modul dan aksi ada di `fixtures/admin-modules.json`; peran bawaan di `fixtures/admin-roles.json`. Aksi: `view` Lihat · `edit` Ubah · `publish` Terbitkan · `delete` Hapus/tangguhkan. Tidak semua modul punya semua aksi.

| Peran | Ringkasan |
| --- | --- |
| Super admin | Semua izin, termasuk Akses. Tidak bisa diubah |
| Admin data | Emiten (semua), tema (sampai terbit), sinkron; lihat pengguna, masukan (lihat+ubah), pengaturan (lihat) |
| Editor tema | Lihat + ubah tema; lihat emiten & riwayat. Perubahan harus diterbitkan Admin data |
| Support | Pengguna & masukan (lihat, ubah, tangguhkan); lihat emiten & riwayat |
| Viewer | Lihat semua modul kecuali Akses |

Terapkan izin di **server** (middleware per endpoint) dan di UI (sembunyikan/disable aksi). Peran kustom bisa dibuat dari matriks di `AdminAksesPeran`.

### 8.3 Aturan per modul admin

- **Emiten & tema** punya status: Draf → Perlu ditinjau → Siap terbit/Terbuka. Hanya peran dengan `publish` yang bisa menerbitkan.
- **Tambah tema (`AdminTemaBaru`)**: drag & drop emiten dari pool ke kolom tahap dan antar tahap (HTML5 DnD atau dnd-kit). Setiap kartu punya menu `⋯` sebagai alternatif keyboard (pindah ke tahap…, hapus). Bar simpan di bawah menampilkan cek kelengkapan.
- **Edit tema**: kelola tahap utama (ikon dari 9 pilihan, warna dari 7, judul, deskripsi) dan tahap anak (judul + deskripsi singkat), urutkan.
- **Pengguna**: tabel + panel detail; tangguhkan wajib alasan.
- **Masukan**: inbox dengan filter status/jenis, thread, catatan internal (tidak terlihat pengguna), template balasan, penanggung jawab. Status admin: Baru · Ditangani · Menunggu pengguna · Selesai.
- **Riwayat**: audit log semua perubahan (siapa, kapan, modul, sebelum/sesudah, IP), bisa difilter, sebagian bisa "Kembalikan".
- **Sinkron BEI**: status run terakhir, emiten gagal (contoh BUMI, DEWA, PTRO), laporan menunggu, konflik data (nilai kita vs BEI) untuk dipilih.
- **Pengaturan**: Merek (logo, ikon/favicon set, warna), Landing page (konten section), Aplikasi (mode pemeliharaan, dll).

---

## 9. API (usulan REST)

Semua respons JSON. Auth customer via cookie session httpOnly; admin terpisah (`/admin/api`) dengan 2FA dan timeout 30 menit.

```
POST   /auth/register | /auth/login | /auth/google | /auth/logout | /auth/forgot | /auth/resend-confirmation
GET    /me                         PATCH /me            PATCH /me/prefs
GET    /me/sessions                DELETE /me/sessions/:id
GET    /me/export.csv              DELETE /me                    (body: { confirm: "HAPUS" })

GET    /sectors                    GET /sectors/:id/themes
GET    /themes/:slug               GET /search?q=               (emiten + tema)
GET    /companies/:ticker

GET    /dashboard                  (perlu tindakan, perubahan bisnis, IPO, kesehatan tesis, alokasi)
POST   /dashboard/actions/:id/done

GET    /theses                     POST /theses           GET|PATCH /theses/:id
POST   /theses/:id/archive         POST /theses/:id/restore
POST   /theses/:id/evaluations     GET /theses/:id/evaluations

GET    /portfolio                  POST /portfolio/holdings      PATCH|DELETE /portfolio/holdings/:ticker
POST   /portfolio/transactions     PUT /portfolio/cash

GET    /watchlist                  POST /watchlist      PATCH|DELETE /watchlist/:ticker

GET    /notifications?status=unread&cursor=     GET /notifications/unread-count
POST   /notifications/:id/read     POST /notifications/read-all

GET    /tickets                    POST /tickets        GET /tickets/:id
POST   /tickets/:id/messages       POST /tickets/:id/reopen      POST /tickets/:id/feedback

/admin/api/...  (companies, themes, users, tickets, audit, sync, roles, members, settings) — cek izin per aksi
```

---

## 10. Aksesibilitas dan responsif

### 10.1 Wajib

- Semua elemen interaktif berupa `<button>` atau `<a>`; fokus terlihat (`:focus-visible` 2px `#1C1917`, offset 2px).
- Tombol ikon punya `aria-label` (contoh di §4.2). Ikon dekoratif `aria-hidden`.
- Popover: `aria-expanded` + `aria-haspopup` di pemicu, fokus masuk saat dibuka, `Esc` menutup. Tab memakai `role="tab"` + `aria-selected`.
- Kontras teks ≥ 4.5:1. `#A8A29E` tidak dipakai untuk teks yang perlu dibaca.
- Drag & drop selalu punya alternatif tanpa mouse.
- `prefers-reduced-motion`: matikan shimmer skeleton, pulse, dan transisi (sudah di `tokens.css`).

### 10.2 Breakpoint (belum didesain, diputuskan begini)

Design hanya ada di 1440px. Aplikasi tetap harus bisa dipakai di layar kecil:

| Lebar | Perubahan |
| --- | --- |
| ≥ 1280px | Seperti design |
| 1024–1279px | Padding konten 24px; kolom samping (mis. kartu kanan Beranda, panel detail tema) turun ke bawah bila tidak muat |
| 768–1023px | Sidebar jadi `Sheet` dari kiri lewat tombol menu di header; tombol cari jadi ikon |
| < 768px | Satu kolom; popover cari, notifikasi, dan menu akun jadi `Sheet` layar penuh; dialog jadi bottom sheet; tabel jadi kartu; input font 16px; target sentuh ≥ 44px |

Board landing mobile (`Mobile-f2ec`) adalah acuan gaya untuk ukuran kecil.

---

## 11. Urutan kerja

Kerjakan per fase. Jalankan `lint`, `typecheck`, dan test sebelum lanjut. Bandingkan hasil dengan screenshot di `design/screenshots/` pada lebar 1440px.

**Fase 1 — Fondasi**
Token + font + shadcn, `lib/format.ts`, shell customer (sidebar, header), cari ⌘K, menu akun, notifikasi (lonceng + panel + halaman `/notifikasi`), `EmptyState`, `PageSkeleton`, 404/500/pemeliharaan, banner offline, dialog sesi berakhir.
*Selesai kalau:* `Layout`, `LayoutCari`, `LayoutProfil`, `LayoutNotif`, `Error404`, `Error500`, `Pemeliharaan`, `BerandaOffline`, dan `SesiHabis` cocok dengan screenshot; navigasi keyboard di semua popover jalan.

**Fase 2 — Auth & akun**
Masuk, daftar, lupa password, konfirmasi email, Profil, Langganan, Pengaturan (termasuk kartu Notifikasi), halaman publik.
*Selesai kalau:* semua pesan validasi sama persis dengan design; preferensi tersimpan dan dipakai sebagai default di Tesis/Portofolio.

**Fase 3 — Riset**
Tema (sektor, detail rantai nilai + tabel), Emiten (cari, detail, varian IPO, data tertunda), semua loading/kosong.
*Selesai kalau:* tema Batubara dari fixture tampil 5 tahap / 21 emiten dengan badge lintas tahap yang benar.

**Fase 4 — Perencanaan**
Tesis (daftar, wizard, evaluasi), Portofolio (+ 4 dialog), Watchlist, Beranda.
*Selesai kalau:* unit test `suggestVerdict`, `evalTier`, `stageOf`, kalkulasi modal & drift ±5 poin lulus; state contoh di `TesisEvaluasi2` menghasilkan saran "revisi".

**Fase 5 — Bantuan & tiket**
Bantuan, Masukan saya, notifikasi balasan tiket.

**Fase 6 — Admin**
Login + 2FA, shell admin, RBAC (server + UI), Dashboard, Emiten, Tema (edit + DnD), Pengguna, Masukan, Riwayat, Sinkron, Akses, Pengaturan.
*Selesai kalau:* tiap peran di `admin-roles.json` hanya bisa memanggil endpoint yang diizinkan (test per peran), dan semua perubahan masuk Riwayat.

Untuk setiap layar: buka `design/screenshots/<Board>.jpg`, baca `design/screens/<Board>.dc.html` untuk copy & state, bangun, lalu bandingkan.

---

## 12. Belum didesain atau di luar scope

- Checkout, tagihan, dan pembatalan langganan.
- Template email transaksional (konfirmasi, reset password, pengingat evaluasi, balasan tiket). Untuk sekarang pakai teks sederhana dengan copy dari layar terkait.
- Alur aktivasi 2FA pertama kali dan pembuatan kode cadangan untuk admin.
- Dark mode (logo versi gelap sudah ada, tapi UI belum).
- Board `Piece-cjdy` di canvas tidak dipakai; tidak disertakan.
- Bahasa Inggris (pilihan "English (segera)" di Pengaturan dinonaktifkan).
