# Tempel bagian ini ke CLAUDE.md di root repo

## StockPlan — acuan design
- Sumber keputusan UI: `docs/design-handoff/HANDOFF.md`. Baca bagian yang relevan sebelum mengerjakan layar apa pun.
- Setiap layar punya tiga acuan: `design/screenshots/<Board>.jpg` (visual), `design/screens/<Board>.dc.html` (copy, spacing, state), dan baris di HANDOFF §5 (route + file target). Indeks lengkap ada di `design/screens.json`.
- Kalau ada yang bertentangan, urutannya: HANDOFF.md > .dc.html > screenshot.
- Jangan menyalin runtime `.dc.html` (`<x-dc>`, `sc-for`, `sc-if`, `DCLogic`). Tulis ulang sebagai komponen React + Tailwind + shadcn/ui.
- Token warna/radius di `tokens/tokens.css`. Jangan pakai hex baru di luar token.
- Larangan produk (HANDOFF §1.1): tidak ada beli/jual, harga realtime, prediksi, atau rekomendasi.
- Copy berbahasa Indonesia, sapaan "Anda", huruf kapital hanya di awal kalimat. Jangan mengarang copy; tandai `// COPY: perlu review` bila terpaksa.
- Data contoh untuk seed/dev: `fixtures/*.json`. Tipe: `spec/types.ts`.
- Kerjakan per fase (HANDOFF §11) dan cek "Selesai kalau" sebelum lanjut.
