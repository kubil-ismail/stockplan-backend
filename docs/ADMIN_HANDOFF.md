# StockPlan Admin — Handoff integrasi dengan Client

Status per 11 Nov 2026. Dokumen ini untuk tim **web client** dan yang menyiapkan **deploy**. Isinya: bagaimana panel admin (repo ini), aplikasi client, dan backend dijalankan bersama, serta apa yang dilihat pengguna client setelah admin melakukan sesuatu.

Kontrak API (auth, error, endpoint per layar) ada di [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) dan Swagger backend (`/docs`). Dokumen ini tidak mengulanginya.

---

## 1. Gambaran

```
Browser admin  ──►  Admin (Next.js, repo ini)  ── rewrite /admin/api/* ──►  Backend (Express)
Browser client ──►  Client (frontend client)   ── proxy /auth, /me, ... ──►  Backend (Express)
```

| | Admin (repo ini) | Client |
| --- | --- | --- |
| Halaman | Semua di bawah `/admin` (`/admin/masuk`, `/admin/emiten`, …). `/` redirect ke `/admin` | Path selain `/admin` |
| API yang dipanggil | Hanya `/admin/api/*` | `/auth`, `/me`, `/sectors`, `/companies`, `/themes`, `/watchlist` |
| Cookie sesi | `asid` + `atd`, path `/admin/api` | `sid` |
| Cara sampai ke backend | Rewrite Next.js di `next.config.ts` ke `ADMIN_API_ORIGIN` | Proxy dev server / reverse proxy |

Admin dan client **tidak saling memanggil**. Keduanya hanya bertemu lewat backend dan database yang sama. Sesi client tidak berlaku di admin dan sebaliknya, jadi satu orang bisa masuk ke keduanya sekaligus tanpa bentrok.

Admin tidak butuh CORS: browser memanggil `/admin/api/*` di origin admin sendiri, lalu server Next.js meneruskannya ke backend. Cookie `asid` dipasang backend untuk origin admin.

## 2. Menjalankan bertiga di dev

Default port ketiganya bentrok di 3000. Pakai pembagian ini:

| Proses | Port | Perintah |
| --- | --- | --- |
| Backend | 3000 | `npm run dev` di repo backend (sesuai FRONTEND_HANDOFF §5) |
| Admin | 3001 | `ADMIN_API_ORIGIN=http://localhost:3000 npx next dev -p 3001` |
| Client | port dev server-nya (mis. Vite 5173) | proxy ke `http://localhost:3000` |

`.env.example` repo ini memakai pola sebaliknya (backend di 3001). Keduanya jalan, yang penting `ADMIN_API_ORIGIN` menunjuk ke port backend yang sebenarnya.

Buka admin di `http://localhost:3001/admin`. Akun dev ada di FRONTEND_HANDOFF §5.

## 3. Deploy

### Rekomendasi: admin di subdomain sendiri

```
stockplan.id         → client  (+ reverse proxy API client ke backend)
admin.stockplan.id   → admin   (Next.js; ADMIN_API_ORIGIN = URL internal backend)
```

- Admin cukup bisa menjangkau backend dari server. Backend tidak perlu dibuka ke internet untuk admin.
- Tidak ada bentrok path antara client dan admin.

### Kalau harus satu domain

Reverse proxy harus mengarahkan `/admin` dan `/admin/*` ke admin. Masalahnya, admin juga memakai path di luar `/admin`:

- aset Next.js di `/_next/*` (bentrok bila client juga Next.js atau memakai path yang sama),
- `/favicon.ico` dan `/logos/*` dari `public/`.

Jalan keluarnya perlu perubahan di admin (mis. `assetPrefix`), dan itu belum dikerjakan. Kabari tim admin dulu sebelum memilih opsi ini.

### Env backend yang wajib diisi

| Env | Isi | Dipakai untuk |
| --- | --- | --- |
| `APP_URL` | origin client, mis. `https://stockplan.id` | Tautan email ke pengguna client (§5) |
| `ADMIN_URL` | origin admin, mis. `https://admin.stockplan.id` | Tautan undangan admin (`/admin/undangan`) |
| `SYNC_TOKEN` | acak ≥ 32 karakter (`openssl rand -hex 32`), sama dengan di crawler | Crawler BEI → `/admin/api/sync/agent/*`. Kosong = endpoint crawler menolak (503) |

**`ADMIN_URL` default-nya `APP_URL`.** Kalau admin di subdomain dan `ADMIN_URL` lupa diisi, tautan undangan admin akan membuka domain client.

## 4. Aksi admin → yang terlihat di client

Data yang dilihat client hanya berubah setelah **terbit**. Simpan draf tidak berpengaruh ke client, kecuali Tema: lihat baris di bawah.

| Aksi di admin | Efek di client |
| --- | --- |
| Emiten: Simpan draf | Tidak ada |
| Emiten: Terbitkan | `GET /companies`, `/companies/:ticker`, peers, hitungan sektor, dan watchlist memakai data baru |
| Emiten IPO baru (belum pernah terbit) | Tidak muncul di client sama sekali (404, tidak bisa ditambah ke watchlist) |
| Tema: Simpan draf / Petakan emiten | Peran dengan izin terbit (status `draft`): tema **hilang dari client** sampai diterbitkan lagi. Editor tanpa izin terbit (status `review`): tidak ada |
| Tema: Terbitkan | `GET /themes/:slug` berubah. Semua tahap diganti sekaligus |
| Pengguna: Tangguhkan | Semua sesi pengguna dihapus. Request berikutnya 401 `UNAUTHENTICATED`, login berikutnya 403 `ACCOUNT_SUSPENDED` |
| Pengguna: Pulihkan | Pengguna bisa login lagi |
| Pengguna: Kirim ulang konfirmasi | Email ke pengguna dengan tautan `/konfirmasi-email` (client) |
| Pengguna: Reset password | Email dengan tautan `/atur-ulang-password` (client). Dipakai sekali, berlaku 1 jam, mengeluarkan semua sesi |
| Pengguna: Kirim undangan | Email dengan tautan `/daftar?email=` (client) |
| Riwayat: Kembalikan | Sama dengan aksi aslinya (mis. mengembalikan emiten yang sudah terbit mengubah data client) |

Client cukup mengikuti FRONTEND_HANDOFF: tangani 401 dari endpoint mana pun sebagai sesi berakhir, dan 404 sebagai data belum terbit.

## 5. Halaman client yang dibutuhkan admin

Tiga aksi di §4 mengirim pengguna ke halaman client. Kalau halaman ini belum ada, tombolnya di admin tetap jalan tetapi tautan di email akan 404:

| Path client | Query | Dipicu dari admin |
| --- | --- | --- |
| `/konfirmasi-email` | `token` | Kirim ulang konfirmasi |
| `/atur-ulang-password` | `token` | Reset password |
| `/daftar` | `email` | Kirim undangan |

Cara memanggil API di tiap halaman ada di FRONTEND_HANDOFF §3.1. Di dev, email tidak terkirim; tautannya dicetak di log backend.

## 6. Yang belum tersambung di admin

Supaya client tidak mengira data ini sudah ada:

- **Masukan & laporan, Pengaturan aplikasi** masih memakai data contoh dari design (ditandai `shortcut:` di `lib/masukan.ts`, `lib/pengaturan.ts`). Endpoint backend-nya juga belum ada.
- **Dashboard**: endpoint backend sudah ada (`GET /admin/api/dashboard`, lihat FRONTEND_HANDOFF §4.4), tetapi `components/admin/dashboard-view.tsx` masih memakai data contoh.
- **Sinkron data BEI**: endpoint backend sudah ada (`/admin/api/sync`, lihat FRONTEND_HANDOFF §4.4), tetapi admin masih memakai `lib/sinkron.ts`. Crawler juga belum diarahkan ke backend ini, jadi data sinkron masih kosong. Pengaturan aplikasi yang diubah di admin **tidak** sampai ke client.
- **Halaman `/admin/undangan`** (aktivasi undangan admin) belum dibuat.
- **`perms` dari `GET /admin/api/auth/me`** belum dipakai untuk menyembunyikan menu/tombol. Server tetap menolak dengan 403, jadi aman, tetapi admin dengan peran terbatas masih melihat tombol yang akan gagal.
- **Logo emiten**: admin hanya meneruskan `/admin/api/*` ke backend. `logoUrl` (`/logos/emiten/…`) dibaca dari `public/logos/` milik admin, yang baru berisi sebagian logo. Logo lain tampil sebagai inisial. Perbaikan: tambah rewrite `/logos/:path*` ke backend di `next.config.ts`.
