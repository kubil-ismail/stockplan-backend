'use strict';

// OpenAPI 3.0 spec, served at /docs (UI) and /docs.json (raw). Keep in sync with controllers/.
const user = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Bil' },
    email: { type: 'string', format: 'email', example: 'bil@contoh.com' },
    pendingEmail: { type: 'string', format: 'email', nullable: true, description: 'Email baru yang menunggu konfirmasi' },
    emailVerified: { type: 'boolean' },
    plan: { type: 'string', enum: ['beta', 'monthly', 'yearly'] },
    experience: { type: 'string', nullable: true, enum: ['Baru mulai', '< 1 tahun', '1–3 tahun', '> 3 tahun'] },
    horizon: { type: 'string', nullable: true, enum: ['1–3 tahun', '3–5 tahun', 'Lebih dari 5 tahun'] },
    interestedThemes: { type: 'array', items: { type: 'string' }, example: ['Batubara', 'Perbankan'] },
    passwordChangedAt: { type: 'string', format: 'date-time', nullable: true },
    prefs: {
      type: 'object',
      properties: {
        numberFormat: { type: 'string', enum: ['short', 'full'] },
        glossary: { type: 'boolean' },
        buyFeePct: { type: 'number', example: 0.15 },
        sellFeePct: { type: 'number', example: 0.25 },
        defaultEvalEvery: { type: 'integer', enum: [3, 6, 12] },
        language: { type: 'string', enum: ['id'] },
        notifications: { $ref: '#/components/schemas/NotificationPrefs' },
      },
    },
  },
};

const errorResponse = (description, code, message, fields) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      example: { error: { code, message, ...(fields && { fields }) } },
    },
  },
});

module.exports = {
  openapi: '3.0.3',
  info: { title: 'StockPlan API', version: '0.1.0', description: 'REST API StockPlan. Sesi memakai cookie httpOnly `sid`.' },
  tags: [{ name: 'Auth' }, { name: 'Profil' }, { name: 'Pengaturan' }, { name: 'Tema bisnis' }, { name: 'Emiten' }, { name: 'Watchlist' }, { name: 'Admin: Auth' }, { name: 'Admin: Emiten' }, { name: 'Admin: Pengguna' }, { name: 'Admin: Tema' }, { name: 'Admin: Akses' }],
  security: [{ cookieAuth: [] }],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        security: [],
        summary: 'Daftar akun baru',
        description: 'Membuat akun dengan `emailVerified=false`. Belum membuat sesi; pengguna harus konfirmasi email dulu.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterBody' } } },
        },
        responses: {
          201: {
            description: 'Akun dibuat',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/User' }, message: { type: 'string', example: 'Akun dibuat — cek email Anda untuk konfirmasi.' } },
                },
              },
            },
          },
          409: errorResponse('Email sudah terdaftar', 'EMAIL_TAKEN', 'Email ini sudah terdaftar.', { email: 'Email ini sudah terdaftar.' }),
          422: errorResponse('Validasi gagal', 'VALIDATION', 'Periksa lagi isian Anda.', { name: 'Isi nama panggilan Anda.', email: 'Isi email Anda.' }),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        security: [],
        summary: 'Masuk',
        description: 'Berhasil → cookie `sid` (httpOnly, SameSite=Lax). `remember` true (default): 30 hari; false: 24 jam dan hilang saat browser ditutup.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginBody' } } },
        },
        responses: {
          200: {
            description: 'Berhasil masuk',
            headers: { 'Set-Cookie': { schema: { type: 'string', example: 'sid=…; Path=/; HttpOnly; SameSite=Lax' } } },
            content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } },
          },
          401: errorResponse('Email atau password salah', 'BAD_CREDENTIALS', 'Email atau password tidak cocok.'),
          403: errorResponse('Email belum dikonfirmasi', 'EMAIL_UNCONFIRMED', 'Email Anda belum dikonfirmasi.'),
          422: errorResponse('Validasi gagal', 'VALIDATION', 'Periksa lagi isian Anda.', { password: 'Isi password Anda.' }),
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Keluar',
        description: 'Mengakhiri sesi perangkat ini dan menghapus cookie.',
        responses: { 204: { description: 'Berhasil keluar' }, 401: { $ref: '#/components/responses/Unauthenticated' } },
      },
    },
    '/me': {
      get: {
        tags: ['Profil'],
        summary: 'Data akun saya',
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } }, 401: { $ref: '#/components/responses/Unauthenticated' } },
      },
      delete: {
        tags: ['Pengaturan'],
        summary: 'Hapus akun permanen',
        description: 'Menghapus akun beserta semua sesi dan menghapus cookie. Tidak bisa dipulihkan.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['confirm'], properties: { confirm: { type: 'string', enum: ['HAPUS'] } } } } } },
        responses: {
          204: { description: 'Akun dihapus' },
          401: { $ref: '#/components/responses/Unauthenticated' },
          422: errorResponse('Konfirmasi salah', 'VALIDATION', 'Ketik HAPUS untuk konfirmasi.', { confirm: 'Ketik HAPUS untuk konfirmasi.' }),
        },
      },
      patch: {
        tags: ['Profil'],
        summary: 'Simpan profil',
        description: 'Hanya field yang dikirim yang diubah. Email tidak bisa diubah di sini.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileBody' } } } },
        responses: {
          200: { description: 'Profil disimpan', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          401: { $ref: '#/components/responses/Unauthenticated' },
          422: errorResponse('Validasi gagal', 'VALIDATION', 'Periksa lagi isian Anda.', { name: 'Nama tidak boleh kosong.' }),
        },
      },
    },
    '/me/prefs': {
      patch: {
        tags: ['Pengaturan'],
        summary: 'Simpan pengaturan',
        description: 'Tampilan, biaya transaksi, jadwal evaluasi bawaan, dan notifikasi. Parsial: hanya field yang dikirim yang berubah; `notifications` digabung per jenis dan kanal. Biaya dikirim sebagai angka (0,15 → `0.15`).',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PrefsBody' } } } },
        responses: {
          200: { description: 'Pengaturan disimpan', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          401: { $ref: '#/components/responses/Unauthenticated' },
          422: errorResponse('Validasi gagal', 'VALIDATION', 'Periksa lagi isian Anda.', { buyFeePct: 'Biaya harus berupa angka 0–10.' }),
        },
      },
    },
    '/me/email': {
      post: {
        tags: ['Pengaturan'],
        summary: 'Ganti email (kirim link konfirmasi)',
        description: 'Email lama tetap dipakai sampai link di email baru dikonfirmasi lewat `/auth/confirm-email-change`. Link berlaku 24 jam.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } },
        responses: {
          200: { description: 'Link dikirim', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' }, message: { type: 'string', example: 'Link konfirmasi dikirim ke baru@contoh.com' } } } } } },
          401: { $ref: '#/components/responses/Unauthenticated' },
          409: errorResponse('Email sudah dipakai akun lain', 'EMAIL_TAKEN', 'Email ini sudah terdaftar.', { email: 'Email ini sudah terdaftar.' }),
          422: errorResponse('Format salah / sama dengan email sekarang', 'VALIDATION', 'Format email belum benar. Contoh: nama@email.com', { email: 'Format email belum benar. Contoh: nama@email.com' }),
        },
      },
    },
    '/auth/confirm-email-change': {
      post: {
        tags: ['Pengaturan'],
        security: [],
        summary: 'Konfirmasi email baru',
        description: 'Publik: token dari link email adalah kredensialnya. Sekali pakai.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } } } },
        responses: {
          200: { description: 'Email diganti', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          400: errorResponse('Token salah / kedaluwarsa / sudah dipakai', 'BAD_TOKEN', 'Link konfirmasi tidak valid atau sudah kedaluwarsa.'),
          409: errorResponse('Email keburu dipakai akun lain', 'EMAIL_TAKEN', 'Email ini sudah terdaftar.'),
        },
      },
    },
    '/me/password': {
      post: {
        tags: ['Profil'],
        summary: 'Ubah password',
        description: 'Setelah berhasil, sesi di perangkat lain otomatis dikeluarkan; sesi ini tetap aktif.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PasswordBody' } } } },
        responses: {
          200: { description: 'Password diperbarui', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          401: { $ref: '#/components/responses/Unauthenticated' },
          422: errorResponse('Validasi gagal / password sekarang salah', 'VALIDATION', 'Password sekarang salah.', { currentPassword: 'Password sekarang salah.' }),
        },
      },
    },
    '/me/sessions': {
      get: {
        tags: ['Profil'],
        summary: 'Perangkat aktif',
        responses: {
          200: {
            description: 'Sesi yang masih berlaku, terbaru dulu',
            content: { 'application/json': { schema: { type: 'object', properties: { sessions: { type: 'array', items: { $ref: '#/components/schemas/DeviceSession' } } } } } },
          },
          401: { $ref: '#/components/responses/Unauthenticated' },
        },
      },
    },
    '/me/sessions/{id}': {
      delete: {
        tags: ['Profil'],
        summary: 'Keluarkan perangkat',
        description: 'Tidak bisa untuk sesi saat ini (gunakan /auth/logout).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          204: { description: 'Perangkat dikeluarkan' },
          400: errorResponse('Sesi saat ini', 'CURRENT_SESSION', 'Gunakan Keluar untuk mengakhiri sesi perangkat ini.'),
          401: { $ref: '#/components/responses/Unauthenticated' },
          404: errorResponse('Sesi tidak ditemukan (atau milik orang lain)', 'NOT_FOUND', 'Sesi tidak ditemukan.'),
        },
      },
    },
    '/admin/api/auth/login': {
      post: {
        tags: ['Admin: Auth'],
        security: [],
        servers: [{ url: '/' }],
        summary: 'Masuk admin, langkah 1 (email + password)',
        description: 'Email wajib `@stockplan.id`. Salah 5 kali (login atau kode 2FA, dalam 15 menit) → 429 `ACCOUNT_LOCKED` selama 15 menit. Dari perangkat tepercaya langsung masuk (`admin`); selain itu mengembalikan `step: two_factor` dan cookie `asid` sementara (5 menit).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', example: 'admin@stockplan.id' }, password: { type: 'string', format: 'password' } } } } } },
        responses: {
          200: { description: 'Lanjut ke 2FA, atau sudah masuk (perangkat tepercaya)', content: { 'application/json': { schema: { oneOf: [{ type: 'object', properties: { step: { type: 'string', enum: ['two_factor'] }, email: { type: 'string' } } }, { type: 'object', properties: { admin: { $ref: '#/components/schemas/Admin' } } }] } } } },
          401: errorResponse('Email/password salah', 'BAD_CREDENTIALS', 'Email atau password salah. Sisa 4 percobaan sebelum akun dikunci.'),
          422: errorResponse('Isian tidak valid', 'VALIDATION', 'Periksa lagi isian Anda.', { email: 'Gunakan email kerja @stockplan.id.' }),
          429: errorResponse('Akun dikunci', 'ACCOUNT_LOCKED', 'Terlalu banyak percobaan. Akun dikunci 15 menit dan super admin sudah diberi tahu.'),
        },
      },
    },
    '/admin/api/auth/verify': {
      post: {
        tags: ['Admin: Auth'],
        security: [{ adminCookie: [] }],
        summary: 'Masuk admin, langkah 2 (TOTP / kode cadangan)',
        description: 'Butuh cookie `asid` dari langkah 1. `method: backup` memakai kode `xxxx-xxxx` sekali pakai. `trustDevice` memasang cookie `atd` 7 hari yang melewati langkah ini. Berhasil → cookie `asid` baru; sesi berakhir setelah 30 menit tanpa aktivitas.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['code'], properties: { code: { type: 'string', example: '123456' }, method: { type: 'string', enum: ['totp', 'backup'], default: 'totp' }, trustDevice: { type: 'boolean', default: false } } } } } },
        responses: {
          200: { description: 'Masuk', content: { 'application/json': { schema: { type: 'object', properties: { admin: { $ref: '#/components/schemas/Admin' } } } } } },
          401: errorResponse('Kode salah, atau sesi langkah 1 hilang/berakhir', 'BAD_CODE', 'Kode salah atau sudah kedaluwarsa. Coba kode terbaru.'),
          422: errorResponse('Format kode salah', 'VALIDATION', 'Kode harus 6 digit angka.', { code: 'Kode harus 6 digit angka.' }),
          429: errorResponse('Akun dikunci', 'ACCOUNT_LOCKED', 'Terlalu banyak percobaan. Akun dikunci 15 menit dan super admin sudah diberi tahu.'),
        },
      },
    },
    '/admin/api/auth/logout': {
      post: {
        tags: ['Admin: Auth'],
        security: [],
        summary: 'Keluar admin / "Ganti akun"',
        description: 'Mengakhiri sesi (juga yang belum lewat 2FA). Idempoten. Cookie perangkat tepercaya tidak dihapus.',
        responses: { 204: { description: 'Selesai' } },
      },
    },
    '/admin/api/auth/me': {
      get: {
        tags: ['Admin: Auth'],
        security: [{ adminCookie: [] }],
        summary: 'Admin yang sedang masuk + izinnya',
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { admin: { $ref: '#/components/schemas/Admin' } } } } } }, 401: errorResponse('Belum masuk / sesi berakhir', 'UNAUTHENTICATED', 'Sesi admin berakhir. Masuk lagi.') },
      },
    },
    '/admin/api/companies': {
      get: {
        tags: ['Admin: Emiten'],
        security: [{ adminCookie: [] }],
        summary: 'Daftar emiten (AdminEmiten)',
        description: 'Izin `em:view`. Hitungan `tabs` mengikuti `q` + `sector`; `tab` hanya menyaring baris. `completeness` = 5 bagian (Profil BEI, Ringkasan bisnis, Sumber pendapatan, Anak usaha, Pemetaan tema). `status`: `ok` (Siap terbit), `review`, `draft`, `new` (IPO baru, belum pernah terbit). Diurutkan dari yang terakhir diperbarui.',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Kode atau nama' },
          { name: 'tab', in: 'query', schema: { type: 'string', enum: ['all', 'review', 'incomplete', 'ready'], default: 'all' } },
          { name: 'sector', in: 'query', schema: { type: 'string' }, description: 'Slug sektor' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 14, maximum: 100 } },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
            total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' },
            tabs: { type: 'object', properties: { all: { type: 'integer' }, review: { type: 'integer' }, incomplete: { type: 'integer' }, ready: { type: 'integer' } } },
            sectors: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' } } } },
            items: { type: 'array', items: { $ref: '#/components/schemas/AdminCompanyRow' } },
          } } } } },
          401: errorResponse('Belum masuk', 'UNAUTHENTICATED', 'Sesi admin berakhir. Masuk lagi.'),
          403: errorResponse('Tanpa izin', 'FORBIDDEN', 'Peran Anda tidak punya izin untuk aksi ini.'),
        },
      },
      post: {
        tags: ['Admin: Emiten'],
        security: [{ adminCookie: [] }],
        summary: 'Buat emiten IPO sebagai draf (AdminEmitenIPO "Simpan draf")',
        description: 'Izin `em:edit`. Hanya `ticker` (4 huruf) dan `name` yang wajib; bagian lain boleh menyusul lewat PATCH. Emiten tidak tampil ke customer sampai diterbitkan.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCompanyForm' }, example: { ticker: 'ABNU', name: 'PT Andalan Baterai Nusantara Tbk', sectorSlug: 'barang-baku', subsector: 'Nikel & bahan baterai' } } } },
        responses: {
          201: { description: 'Dibuat', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCompanyEdit' } } } },
          409: errorResponse('Kode sudah dipakai', 'TICKER_TAKEN', 'Kode ABNU sudah dipakai emiten lain. Cek lagi kode dari pengumuman BEI.', { ticker: 'Kode ABNU sudah dipakai emiten lain. Cek lagi kode dari pengumuman BEI.' }),
          422: errorResponse('Isian tidak valid', 'VALIDATION', 'Periksa lagi isian Anda.', { ticker: 'Kode saham harus 4 huruf.' }),
        },
      },
    },
    '/admin/api/companies/export.csv': {
      get: {
        tags: ['Admin: Emiten'],
        security: [{ adminCookie: [] }],
        summary: 'Ekspor CSV',
        description: 'Izin `em:view`. Tanpa `tickers` = semua emiten. Sel yang diawali `= + - @` diberi awalan `\'` agar tidak dieksekusi spreadsheet.',
        parameters: [{ name: 'tickers', in: 'query', schema: { type: 'string', example: 'BUMI,PTBA' }, description: 'Dipisah koma (emiten terpilih)' }],
        responses: { 200: { description: 'CSV', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/admin/api/companies/bulk-review': {
      post: {
        tags: ['Admin: Emiten'],
        security: [{ adminCookie: [] }],
        summary: 'Tandai perlu ditinjau (aksi massal)',
        description: 'Izin `em:edit`. 1–200 kode.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['tickers'], properties: { tickers: { type: 'array', items: { type: 'string' }, example: ['BUMI', 'PTBA'] } } } } } },
        responses: {
          200: { description: 'Jumlah emiten yang berubah', content: { 'application/json': { schema: { type: 'object', properties: { updated: { type: 'integer' } } } } } },
          422: errorResponse('Daftar kosong / terlalu banyak', 'VALIDATION', 'Pilih 1–200 emiten.', { tickers: 'Pilih 1–200 emiten.' }),
        },
      },
    },
    '/admin/api/companies/{ticker}': {
      parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string', example: 'BUMI' } }],
      get: {
        tags: ['Admin: Emiten'],
        security: [{ adminCookie: [] }],
        summary: 'Isi form edit + kelengkapan (AdminEmitenEdit / AdminEmitenIPO)',
        description: 'Izin `em:view`. `form` = draf bila ada, jika tidak versi terbit. `sections` = daftar kelengkapan; `canPublish` true bila semuanya `ok`. Emiten berstatus `ipo` memakai 4 bagian IPO (Identitas, Jadwal IPO, Detail penawaran, Penggunaan dana), lainnya 12 bagian.',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCompanyEdit' } } } },
          404: errorResponse('Tidak ada', 'NOT_FOUND', 'Emiten tidak ditemukan.'),
        },
      },
      patch: {
        tags: ['Admin: Emiten'],
        security: [{ adminCookie: [] }],
        summary: 'Simpan draf',
        description: 'Izin `em:edit`. Hanya bagian yang dikirim yang diganti (satu bagian diganti utuh). Aturan kelengkapan (jumlah 100%, panjang 60/100/400) tidak menolak draf, hanya menahan penerbitan; batas teknis (tipe, panjang maksimum, jumlah baris) tetap ditolak 422. Pengguna tetap melihat versi terakhir yang terbit.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCompanyForm' } } } },
        responses: {
          200: { description: 'Draf tersimpan', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCompanyEdit' } } } },
          404: errorResponse('Tidak ada', 'NOT_FOUND', 'Emiten tidak ditemukan.'),
          422: errorResponse('Isian tidak valid', 'VALIDATION', 'Periksa lagi isian Anda.', { 'risks[0].level': 'Isian tidak valid.' }),
        },
      },
    },
    '/admin/api/companies/{ticker}/publish': {
      post: {
        tags: ['Admin: Emiten'],
        security: [{ adminCookie: [] }],
        summary: 'Terbitkan',
        description: 'Izin `em:publish`. Menyalin draf ke data yang dilihat customer dan mengosongkan draf. 422 `INCOMPLETE` bila ada bagian belum lengkap (`fields` = catatan per bagian).',
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Terbit', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminCompanyEdit' } } } },
          403: errorResponse('Tanpa izin terbit', 'FORBIDDEN', 'Peran Anda tidak punya izin untuk aksi ini.'),
          422: errorResponse('Belum lengkap', 'INCOMPLETE', 'Belum bisa terbit: Ringkasan bisnis, Sumber pendapatan', { summary: 'Perlu dicek', revenue: 'kurang 100%' }),
        },
      },
    },
    '/admin/api/users': {
      get: {
        tags: ['Admin: Pengguna'],
        security: [{ adminCookie: [] }],
        summary: 'Daftar pengguna + ringkasan (AdminPengguna)',
        description: 'Izin `usr:view`. `tabs` mengikuti `q` + `plan`; `tab` hanya menyaring baris. Status dihitung: `sus` (ditangguhkan) > `new` (belum konfirmasi) > `idle` (tak ada aktivitas 30 hari) > `act`. `summary.thesisWriters` belum terisi (modul Tesis belum ada). Diurutkan dari yang terbaru bergabung.',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Nama atau email' },
          { name: 'tab', in: 'query', schema: { type: 'string', enum: ['all', 'act', 'new', 'idle', 'sus'], default: 'all' } },
          { name: 'plan', in: 'query', schema: { type: 'string', enum: ['y', 'm', 'n'] }, description: 'Minat paket: y Tahunan, m Bulanan, n Belum memilih' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 12, maximum: 100 } },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
            summary: { type: 'object', properties: {
              total: { type: 'integer' }, newThisWeek: { type: 'integer' },
              active7Days: { type: 'object', properties: { count: { type: 'integer' }, percent: { type: 'integer' } } },
              thesisWriters: { type: 'object', properties: { count: { type: 'integer' }, avgPerWriter: { type: 'number', nullable: true } } },
              subscriptionInterest: { type: 'object', properties: { count: { type: 'integer' }, yearlyPercent: { type: 'integer' } } },
            } },
            tabs: { type: 'object', properties: { all: { type: 'integer' }, act: { type: 'integer' }, new: { type: 'integer' }, idle: { type: 'integer' }, sus: { type: 'integer' } } },
            total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' },
            items: { type: 'array', items: { $ref: '#/components/schemas/AdminUserRow' } },
          } } } } },
          401: errorResponse('Belum masuk', 'UNAUTHENTICATED', 'Sesi admin berakhir. Masuk lagi.'),
          403: errorResponse('Tanpa izin', 'FORBIDDEN', 'Peran Anda tidak punya izin untuk aksi ini.'),
        },
      },
    },
    '/admin/api/users/export.csv': {
      get: {
        tags: ['Admin: Pengguna'],
        security: [{ adminCookie: [] }],
        summary: 'Ekspor CSV',
        description: 'Izin `usr:view`. Mengikuti `q` dan `plan`. Isi tesis dan portofolio tidak ikut diekspor.',
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'plan', in: 'query', schema: { type: 'string', enum: ['y', 'm', 'n'] } }],
        responses: { 200: { description: 'CSV', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/admin/api/users/invite': {
      post: {
        tags: ['Admin: Pengguna'],
        security: [{ adminCookie: [] }],
        summary: 'Undang pengguna beta',
        description: 'Izin `usr:edit`. Saat ini hanya mengirim tautan daftar ke email itu (belum dilacak; pendaftaran masih terbuka).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', example: 'calon@contoh.com' } } } } } },
        responses: {
          204: { description: 'Undangan dikirim' },
          409: errorResponse('Sudah terdaftar', 'EMAIL_TAKEN', 'Email ini sudah terdaftar.', { email: 'Email ini sudah terdaftar.' }),
          422: errorResponse('Email tidak valid', 'VALIDATION', 'Email belum valid', { email: 'Email belum valid' }),
        },
      },
    },
    '/admin/api/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        tags: ['Admin: Pengguna'],
        security: [{ adminCookie: [] }],
        summary: 'Panel detail pengguna',
        description: 'Izin `usr:view`. Admin hanya melihat jumlah pemakaian, tidak pernah isi tesis, portofolio, atau watchlist. `usage.themesOpened` null = belum dilacak. `actions` memberi tahu tombol mana yang tampil.',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AdminUserDetail' } } } } } },
          404: errorResponse('Tidak ada', 'NOT_FOUND', 'Pengguna tidak ditemukan.'),
        },
      },
    },
    '/admin/api/users/{id}/suspend': {
      post: {
        tags: ['Admin: Pengguna'],
        security: [{ adminCookie: [] }],
        summary: 'Tangguhkan akun',
        description: 'Izin `usr:delete`. Alasan wajib. Mengeluarkan pengguna dari semua perangkat dan menolak login berikutnya (403 `ACCOUNT_SUSPENDED`). `note` hanya untuk internal.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', enum: ['Spam atau akun palsu', 'Menyalahgunakan form laporan', 'Permintaan pengguna sendiri', 'Lainnya'] }, note: { type: 'string', maxLength: 500, description: 'Opsional, tidak dikirim ke pengguna' } } } } } },
        responses: {
          200: { description: 'Ditangguhkan', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AdminUserDetail' } } } } } },
          409: errorResponse('Sudah ditangguhkan', 'ALREADY_SUSPENDED', 'Akun sudah ditangguhkan.'),
          422: errorResponse('Alasan kosong', 'VALIDATION', 'Pilih alasan dulu', { reason: 'Pilih alasan dulu' }),
        },
      },
    },
    '/admin/api/users/{id}/restore': {
      post: {
        tags: ['Admin: Pengguna'],
        security: [{ adminCookie: [] }],
        summary: 'Pulihkan akun',
        description: 'Izin `usr:delete`. Pengguna bisa masuk lagi (harus login ulang).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Dipulihkan', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AdminUserDetail' } } } } } },
          409: errorResponse('Tidak ditangguhkan', 'NOT_SUSPENDED', 'Akun tidak sedang ditangguhkan.'),
        },
      },
    },
    '/admin/api/users/{id}/resend-confirmation': {
      post: {
        tags: ['Admin: Pengguna'],
        security: [{ adminCookie: [] }],
        summary: 'Kirim ulang email konfirmasi',
        description: 'Izin `usr:edit`. Hanya untuk akun belum terkonfirmasi. Tautan berlaku 24 jam dan dikonfirmasi lewat `POST /auth/confirm-email-change`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'Terkirim' }, 409: errorResponse('Sudah terkonfirmasi', 'ALREADY_VERIFIED', 'Email sudah terkonfirmasi.') },
      },
    },
    '/admin/api/users/{id}/password-reset': {
      post: {
        tags: ['Admin: Pengguna'],
        security: [{ adminCookie: [] }],
        summary: 'Kirim tautan atur ulang password',
        description: 'Izin `usr:edit`. Hanya akun terkonfirmasi yang tidak ditangguhkan. Tautan berlaku 1 jam; pengguna memakainya lewat `POST /auth/reset-password`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'Terkirim' }, 409: errorResponse('Tidak bisa', 'CANNOT_RESET', 'Atur ulang password hanya untuk akun terkonfirmasi yang tidak ditangguhkan.') },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        security: [],
        summary: 'Atur password baru dari tautan',
        description: 'Token dari email "atur ulang password" (dikirim admin). Aturan password sama dengan daftar. Sekali pakai; semua sesi pengguna dikeluarkan.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token', 'password'], properties: { token: { type: 'string' }, password: { type: 'string', format: 'password' } } } } } },
        responses: {
          204: { description: 'Password diganti' },
          400: errorResponse('Token salah/kedaluwarsa', 'BAD_TOKEN', 'Link atur ulang password tidak valid atau sudah kedaluwarsa.'),
          422: errorResponse('Password lemah', 'VALIDATION', 'Periksa lagi isian Anda.', { password: 'Password minimal 8 karakter, dengan huruf besar dan angka.' }),
        },
      },
    },
    '/admin/api/themes': {
      get: {
        tags: ['Admin: Tema'],
        security: [{ adminCookie: [] }],
        summary: 'Daftar tema + antrean emiten belum dipetakan (AdminTema)',
        description: 'Izin `tm:view`. `status`: `open` (Terbuka), `draft`, `review`. `tabs` mengikuti `q` + `sector`. `readiness` = emiten "Siap terbit" di Data emiten / emiten di tema (form terbaru, termasuk draf). `summary.open` = tema yang terlihat pengguna. `unmapped` = emiten yang belum ada di tahap tema mana pun (terbit maupun draf), IPO dulu lalu market cap terbesar; usulan tema dari `theme_industries.themeSlug`, lalu sektor yang sama. `theses` selalu null sampai modul Tesis ada.',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'tab', in: 'query', schema: { type: 'string', enum: ['all', 'open', 'draft', 'review'], default: 'all' } },
          { name: 'sector', in: 'query', schema: { type: 'string' } },
          { name: 'queue', in: 'query', schema: { type: 'integer', default: 3, maximum: 20 }, description: 'Jumlah emiten di antrean' },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
            summary: { type: 'object', properties: {
              open: { type: 'integer' }, draft: { type: 'integer' },
              mappedCompanies: { type: 'object', properties: { count: { type: 'integer' }, of: { type: 'integer' } } },
              missingShares: { type: 'object', properties: { count: { type: 'integer' }, inOpenThemes: { type: 'integer' } } },
            } },
            tabs: { type: 'object', properties: { all: { type: 'integer' }, open: { type: 'integer' }, draft: { type: 'integer' }, review: { type: 'integer' } } },
            total: { type: 'integer' },
            items: { type: 'array', items: { $ref: '#/components/schemas/AdminThemeRow' } },
            sectors: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' } } } },
            unmapped: { type: 'object', properties: { total: { type: 'integer' }, items: { type: 'array', items: { type: 'object', properties: {
              ticker: { type: 'string' }, name: { type: 'string' }, logoUrl: { type: 'string', nullable: true }, status: { type: 'string' },
              suggestion: { type: 'object', nullable: true, properties: { slug: { type: 'string' }, name: { type: 'string' } } }, note: { type: 'string' },
            } } } } },
          } } } } },
        },
      },
      post: {
        tags: ['Admin: Tema'],
        security: [{ adminCookie: [] }],
        summary: 'Tambah tema sebagai draf (AdminTema / AdminTemaBaru)',
        description: 'Izin `tm:edit`. Wajib `name` (≥ 3 huruf, unik) dan `sectorSlug`; bagian lain opsional (AdminTemaBaru boleh mengirim semuanya). Tanpa `groups`, dipakai Hulu/Tengah/Hilir. Slug dibuat dari nama dan tidak berubah saat nama diganti. Tidak terlihat pengguna sampai diterbitkan.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminThemeForm' }, example: { name: 'Energi terbarukan', sectorSlug: 'energi' } } } },
        responses: {
          201: { description: 'Dibuat', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminThemeEdit' } } } },
          409: errorResponse('Nama sudah dipakai', 'THEME_TAKEN', 'Tema dengan nama itu sudah ada', { name: 'Tema dengan nama itu sudah ada' }),
          422: errorResponse('Isian tidak valid', 'VALIDATION', 'Nama tema minimal 3 huruf', { name: 'Nama tema minimal 3 huruf' }),
        },
      },
    },
    '/admin/api/themes/{slug}': {
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string', example: 'batubara' } }],
      get: {
        tags: ['Admin: Tema'],
        security: [{ adminCookie: [] }],
        summary: 'Isi halaman edit tema (AdminTemaEdit)',
        description: 'Izin `tm:view`. `form` = draf bila ada, jika tidak versi terbit. `checks` = 5 syarat terbit; `companies`/`notReady` = profil emiten dari Data emiten; `multiStage` = total porsi emiten yang ada di lebih dari satu tahap; `history` = 5 perubahan terakhir.',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminThemeEdit' } } } },
          404: errorResponse('Tidak ada', 'NOT_FOUND', 'Tema tidak ditemukan.'),
        },
      },
      patch: {
        tags: ['Admin: Tema'],
        security: [{ adminCookie: [] }],
        summary: 'Simpan draf',
        description: 'Izin `tm:edit`. Tiap bagian yang dikirim diganti utuh (urutan `stages` = urutan tahap). Kode emiten harus ada di Data emiten. Peran tanpa `tm:publish` (Editor tema) menyimpan sebagai "Perlu ditinjau". Pengguna tetap melihat versi terbit.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminThemeForm' } } } },
        responses: {
          200: { description: 'Draf tersimpan', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminThemeEdit' } } } },
          409: errorResponse('Nama sudah dipakai', 'THEME_TAKEN', 'Tema dengan nama itu sudah ada'),
          422: errorResponse('Isian tidak valid', 'VALIDATION', 'Kode emiten tidak dikenal: ZZZQ.', { stages: 'Kode emiten tidak dikenal: ZZZQ.' }),
        },
      },
    },
    '/admin/api/themes/{slug}/companies': {
      post: {
        tags: ['Admin: Tema'],
        security: [{ adminCookie: [] }],
        summary: 'Petakan emiten ke tema',
        description: 'Izin `tm:edit`. Dari antrean "Emiten belum masuk tema mana pun". Menambahkan emiten ke tahap `stage` (1-based, default 1) di draf dengan porsi kosong. Idempoten.',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ticker'], properties: { ticker: { type: 'string', example: 'TLKM' }, stage: { type: 'integer', default: 1 } } } } } },
        responses: {
          204: { description: 'Masuk draf tema' },
          422: errorResponse('Tema belum punya tahap / kode salah', 'VALIDATION', 'Tambahkan tahap dulu sebelum memetakan emiten.', { stage: 'Tambahkan tahap dulu sebelum memetakan emiten.' }),
        },
      },
    },
    '/admin/api/themes/{slug}/publish': {
      post: {
        tags: ['Admin: Tema'],
        security: [{ adminCookie: [] }],
        summary: 'Terbitkan tema',
        description: 'Izin `tm:publish`. Kelima syarat harus terpenuhi. Menyalin draf ke tema + mengganti semua tahap (urutan, emiten, porsi, sumber).',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Terbit', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminThemeEdit' } } } },
          403: errorResponse('Tanpa izin terbit', 'FORBIDDEN', 'Peran Anda tidak punya izin untuk aksi ini.'),
          422: errorResponse('Belum lengkap', 'INCOMPLETE', 'Belum bisa terbit: total porsi per emiten ≤ 100% (INDY)', { totals: 'INDY' }),
        },
      },
    },
    '/admin/api/auth/accept-invite': {
      post: {
        tags: ['Admin: Auth'],
        security: [],
        summary: 'Terima undangan anggota',
        description: 'Publik; token dari email undangan (72 jam, sekali pakai). Mengatur password (≥ 10 karakter) dan mengembalikan secret TOTP + 8 kode cadangan **sekali saja**. Setelah itu anggota masuk biasa (password + kode TOTP pertama); 2FA tercatat aktif pada verifikasi pertama. Layar aktivasi belum didesain.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token', 'password'], properties: { token: { type: 'string' }, password: { type: 'string', format: 'password', minLength: 10 }, name: { type: 'string', description: 'Opsional; default dari email' } } } } } },
        responses: {
          200: { description: 'Diterima', content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, totp: { type: 'object', properties: { secret: { type: 'string' }, otpauthUri: { type: 'string' } } }, backupCodes: { type: 'array', items: { type: 'string', example: 'a1b2-c3d4' } } } } } } },
          400: errorResponse('Token salah/kedaluwarsa', 'BAD_TOKEN', 'Tautan undangan tidak valid atau sudah kedaluwarsa.'),
          422: errorResponse('Password pendek', 'VALIDATION', 'Password minimal 10 karakter.', { password: 'Password minimal 10 karakter.' }),
        },
      },
    },
    '/admin/api/access/members': {
      get: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Anggota tim (AdminAkses)',
        description: 'Izin `acc:view`. Per anggota: peran, kunci ubah peran (diri sendiri / super admin terakhir), status 2FA, masuk terakhir + perangkat, jumlah gagal masuk hari ini (WIB), status, dan `actions` (tombol yang tampil).',
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
          members: { type: 'array', items: { $ref: '#/components/schemas/AdminMember' } },
          counts: { type: 'object', properties: { members: { type: 'integer' }, roles: { type: 'integer' } } },
          roleOptions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } },
        } } } } }, 403: errorResponse('Tanpa izin', 'FORBIDDEN', 'Peran Anda tidak punya izin untuk aksi ini.') },
      },
    },
    '/admin/api/access/members/invite': {
      post: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Undang anggota',
        description: 'Izin `acc:edit`. Email `@stockplan.id`. Hanya super admin yang bisa mengundang sebagai super admin. Tautan berlaku 72 jam (`POST /admin/api/auth/accept-invite`).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'role'], properties: { email: { type: 'string', example: 'kevin@stockplan.id' }, role: { type: 'string', example: 'tema' } } } } } },
        responses: {
          201: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { member: { $ref: '#/components/schemas/AdminMember' } } } } } },
          403: errorResponse('Bukan super admin', 'SUPER_ONLY', 'Hanya super admin yang bisa memberi atau mencabut peran super admin.'),
          409: errorResponse('Sudah anggota', 'EMAIL_TAKEN', 'Email ini sudah terdaftar sebagai anggota.'),
          422: errorResponse('Email bukan email kerja', 'VALIDATION', 'Gunakan email kerja @stockplan.id', { email: 'Gunakan email kerja @stockplan.id' }),
        },
      },
    },
    '/admin/api/access/members/{id}': {
      patch: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Ubah peran anggota',
        description: 'Izin `acc:edit`. Langsung berlaku di permintaan berikutnya anggota itu. Tidak bisa mengubah peran sendiri; hanya super admin yang bisa memberi/mencabut peran super admin; minimal 1 super admin aktif.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['role'], properties: { role: { type: 'string' } } } } } },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { member: { $ref: '#/components/schemas/AdminMember' } } } } } },
          400: errorResponse('Diri sendiri', 'SELF_CHANGE', 'Tidak bisa mengubah peran sendiri'),
          403: errorResponse('Bukan super admin', 'SUPER_ONLY', 'Hanya super admin yang bisa memberi atau mencabut peran super admin.'),
          409: errorResponse('Super admin terakhir', 'LAST_SUPER', 'Harus ada minimal 1 super admin aktif'),
        },
      },
    },
    '/admin/api/access/members/{id}/deactivate': {
      post: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Nonaktifkan anggota',
        description: 'Izin `acc:delete`. Mengeluarkan dari semua sesi dan menghapus perangkat tepercaya. Bukan untuk diri sendiri atau super admin terakhir.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { member: { $ref: '#/components/schemas/AdminMember' } } } } } }, 400: errorResponse('Diri sendiri', 'SELF_CHANGE', 'Tidak bisa menonaktifkan akun sendiri.'), 409: errorResponse('Super admin terakhir', 'LAST_SUPER', 'Harus ada minimal 1 super admin aktif') },
      },
    },
    '/admin/api/access/members/{id}/reactivate': {
      post: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Aktifkan lagi',
        description: 'Izin `acc:delete`. Anggota yang belum pernah menerima undangan kembali ke status Undangan.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { member: { $ref: '#/components/schemas/AdminMember' } } } } } }, 409: errorResponse('Tidak nonaktif', 'BAD_STATE', 'Anggota ini tidak sedang nonaktif.') },
      },
    },
    '/admin/api/access/members/{id}/resend-invite': {
      post: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Kirim ulang undangan',
        description: 'Izin `acc:edit`. Tautan baru 72 jam; tautan lama tidak berlaku lagi.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { member: { $ref: '#/components/schemas/AdminMember' } } } } } }, 409: errorResponse('Bukan undangan', 'BAD_STATE', 'Anggota ini tidak sedang diundang.') },
      },
    },
    '/admin/api/access/roles': {
      get: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Peran & izin (AdminAksesPeran)',
        description: 'Izin `acc:view`. `modules` = baris matriks (aksi yang tersedia per modul, `sensitive` = badge Sensitif). `roles[].perms` = izin efektif (super admin selalu semua). `memberCount` tidak menghitung anggota nonaktif.',
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
          actions: { type: 'array', items: { type: 'string' }, example: ['view', 'edit', 'publish', 'delete'] },
          modules: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, name: { type: 'string' }, desc: { type: 'string' }, actions: { type: 'array', items: { type: 'string' } }, sensitive: { type: 'boolean' } } } },
          roles: { type: 'array', items: { $ref: '#/components/schemas/AdminRole' } },
        } } } } } },
      },
      post: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Buat peran baru',
        description: 'Izin `acc:edit`. Aksi di luar yang tersedia untuk modul ditolak; aksi apa pun otomatis menambah Lihat.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminRoleBody' }, example: { name: 'Analis riset', summary: 'Emiten saja', perms: { em: ['edit'] } } } } },
        responses: { 201: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { role: { $ref: '#/components/schemas/AdminRole' } } } } } }, 409: errorResponse('Nama dipakai', 'ROLE_TAKEN', 'Nama peran sudah dipakai.'), 422: errorResponse('Nama kosong', 'VALIDATION', 'Beri nama peran dulu', { name: 'Beri nama peran dulu' }) },
      },
    },
    '/admin/api/access/roles/{id}': {
      put: {
        tags: ['Admin: Akses'], security: [{ adminCookie: [] }],
        summary: 'Simpan izin / ubah peran',
        description: 'Izin `acc:edit`. Bagian yang dikirim saja yang diganti; `perms` diganti utuh. Super admin tidak bisa diubah; anggota tidak bisa mengubah peran yang sedang ia pegang. Langsung berlaku.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'tema' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminRoleBody' } } } },
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { role: { $ref: '#/components/schemas/AdminRole' } } } } } }, 403: errorResponse('Super admin / peran sendiri', 'SUPER_LOCKED', 'Izin super admin tidak bisa diubah') },
      },
    },
    '/sectors': {
      get: {
        tags: ['Tema bisnis'],
        summary: 'Peta sektor',
        description: 'Halaman Tema. Sektor IDX-IC berurutan. `industryNames` dipakai kotak cari ("nikel, bank"). Filter Siap/Baru/Segera hadir dilakukan di klien dari `status`.',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { sectors: { type: 'array', items: { $ref: '#/components/schemas/SectorSummary' } } } } } } },
          401: { $ref: '#/components/responses/Unauthenticated' },
        },
      },
    },
    '/sectors/{slug}': {
      get: {
        tags: ['Tema bisnis'],
        summary: 'Sektor: subsektor dan industri',
        description: 'Halaman TemaSektor. `notice` = banner "Data baru: industri {industryName} {note}." (null kalau tidak ada).',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string', example: 'energi' } }],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'object', properties: { sector: { $ref: '#/components/schemas/SectorDetail' }, notice: { $ref: '#/components/schemas/SectorNotice' } } } } },
          },
          401: { $ref: '#/components/responses/Unauthenticated' },
          404: errorResponse('Sektor tidak ditemukan', 'NOT_FOUND', 'Sektor tidak ditemukan.'),
        },
      },
    },
    '/companies': {
      get: {
        tags: ['Emiten'],
        summary: 'Cari emiten',
        description: 'Halaman EmitenSearch. Cocok kalau kode diawali `q`, nama mengandung `q`, atau nama industri mengandung `q`. Urutan: kode persis → awalan kode → awalan nama → lainnya, lalu market cap. `sectors` = chip filter dengan jumlah dari semua hasil; `total` juga dihitung sebelum filter sektor. Tanpa `q` tapi dengan `sector` → semua emiten sektor itu (Jelajahi berdasarkan sektor). Tanpa keduanya → hasil kosong (EmitenKosong). Tiap baris membawa `themes` (Tema terkait, hanya tema terbit) dan `inWatchlist`.',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 50, example: 'bu' } },
          { name: 'sector', in: 'query', schema: { type: 'string', example: 'energi' }, description: 'Slug sektor dari `sectors`' },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' },
                    total: { type: 'integer', description: '"3 emiten cocok"' },
                    sectors: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' }, count: { type: 'integer' } } } },
                    companies: { type: 'array', items: { allOf: [{ $ref: '#/components/schemas/CompanyCard' }, { type: 'object', properties: { bestMatch: { type: 'boolean', description: '"Paling cocok"' }, themes: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' } } } }, inWatchlist: { type: 'boolean' } } }] } },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthenticated' },
        },
      },
    },
    '/companies/{ticker}': {
      get: {
        tags: ['Emiten'],
        summary: 'Detail emiten',
        description: 'Halaman Emiten (status `listed`/`suspended`) atau EmitenIPO (status `ipo`, data di `ipo`). `dataDelayed` terisi → banner Data BEI tertunda. Seksi editorial (overview … sourceNote) bisa tidak ada kalau belum diisi admin. `overview` memakai **tebal** gaya Markdown.',
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string', pattern: '^[A-Za-z]{4}$', example: 'BUMI' } }],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    company: { $ref: '#/components/schemas/CompanyDetail' },
                    peers: {
                      type: 'object',
                      description: '"Satu tahap dengan …": emiten lain di tahap pertama tema emiten ini. Tanpa tema → industri yang sama (`basis: industry`). "Lihat semua di tabel" → /tema/{theme.slug}?tampilan=tabel',
                      properties: {
                        basis: { type: 'string', nullable: true, enum: ['stage', 'industry', null] },
                        theme: { $ref: '#/components/schemas/Ref' },
                        stage: { type: 'object', nullable: true, properties: { order: { type: 'integer' }, name: { type: 'string' } } },
                        total: { type: 'integer', description: '"13 lainnya"' },
                        items: { type: 'array', maxItems: 4, items: { $ref: '#/components/schemas/Peer' } },
                      },
                    },
                    viewer: {
                      type: 'object',
                      description: 'Status tombol untuk pengguna yang sedang masuk',
                      properties: {
                        inWatchlist: { type: 'boolean', description: '"Tambah ke watchlist" / "Di watchlist"' },
                        alerts: { type: 'object', properties: { listing: { type: 'boolean', description: '"Ingatkan saat tercatat"' }, dataUpdate: { type: 'boolean', description: '"Kabari saat diperbarui"' } } },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthenticated' },
          404: errorResponse('Emiten tidak ditemukan', 'NOT_FOUND', 'Emiten tidak ditemukan.'),
        },
      },
    },
    '/companies/{ticker}/alerts/{kind}': {
      parameters: [
        { name: 'ticker', in: 'path', required: true, schema: { type: 'string', example: 'ABNU' } },
        { name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['listing', 'data-update'] }, description: '`listing` = "Ingatkan saat tercatat" (hanya emiten IPO); `data-update` = "Kabari saat diperbarui"' },
      ],
      put: {
        tags: ['Emiten'],
        summary: 'Aktifkan pengingat',
        description: 'Idempoten. Pengiriman notifikasinya menyusul bersama modul notifikasi.',
        responses: {
          204: { description: 'Aktif' },
          401: { $ref: '#/components/responses/Unauthenticated' },
          404: errorResponse('Emiten / jenis tidak dikenal', 'NOT_FOUND', 'Emiten tidak ditemukan.'),
          422: errorResponse('`listing` untuk emiten yang sudah tercatat', 'NOT_IPO', 'Emiten ini sudah tercatat di bursa.'),
        },
      },
      delete: {
        tags: ['Emiten'],
        summary: 'Matikan pengingat',
        responses: { 204: { description: 'Nonaktif (juga kalau memang belum aktif)' }, 401: { $ref: '#/components/responses/Unauthenticated' }, 404: errorResponse('Emiten / jenis tidak dikenal', 'NOT_FOUND', 'Emiten tidak ditemukan.') },
      },
    },
    '/themes/{slug}': {
      get: {
        tags: ['Tema bisnis'],
        summary: 'Detail tema (rantai nilai)',
        description: 'Halaman TemaDetail + TemaDetailTabel + panel emiten, satu panggilan. Hanya tema `published`. `companies` berurutan menurut kemunculan pertama di tahap; ticker tahap tanpa data emiten dibuang. `mcapAsOf` = tanggal harga terbaru di antara emiten yang punya market cap. `viewer.watchlist` = emiten tema ini di watchlist pengguna.',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string', example: 'batubara' } }],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    theme: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, sector: { type: 'object', nullable: true, properties: { slug: { type: 'string' }, name: { type: 'string' } } } } },
                    stages: { type: 'array', items: { type: 'object', properties: { order: { type: 'integer', example: 2 }, group: { type: 'string', enum: ['hulu', 'tengah', 'hilir'] }, name: { type: 'string' }, shortName: { type: 'string', nullable: true }, description: { type: 'string', nullable: true }, tickers: { type: 'array', items: { type: 'string' } } } } },
                    companies: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          ticker: { type: 'string' }, name: { type: 'string' }, summary: { type: 'string', nullable: true }, logoUrl: { type: 'string', nullable: true },
                          status: { type: 'string', enum: ['listed', 'ipo', 'suspended'] },
                          tagline: { type: 'string', nullable: true, description: '"Pembeda utama"' },
                          marketCap: { type: 'number', nullable: true, description: 'Rupiah' }, priceDate: { type: 'string', format: 'date', nullable: true },
                          highlights: {
                            type: 'object', nullable: true, description: 'Isi drawer emiten',
                            properties: {
                              stats: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } } } },
                              insight: { type: 'string' },
                              revenueMix: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, pct: { type: 'number' } } } },
                              subsidiaries: { type: 'array', items: { type: 'string' } },
                            },
                          },
                        },
                      },
                    },
                    mcapAsOf: { type: 'string', format: 'date', nullable: true },
                    viewer: { type: 'object', properties: { watchlist: { type: 'array', items: { type: 'string' } } } },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthenticated' },
          404: errorResponse('Tema tidak ada / belum terbit', 'NOT_FOUND', 'Tema tidak ditemukan.'),
        },
      },
    },
    '/watchlist': {
      get: {
        tags: ['Watchlist'],
        summary: 'Daftar watchlist',
        description: 'Halaman Watchlist. Terbaru dulu; tahap (baru/pel/siap) dihitung dari checklist. `themes` = tema terbit tempat emiten muncul, dengan tahap utamanya.',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        allOf: [{ $ref: '#/components/schemas/WatchItem' }, {
                          type: 'object',
                          properties: {
                            company: { type: 'object', properties: { name: { type: 'string' }, logoUrl: { type: 'string', nullable: true }, tagline: { type: 'string', nullable: true }, summary: { type: 'string', nullable: true }, sector: { type: 'object', nullable: true }, industry: { type: 'object', nullable: true } } },
                            themes: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' }, groups: { type: 'array', items: { type: 'string', enum: ['hulu', 'tengah', 'hilir'] } } } } },
                          },
                        }],
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthenticated' },
        },
      },
      post: {
        tags: ['Watchlist'],
        summary: 'Tambah ke watchlist',
        description: 'Idempoten: 201 kalau baru, 200 kalau sudah ada (catatan lama tidak ditimpa).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ticker'], properties: { ticker: { type: 'string', example: 'BUMI' }, note: { type: 'string', maxLength: 2000 } } } } } },
        responses: {
          201: { description: 'Ditambahkan', content: { 'application/json': { schema: { type: 'object', properties: { item: { $ref: '#/components/schemas/WatchItem' } } } } } },
          200: { description: 'Sudah ada', content: { 'application/json': { schema: { type: 'object', properties: { item: { $ref: '#/components/schemas/WatchItem' } } } } } },
          401: { $ref: '#/components/responses/Unauthenticated' },
          422: errorResponse('Kode tidak dikenal / catatan terlalu panjang', 'VALIDATION', 'Emiten tidak ditemukan.', { ticker: 'Emiten tidak ditemukan.' }),
        },
      },
    },
    '/watchlist/{ticker}': {
      patch: {
        tags: ['Watchlist'],
        summary: 'Ubah catatan / checklist',
        description: '"Kenapa saya simpan" dan checklist riset 4 langkah (Bisnis dipahami · Laporan dibaca · Risiko dicatat · Alasan ditulis). Update parsial; setiap perubahan memperbarui `touchedAt`.',
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string', example: 'BUMI' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { note: { type: 'string', maxLength: 2000 }, checklist: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'boolean' } } } } } } },
        responses: {
          200: { description: 'Disimpan', content: { 'application/json': { schema: { type: 'object', properties: { item: { $ref: '#/components/schemas/WatchItem' } } } } } },
          401: { $ref: '#/components/responses/Unauthenticated' },
          404: errorResponse('Tidak ada di watchlist', 'NOT_FOUND', 'Emiten ini tidak ada di watchlist Anda.'),
          422: errorResponse('Isian tidak valid / kosong', 'VALIDATION', 'Tidak ada yang diubah.', { body: 'Tidak ada yang diubah.' }),
        },
      },
      delete: {
        tags: ['Watchlist'],
        summary: 'Hapus dari watchlist',
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string', example: 'BUMI' } }],
        responses: { 204: { description: 'Dihapus' }, 401: { $ref: '#/components/responses/Unauthenticated' }, 404: errorResponse('Tidak ada di watchlist', 'NOT_FOUND', 'Emiten ini tidak ada di watchlist Anda.') },
      },
    },
  },
  components: {
    securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sid' }, adminCookie: { type: 'apiKey', in: 'cookie', name: 'asid' } },
    responses: { Unauthenticated: errorResponse('Belum masuk / sesi berakhir', 'UNAUTHENTICATED', 'Sesi tidak valid atau sudah berakhir.') },
    schemas: {
      WatchItem: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          themeName: { type: 'string', nullable: true },
          note: { type: 'string' },
          checklist: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'boolean' }, description: 'Bisnis dipahami · Laporan dibaca · Risiko dicatat · Alasan ditulis' },
          stage: { type: 'string', enum: ['baru', 'pel', 'siap'], description: 'Dihitung dari checklist' },
          savedAt: { type: 'string', format: 'date-time' },
          touchedAt: { type: 'string', format: 'date-time' },
        },
      },
      Leader: { type: 'object', properties: { ticker: { type: 'string', example: 'PTBA' }, logoUrl: { type: 'string', nullable: true, example: '/logos/emiten/logo-ptba.svg' } } },
      Ref: { type: 'object', nullable: true, properties: { slug: { type: 'string' }, name: { type: 'string' } } },
      CompanyCard: {
        type: 'object',
        properties: {
          ticker: { type: 'string', example: 'BUMI' },
          name: { type: 'string', example: 'Bumi Resources Tbk' },
          logoUrl: { type: 'string', nullable: true, description: 'null → avatar inisial 2 huruf' },
          status: { type: 'string', enum: ['listed', 'ipo', 'suspended'] },
          summary: { type: 'string', nullable: true },
          sector: { $ref: '#/components/schemas/Ref' },
          industry: { $ref: '#/components/schemas/Ref' },
          sizeClass: { type: 'string', nullable: true, enum: ['small', 'medium', 'large'], description: 'Skala kecil / menengah / besar' },
          hasReport: { type: 'boolean', description: '"Ada laporan analisis"' },
        },
      },
      Peer: {
        type: 'object',
        properties: {
          ticker: { type: 'string' }, name: { type: 'string' }, logoUrl: { type: 'string', nullable: true },
          tagline: { type: 'string', nullable: true, example: 'BUMN · >50% ke PLN' }, marketCap: { type: 'number', nullable: true },
        },
      },
      Series: { type: 'object', properties: { values: { type: 'array', items: { type: 'number' } }, note: { type: 'string' } } },
      CompanyDetail: {
        allOf: [
          { $ref: '#/components/schemas/CompanyCard' },
          {
            type: 'object',
            properties: {
              listingBoard: { type: 'string', nullable: true, example: 'Utama' },
              listedYear: { type: 'integer', nullable: true, example: 1990 },
              groupName: { type: 'string', nullable: true, example: 'Grup Bakrie' },
              tagline: { type: 'string', nullable: true },
              marketCap: { type: 'number', nullable: true, description: 'Rupiah, harga penutupan `priceDate`' },
              metrics: { type: 'object', nullable: true, properties: { pbv: { type: 'number' }, roePct: { type: 'number' }, grossMarginPct: { type: 'number' }, debtToAssetPct: { type: 'number' } } },
              financialPeriod: { type: 'string', nullable: true, example: 'H1-2026' },
              priceDate: { type: 'string', format: 'date', nullable: true, description: '"harga penutupan 29 Okt 2026"' },
              dataDelayed: {
                type: 'object',
                nullable: true,
                description: 'Terisi → banner "Data BEI untuk {ticker} belum diperbarui sejak …". null = data terbaru',
                properties: {
                  lastUpdatedAt: { type: 'string', format: 'date-time', description: '"sejak 4 Nov 2026, 06.00"' },
                  nextCheckAt: { type: 'string', format: 'date-time', description: '"cek ulang otomatis besok 06.00"' },
                  handling: { type: 'boolean', description: '"Tim sedang menangani"' },
                  failedDays: { type: 'integer', description: '"gagal 2 hari terakhir"' },
                },
              },
              themes: {
                type: 'array',
                description: 'Tema yang memuat emiten ini → badge "{name} · Tahap {stages[0].order} dari {stageCount} · {stages[0].name}"',
                items: {
                  type: 'object',
                  properties: {
                    slug: { type: 'string', example: 'batubara' }, name: { type: 'string', example: 'Batubara' }, stageCount: { type: 'integer', example: 5 },
                    stages: { type: 'array', items: { type: 'object', properties: { order: { type: 'integer', example: 2 }, name: { type: 'string', example: 'Pemilik tambang termal' }, shortName: { type: 'string', nullable: true }, group: { type: 'string', enum: ['hulu', 'tengah', 'hilir'] } } } },
                  },
                },
              },
              overview: { type: 'string' },
              strengths: { type: 'array', items: { type: 'string' } },
              weaknesses: { type: 'array', items: { type: 'string' } },
              watchItems: { type: 'array', items: { type: 'string' }, description: '"Yang dipantau"' },
              financials: {
                type: 'object',
                description: 'Uang dalam Rupiah. Satu nilai per `periods`',
                properties: {
                  source: { type: 'string' },
                  periods: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, span: { type: 'string' } } } },
                  revenue: { $ref: '#/components/schemas/Series' },
                  netIncome: { $ref: '#/components/schemas/Series' },
                  grossMarginPct: { $ref: '#/components/schemas/Series' },
                },
              },
              subsidiaries: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, business: { type: 'string' }, ownershipPct: { type: 'number' }, ticker: { type: 'string' } } } },
              shareholders: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, pct: { type: 'number' }, public: { type: 'boolean' } } } }, note: { type: 'string' } } },
              management: { type: 'object', properties: { total: { type: 'integer' }, people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' } } } } } },
              risks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, level: { type: 'string', enum: ['high', 'medium'] } } } },
              news: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, source: { type: 'string' }, dateLabel: { type: 'string' } } } },
              reports: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string', format: 'date' }, pages: { type: 'integer' }, contents: { type: 'string' }, url: { type: 'string', nullable: true } } } },
              sourceNote: { type: 'string' },
              ipo: { $ref: '#/components/schemas/Ipo' },
            },
          },
        ],
      },
      Ipo: {
        type: 'object',
        nullable: true,
        description: 'Hanya untuk status `ipo`. Uang dalam Rupiah',
        properties: {
          offerPrice: { type: 'number', example: 450 },
          priceRange: { type: 'array', items: { type: 'number' }, example: [420, 480] },
          sharesOffered: { type: 'number' }, sharesTotal: { type: 'number' },
          proceeds: { type: 'number' }, valueAtOffer: { type: 'number' }, publicPct: { type: 'number' },
          prospectusDate: { type: 'string', format: 'date' },
          listingDate: { type: 'string', format: 'date' },
          daysToListing: { type: 'integer', description: 'Dihitung dari tanggal WIB hari ini' },
          schedule: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, start: { type: 'string', format: 'date' }, end: { type: 'string', format: 'date' }, state: { type: 'string', enum: ['done', 'current', 'upcoming'], description: 'Maks. satu `current`' } } } },
          useOfProceeds: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, amount: { type: 'number' }, pct: { type: 'number' } } } },
          useOfProceedsNote: { type: 'string' },
          shareholdersAfter: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, pct: { type: 'number' }, public: { type: 'boolean' } } } },
          lockupNote: { type: 'string' },
          underwriters: { type: 'array', items: { type: 'string' } },
          preIpoFinancials: { type: 'object', properties: { periods: { type: 'array', items: { type: 'object' } }, revenue: { type: 'array', items: { type: 'number' } }, netIncome: { type: 'array', items: { type: 'number' } }, grossMarginPct: { type: 'array', items: { type: 'number' } }, debtToAssetPct: { type: 'array', items: { type: 'number' } }, note: { type: 'string' } } },
          documents: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string', nullable: true }, sizeMb: { type: 'number', nullable: true }, note: { type: 'string' }, url: { type: 'string', nullable: true } } } },
        },
      },
      DataStatus: { type: 'string', enum: ['new', 'ok', 'soon'], description: 'new = Baru (data diperbarui ≤ 7 hari), ok = Siap, soon = Segera hadir' },
      Industry: {
        type: 'object',
        properties: {
          slug: { type: 'string', example: 'batu-bara' },
          name: { type: 'string', example: 'Batu Bara' },
          icon: { type: 'string', nullable: true, example: 'flame' },
          status: { $ref: '#/components/schemas/DataStatus' },
          updatedAt: { type: 'string', format: 'date-time', nullable: true },
          themeSlug: { type: 'string', nullable: true, example: 'batubara', description: 'Ada → "Lihat" ke /tema/{themeSlug}' },
          emitenCount: { type: 'integer', description: 'Emiten tercatat (tanpa yang masih IPO)' },
          leaders: { type: 'array', items: { $ref: '#/components/schemas/Leader' }, description: 'Maks. 3, market cap terbesar dulu. "+n" = emitenCount − leaders.length' },
        },
      },
      SectorSummary: {
        type: 'object',
        properties: {
          slug: { type: 'string', example: 'energi' },
          name: { type: 'string', example: 'Energi' },
          icon: { type: 'string', nullable: true, example: 'bolt' },
          status: { $ref: '#/components/schemas/DataStatus' },
          updatedAt: { type: 'string', format: 'date-time', nullable: true, description: '"diperbarui 3 Nov"' },
          subsectorCount: { type: 'integer' },
          industryCount: { type: 'integer' },
          emitenCount: { type: 'integer', description: 'Emiten tercatat (tanpa yang masih IPO)' },
          leaders: { type: 'array', items: { $ref: '#/components/schemas/Leader' } },
          industryNames: { type: 'array', items: { type: 'string' } },
        },
      },
      SectorDetail: {
        allOf: [
          { $ref: '#/components/schemas/SectorSummary' },
          {
            type: 'object',
            properties: {
              subsectors: {
                type: 'array',
                items: { type: 'object', properties: { name: { type: 'string', example: 'Minyak, Gas & Batu Bara' }, industries: { type: 'array', items: { $ref: '#/components/schemas/Industry' } } } },
              },
            },
          },
        ],
      },
      SectorNotice: {
        type: 'object',
        nullable: true,
        properties: {
          industrySlug: { type: 'string' },
          industryName: { type: 'string', example: 'Batu Bara' },
          note: { type: 'string', example: 'diperbarui dari laporan keuangan Q3 2026' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      NotificationPrefs: {
        type: 'object',
        description: 'Kunci: thesis_eval, ticket_reply, report_published, data_delayed, ipo, theme_update, feature',
        additionalProperties: { type: 'object', properties: { inApp: { type: 'boolean' }, email: { type: 'boolean' } } },
        example: { thesis_eval: { inApp: true, email: true }, ipo: { inApp: true, email: false } },
      },
      PrefsBody: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['id'], description: 'English belum tersedia' },
          numberFormat: { type: 'string', enum: ['short', 'full'] },
          glossary: { type: 'boolean' },
          buyFeePct: { type: 'number', minimum: 0, maximum: 10, example: 0.15 },
          sellFeePct: { type: 'number', minimum: 0, maximum: 10, example: 0.25 },
          defaultEvalEvery: { type: 'integer', enum: [3, 6, 12] },
          notifications: { $ref: '#/components/schemas/NotificationPrefs' },
        },
      },
      ProfileBody: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 100, example: 'Budi Santoso' },
          experience: { type: 'string', enum: ['Baru mulai', '< 1 tahun', '1–3 tahun', '> 3 tahun'] },
          horizon: { type: 'string', enum: ['1–3 tahun', '3–5 tahun', 'Lebih dari 5 tahun'] },
          interestedThemes: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 60 } },
        },
      },
      PasswordBody: {
        type: 'object',
        required: ['currentPassword', 'newPassword', 'confirmPassword'],
        properties: {
          currentPassword: { type: 'string', format: 'password' },
          newPassword: { type: 'string', format: 'password', description: 'Min. 8 karakter, huruf dan angka' },
          confirmPassword: { type: 'string', format: 'password' },
        },
      },
      DeviceSession: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          device: { type: 'string', example: 'Chrome di macOS' },
          ip: { type: 'string', example: '103.10.1.2' },
          lastActiveAt: { type: 'string', format: 'date-time' },
          current: { type: 'boolean', description: 'true untuk perangkat ini ("Perangkat ini")' },
        },
      },
      User: user,
      RegisterBody: {
        type: 'object',
        required: ['name', 'email', 'password', 'agreeTerms', 'agreeNotAdvice'],
        properties: {
          name: { type: 'string', maxLength: 100, example: 'Bil' },
          email: { type: 'string', format: 'email', maxLength: 254, example: 'bil@contoh.com' },
          password: { type: 'string', format: 'password', minLength: 8, maxLength: 128, description: 'Min. 8 karakter, ada huruf besar dan angka', example: 'Rahasia123' },
          agreeTerms: { type: 'boolean', description: 'Harus true (Syarat layanan)' },
          agreeNotAdvice: { type: 'boolean', description: 'Harus true (paham bukan saran investasi)' },
        },
      },
      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'bil@contoh.com' },
          password: { type: 'string', format: 'password', example: 'Rahasia123' },
          remember: { type: 'boolean', default: true, description: '"Ingat saya di perangkat ini"' },
        },
      },
      Admin: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', example: 'admin@stockplan.id' },
          role: { type: 'string', enum: ['super', 'data', 'tema', 'support', 'view'] },
        },
      },
      AdminCompanyRow: {
        type: 'object',
        properties: {
          ticker: { type: 'string', example: 'BUMI' }, name: { type: 'string' }, logoUrl: { type: 'string', nullable: true },
          sector: { type: 'object', nullable: true, properties: { slug: { type: 'string' }, name: { type: 'string' } } },
          completeness: { type: 'object', properties: { done: { type: 'integer', example: 4 }, total: { type: 'integer', example: 5 }, missing: { type: 'array', items: { type: 'string' }, example: ['Sumber pendapatan'] } } },
          theme: { type: 'string', example: 'Batubara · 2 tahap', description: '"Belum dipetakan" bila belum masuk tema' },
          status: { type: 'string', enum: ['ok', 'review', 'draft', 'new'] }, statusLabel: { type: 'string', example: 'Perlu ditinjau' },
          reportCount: { type: 'integer', description: 'Laporan pengguna; selalu 0 sampai modul Masukan ada' },
          hasDraft: { type: 'boolean' }, updatedAt: { type: 'string', format: 'date-time' }, updatedBy: { type: 'string', example: 'Sistem' },
        },
      },
      AdminCompanyForm: {
        type: 'object',
        description: 'Bagian form (semua opsional pada PATCH; bagian tak dikenal ditolak). Uang dalam Rupiah utuh, persen sebagai angka. `ipo` hanya untuk emiten berstatus ipo (pada GET bernilai null untuk emiten biasa). Logo, laporan keuangan (XBRL/PDF), dan prospektus belum ada (belum ada penyimpanan file).',
        properties: {
          ticker: { type: 'string', description: 'Hanya pada POST; tidak bisa diubah setelahnya' },
          name: { type: 'string' }, sectorSlug: { type: 'string', example: 'energi' }, subsector: { type: 'string', example: 'Batu bara' },
          trading: { type: 'object', properties: { state: { type: 'string', enum: ['active', 'suspended', 'monitoring', 'delisted'] }, since: { type: 'string', format: 'date', nullable: true }, source: { type: 'string' }, reason: { type: 'string' } } },
          keyNumbers: { type: 'object', properties: { marketCap: { type: 'number', nullable: true, example: 44900000000000 }, pbv: { type: 'number', nullable: true }, roePct: { type: 'number', nullable: true }, grossMarginPct: { type: 'number', nullable: true }, debtToAssetPct: { type: 'number', nullable: true }, tips: { type: 'object', additionalProperties: { type: 'string' } }, priceDate: { type: 'string', format: 'date', nullable: true }, financialPeriod: { type: 'string', example: 'H1-2026' }, asOfSource: { type: 'string' } } },
          summary: { type: 'object', properties: { short: { type: 'string', description: 'Terbit: 1–100 karakter' }, overview: { type: 'string', description: 'Terbit: 1–400 karakter, `**tebal**` didukung' }, source: { type: 'string' } } },
          points: { type: 'object', properties: { strengths: { type: 'array', items: { type: 'string' } }, weaknesses: { type: 'array', items: { type: 'string' } }, watchItems: { type: 'array', items: { type: 'string' } } }, description: 'Terbit: 1–5 poin per daftar, maks. 60 karakter' },
          trend: { type: 'object', properties: { periods: { type: 'array', items: { type: 'object', properties: { label: { type: 'string', example: 'H1-2026' }, span: { type: 'string', example: '6 bulan' } } } }, revenue: { $ref: '#/components/schemas/AdminSeries' }, netIncome: { $ref: '#/components/schemas/AdminSeries' }, grossMarginPct: { $ref: '#/components/schemas/AdminSeries' } } },
          revenueSources: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, pct: { type: 'number' }, source: { type: 'string' } } }, description: 'Terbit: total tepat 100% dan tiap segmen punya sumber' },
          group: { type: 'object', properties: { name: { type: 'string' }, subsidiaries: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, business: { type: 'string' }, ownershipPct: { type: 'number' }, ticker: { type: 'string' }, show: { type: 'boolean' } } } } } },
          shareholders: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, pct: { type: 'number' } } } }, note: { type: 'string' } }, description: 'Free float dihitung otomatis (100% − total), tidak dikirim' },
          management: { type: 'object', properties: { people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' } } } } } },
          risks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, level: { type: 'string', enum: ['high', 'medium', 'low'] } } } },
          news: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, source: { type: 'string' }, dateLabel: { type: 'string' } } } },
          ipo: { type: 'object', nullable: true, properties: {
            board: { type: 'string', enum: ['utama', 'pengembangan', 'akselerasi', 'baru'] },
            schedule: { type: 'object', description: 'Tanggal ISO atau null; urutan tidak boleh mundur; `listing` wajib untuk terbit', properties: { bookbuildingStart: { type: 'string', nullable: true }, bookbuildingEnd: { type: 'string', nullable: true }, effective: { type: 'string', nullable: true }, offerStart: { type: 'string', nullable: true }, offerEnd: { type: 'string', nullable: true }, allotment: { type: 'string', nullable: true }, listing: { type: 'string', nullable: true } } },
            priceLow: { type: 'number', nullable: true }, priceHigh: { type: 'number', nullable: true }, priceFinal: { type: 'number', nullable: true, description: 'Harus di dalam rentang bookbuilding' },
            sharesOffered: { type: 'number', nullable: true }, publicPct: { type: 'number', nullable: true },
            underwriters: { type: 'array', items: { type: 'string' } },
            warrant: { type: 'object', properties: { enabled: { type: 'boolean' }, ratio: { type: 'string' }, price: { type: 'number', nullable: true } } },
            useOfProceeds: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, pct: { type: 'number' } } }, description: 'Terbit: total tepat 100%' },
            showUpcoming: { type: 'boolean' }, autoConvert: { type: 'boolean' },
          } },
        },
      },
      AdminSeries: { type: 'object', properties: { values: { type: 'array', items: { type: 'number', nullable: true }, description: 'Sejajar dengan `periods`' }, note: { type: 'string' } } },
      AdminCompanyEdit: {
        type: 'object',
        properties: {
          company: { type: 'object', properties: { ticker: { type: 'string' }, status: { type: 'string', enum: ['listed', 'ipo', 'suspended'] }, logoUrl: { type: 'string', nullable: true } } },
          publishStatus: { type: 'object', properties: { key: { type: 'string', enum: ['draft', 'review', 'published'] }, label: { type: 'string', example: 'Draf tersimpan' } } },
          published: { type: 'boolean', description: 'false = belum pernah terbit, tidak terlihat customer' }, hasDraft: { type: 'boolean' },
          form: { $ref: '#/components/schemas/AdminCompanyForm' },
          sections: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } } } },
          progress: { type: 'object', properties: { done: { type: 'integer' }, total: { type: 'integer' }, percent: { type: 'integer' } } },
          canPublish: { type: 'boolean' },
          themes: { type: 'array', description: 'Hanya baca; dikelola modul Tema', items: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' }, stageCount: { type: 'integer' } } } },
          reports: { type: 'array', items: { type: 'object' }, description: 'Laporan pengguna; selalu kosong sampai modul Masukan ada' },
          updatedAt: { type: 'string', format: 'date-time' }, updatedBy: { type: 'string' },
        },
      },
      AdminUserRow: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string' },
          status: { type: 'string', enum: ['act', 'new', 'idle', 'sus'] }, statusLabel: { type: 'string', example: 'Aktif' },
          lastActiveAt: { type: 'string', format: 'date-time', nullable: true, description: 'null = "Belum pernah masuk"' },
          theses: { type: 'integer', description: 'Selalu 0 sampai modul Tesis ada' },
          plan: { type: 'object', properties: { key: { type: 'string', enum: ['y', 'm', 'n'] }, label: { type: 'string', example: 'Tahunan' } } },
          joinedAt: { type: 'string', format: 'date-time' },
        },
      },
      AdminUserDetail: {
        allOf: [{ $ref: '#/components/schemas/AdminUserRow' }, {
          type: 'object',
          properties: {
            account: { type: 'object', properties: { joinedAt: { type: 'string', format: 'date-time' }, loginMethod: { type: 'string', example: 'Email' }, emailVerified: { type: 'boolean' }, subscription: { type: 'string', example: 'Akses beta · gratis' }, planInterest: { type: 'string', example: 'Tahunan · Rp790.000/tahun · minta diingatkan' } } },
            usage: { type: 'object', properties: { theses: { type: 'integer' }, evaluations: { type: 'integer' }, watchlist: { type: 'integer' }, themesOpened: { type: 'integer', nullable: true } } },
            recentLogins: { type: 'array', description: 'Maks. 3, dari sesi yang masih ada', items: { type: 'object', properties: { device: { type: 'string', example: 'Chrome · Windows' }, at: { type: 'string', format: 'date-time' } } } },
            feedback: { type: 'array', items: { type: 'object' }, description: 'Laporan & masukan; selalu kosong sampai modul Masukan ada' },
            suspension: { type: 'object', nullable: true, properties: { at: { type: 'string', format: 'date-time' }, reason: { type: 'string' }, note: { type: 'string' }, by: { type: 'string', nullable: true } } },
            actions: { type: 'object', properties: { resendConfirmation: { type: 'boolean' }, resetPassword: { type: 'boolean' }, suspend: { type: 'boolean' }, restore: { type: 'boolean' } } },
          },
        }],
      },
      AdminThemeRow: {
        type: 'object',
        properties: {
          slug: { type: 'string' }, name: { type: 'string' },
          sector: { type: 'object', nullable: true, properties: { slug: { type: 'string' }, name: { type: 'string' } } },
          chain: { type: 'array', description: 'Satu titik per tahap, warna tahap utamanya', items: { type: 'object', properties: { group: { type: 'string', nullable: true }, color: { type: 'string' } } } },
          stageCount: { type: 'integer' },
          readiness: { type: 'object', properties: { ready: { type: 'integer' }, total: { type: 'integer' }, percent: { type: 'integer' } } },
          status: { type: 'string', enum: ['open', 'draft', 'review'] }, statusLabel: { type: 'string' },
          hasDraft: { type: 'boolean' }, published: { type: 'boolean' }, theses: { type: 'integer', nullable: true },
          updatedAt: { type: 'string', format: 'date-time' }, updatedBy: { type: 'string' },
        },
      },
      AdminThemeForm: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Terbit: ≥ 3 huruf' }, sectorSlug: { type: 'string', example: 'energi' },
          description: { type: 'string', description: 'Terbit: 1–160 karakter' },
          drivers: { type: 'array', items: { type: 'string' }, description: 'Penggerak utama; terbit: ≥ 1' },
          groups: { type: 'array', description: 'Tahap utama; terbit: judul ≤ 20, deskripsi 1–80', items: { type: 'object', properties: {
            key: { type: 'string', example: 'hulu', description: '[a-z0-9-], unik; dirujuk stages[].groupKey' }, title: { type: 'string' }, description: { type: 'string' },
            icon: { type: 'string', enum: ['mine', 'truck', 'bolt', 'factory', 'ship', 'leaf', 'drop', 'store', 'coin'] },
            color: { type: 'string', enum: ['amber', 'blue', 'green', 'violet', 'rose', 'teal', 'stone'] },
          } } },
          stages: { type: 'array', description: 'Urutan = urutan tahap. Terbit: nama, deskripsi 1–90, tahap utama valid, ≥ 1 emiten', items: { type: 'object', properties: {
            name: { type: 'string' }, groupKey: { type: 'string' }, description: { type: 'string' },
            rows: { type: 'array', items: { type: 'object', properties: { ticker: { type: 'string', example: 'BUMI' }, pct: { type: 'number', nullable: true, description: 'Porsi pendapatan dari tahap ini' }, source: { type: 'string', example: 'LK 2025, Catatan 34' } } } },
          } } },
        },
      },
      AdminThemeEdit: {
        type: 'object',
        properties: {
          theme: { type: 'object', properties: { slug: { type: 'string' }, status: { type: 'string', enum: ['draft', 'review', 'published'] }, statusLabel: { type: 'string' }, published: { type: 'boolean' }, hasDraft: { type: 'boolean' } } },
          form: { $ref: '#/components/schemas/AdminThemeForm' },
          stats: { type: 'object', properties: { stageCount: { type: 'integer' }, companyCount: { type: 'integer' }, theses: { type: 'integer', nullable: true } } },
          companies: { type: 'array', items: { type: 'object', properties: { ticker: { type: 'string' }, name: { type: 'string' }, logoUrl: { type: 'string', nullable: true }, ready: { type: 'boolean' }, statusLabel: { type: 'string' }, reason: { type: 'string' } } } },
          notReady: { type: 'array', items: { type: 'object' }, description: 'Subset `companies` yang belum siap' },
          multiStage: { type: 'array', items: { type: 'object', properties: { ticker: { type: 'string' }, parts: { type: 'array', items: { type: 'object', properties: { stage: { type: 'integer' }, pct: { type: 'number', nullable: true } } } }, total: { type: 'number' }, ok: { type: 'boolean' }, note: { type: 'string', example: 'OK · sisanya di luar tema' } } } },
          readiness: { type: 'object', properties: { ready: { type: 'integer' }, total: { type: 'integer' }, percent: { type: 'integer' } } },
          checks: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } } } },
          canPublish: { type: 'boolean' },
          history: { type: 'array', items: { type: 'object', properties: { action: { type: 'string', example: 'theme_draft_saved' }, by: { type: 'string' }, at: { type: 'string', format: 'date-time' } } } },
          updatedAt: { type: 'string', format: 'date-time' }, updatedBy: { type: 'string' },
        },
      },
      AdminMember: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string' }, me: { type: 'boolean', description: '"Anda"' },
          role: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
          roleLocked: { type: 'boolean' }, roleLockReason: { type: 'string', nullable: true, example: 'Super admin terakhir' },
          twoFactor: { type: 'string', enum: ['active', 'pending', 'off'], description: 'active = ✓ Aktif, pending = Belum diatur (undangan), off = ✕ Belum' },
          lastLogin: { type: 'object', nullable: true, properties: { at: { type: 'string', format: 'date-time' }, device: { type: 'string', example: 'Chrome · Windows' } } },
          failedToday: { type: 'integer', description: '"3 gagal masuk pagi ini"' },
          status: { type: 'string', enum: ['active', 'invited', 'disabled'] }, statusLabel: { type: 'string' },
          invite: { type: 'object', nullable: true, properties: { sentAt: { type: 'string', format: 'date-time' }, expiresAt: { type: 'string', format: 'date-time' }, expired: { type: 'boolean' }, by: { type: 'string', nullable: true } } },
          disabledAt: { type: 'string', format: 'date-time', nullable: true },
          actions: { type: 'object', properties: { deactivate: { type: 'boolean' }, resendInvite: { type: 'boolean' }, reactivate: { type: 'boolean' } } },
        },
      },
      AdminRole: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'data' }, name: { type: 'string' }, summary: { type: 'string', nullable: true }, description: { type: 'string', nullable: true },
          system: { type: 'boolean', description: 'Peran bawaan' }, locked: { type: 'boolean', description: 'true hanya untuk super' }, memberCount: { type: 'integer' },
          perms: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string', enum: ['view', 'edit', 'publish', 'delete'] } }, example: { em: ['view', 'edit'] } },
          sensitive: { type: 'array', items: { type: 'string' }, description: 'Modul sensitif dengan izin selain Lihat' },
        },
      },
      AdminRoleBody: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 60 }, summary: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 300 },
          perms: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string', enum: ['view', 'edit', 'publish', 'delete'] } } },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION' },
              message: { type: 'string' },
              fields: { type: 'object', additionalProperties: { type: 'string' }, description: 'Pesan per field (422/409)' },
            },
          },
        },
      },
    },
  },
};
