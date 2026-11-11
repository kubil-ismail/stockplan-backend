# StockPlan Backend

Express + Sequelize + PostgreSQL REST API untuk aplikasi StockPlan.

- **Status, keputusan, dan daftar pekerjaan berikutnya: `docs/HANDOFF.md`.** Baca sebelum mengerjakan apa pun, dan perbarui setelah menambah endpoint, tabel, atau shortcut.
- Acuan produk & design: `stockplan-app-handoff/HANDOFF.md` (+ `design/screens/*.dc.html` untuk copy dan data contoh). Urutan prioritas: HANDOFF design > .dc.html > screenshot.
- Larangan produk: tidak ada beli/jual/order, harga realtime, prediksi, atau rekomendasi.
- Pola: `routes/` → `controllers/` → `models/`; logika murni + validasi di `lib/` dengan test `lib/*.test.js`.
- Nama tabel `<domain>_<jamak>` (`auth_`, `theme_`, `market_`, `watchlist_`, …) lewat `tableName`. Tabel milik user wajib `ON DELETE CASCADE`.
- Error: `fail()` dari `lib/http.js` → `{ error: { code, message, fields? } }`.
- Copy Bahasa Indonesia persis dari design; yang dikarang ditandai `// COPY: perlu review`.
- Setiap endpoint baru juga masuk `docs/openapi.js` (Swagger di `/docs`).
- Perintah: `npm run dev`, `npm test`, `npm run migrate`, `npx sequelize-cli db:seed:all`.
