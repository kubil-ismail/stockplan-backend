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
  tags: [{ name: 'Auth' }, { name: 'Profil' }, { name: 'Pengaturan' }, { name: 'Tema bisnis' }, { name: 'Emiten' }, { name: 'Watchlist' }, { name: 'Admin: Auth' }],
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
        summary: 'Admin yang sedang masuk',
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { admin: { $ref: '#/components/schemas/Admin' } } } } } }, 401: errorResponse('Belum masuk / sesi berakhir', 'UNAUTHENTICATED', 'Sesi admin berakhir. Masuk lagi.') },
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
