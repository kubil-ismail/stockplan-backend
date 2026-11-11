'use strict';

// Editorial data for the Batubara theme page (design/screens/TemaDetail.dc.html): "Pembeda utama" (tagline),
// market cap per 16 Okt 2026, and the drawer's key stats, insight, revenue mix and subsidiaries
// (profile.highlights). Illustrative numbers from the design, not official BEI data.
// Only fills tagline/marketCap/priceDate where empty, so values seeded earlier (e.g. BUMI) win.
const T = 1e12;
const PRICE_DATE = '2026-10-16';

const D = {
  UNTR: { tagline: 'Kontraktor lewat PAMA', marketCap: 79.03 * T, highlights: {
    stats: [{ value: '18,8 juta ton', label: 'Target jual batu bara 2026' }, { value: 'Jasa', label: 'Dibayar kontrak, bukan jual batu bara sendiri' }],
    insight: 'Pendapatan UNTR dari batu bara mengikuti volume kerja kontraktornya, bukan harga batu bara secara langsung — beda sensitivitas dibanding pemilik tambang.',
    revenueMix: [{ label: 'Jasa pertambangan (PAMA)', pct: 62 }, { label: 'Alat berat & suku cadang', pct: 38 }],
    subsidiaries: ['Pamapersada Nusantara'] } },
  DOID: { tagline: 'Induk BUMA', highlights: { subsidiaries: ['Bukit Makmur Mandiri Utama (BUMA)'] } },
  PTRO: { tagline: 'Kontraktor + engineering' },
  DEWA: { tagline: 'Kontraktor Grup Bakrie' },
  ABMM: { tagline: 'Terintegrasi 3 tahap', highlights: {
    insight: 'ABMM dapat pendapatan dari tiga sisi — jasa kontraktor, penjualan batu bara sendiri, dan logistik — jadi sensitivitasnya ke harga batu bara campuran.' } },
  BUMI: { tagline: 'Produsen terbesar RI', highlights: {
    stats: [{ value: '80 juta ton', label: 'Target produksi 2025' }, { value: '#1', label: 'Produsen batu bara termal terbesar RI' }],
    insight: 'Sebagai produsen volume terbesar, kinerja BUMI relatif lebih sensitif ke harga batu bara acuan dibanding emiten kalori tinggi seperti ITMG.',
    revenueMix: [{ label: 'Penjualan batu bara ekspor', pct: 52 }, { label: 'Penjualan domestik', pct: 48 }],
    subsidiaries: ['Kaltim Prima Coal', 'Arutmin Indonesia'] } },
  AADI: { highlights: {
    stats: [{ value: '2024', label: 'Tahun spin-off dari Adaro Energy' }, { value: 'Termal', label: 'Fokus tambang & logistik batu bara' }],
    insight: 'Sebagai entitas baru hasil spin-off, rekam jejak keuangan independennya masih pendek — perlu dicek laporan triwulanannya sendiri.',
    revenueMix: [{ label: 'Penjualan batu bara termal', pct: 72 }, { label: 'Jasa logistik & pelabuhan', pct: 28 }],
    subsidiaries: ['Adaro Logistics'] } },
  BYAN: { tagline: 'Biaya produksi rendah' },
  ITMG: { highlights: {
    stats: [{ value: '~75%', label: 'Volume penjualan diekspor' }, { value: '±34%', label: 'Porsi ekspor ke China, pembeli terbesar' }],
    insight: 'Fokus ekspor bikin ITMG lebih terekspos ke permintaan pasar global (terutama China) dan harga batu bara kalori tinggi, bukan kebijakan DMO domestik.',
    revenueMix: [{ label: 'Ekspor batu bara', pct: 75 }, { label: 'Penjualan domestik', pct: 25 }],
    subsidiaries: ['Indominco Mandiri', 'Trubaindo Coal Mining'] } },
  PTBA: { highlights: {
    stats: [{ value: '>50%', label: 'Porsi penjualan DMO ke PLN' }, { value: 'BUMN', label: 'Di bawah holding MIND ID' }],
    insight: 'Kewajiban DMO ke PLN bikin sebagian pendapatan PTBA relatif stabil, tapi harga jual domestiknya biasanya di bawah harga ekspor.',
    revenueMix: [{ label: 'Penjualan ke PLN (DMO)', pct: 55 }, { label: 'Komersial & ekspor', pct: 45 }],
    subsidiaries: ['Bukit Asam Prima'] } },
  GEMS: { tagline: 'Grup Sinar Mas' },
  INDY: { highlights: {
    stats: [{ value: '50%', label: 'Target pendapatan dari non-batubara' }, { value: 'EV', label: 'Masuk ke bisnis kendaraan listrik' }],
    insight: 'INDY makin bergantung pada bisnis non-batubara, jadi performanya nggak lagi murni cerminan harga batu bara.',
    revenueMix: [{ label: 'Pembangkit listrik & tambang', pct: 50 }, { label: 'Bisnis non-batubara (EV, energi baru)', pct: 50 }],
    subsidiaries: ['Indika Indonesia Resources'] } },
  HRUM: { tagline: 'Ekspansi ke nikel' },
  BSSR: { tagline: 'Fokus ekspor' },
  DSSA: { tagline: 'Tambang + pembangkit', highlights: {
    insight: 'Karena punya tambang dan pembangkit sekaligus, sebagian risiko harga batu bara di DSSA saling mengimbangi antar lini bisnis.',
    subsidiaries: ['Golden Energy Mines (GEMS)'] } },
  TOBA: { tagline: 'Transisi ke EBT', highlights: {
    insight: 'Pendapatan TOBA masih dari batu bara, tapi arah investasinya sudah ke energi terbarukan — cek porsi tiap lini di laporan terbaru.' } },
  MBAP: { tagline: 'Tambang di Kaltara' },
  KKGI: { tagline: 'Skala menengah' },
  ADMR: { tagline: 'Batu bara metalurgi', marketCap: 68.89 * T, highlights: {
    stats: [{ value: 'Metalurgi', label: 'Jenis batu bara: coking coal' }, { value: 'Smelter', label: 'Lagi bangun proyek hilirisasi aluminium' }],
    insight: 'Harga coking coal bergerak beda dari batu bara termal biasa, jadi ADMR nggak selalu searah dengan BUMI/ITMG/PTBA.',
    revenueMix: [{ label: 'Batu bara metalurgi', pct: 70 }, { label: 'Proyek hilirisasi aluminium', pct: 30 }] } },
  TCPI: { tagline: 'Kapal & tongkang' },
  PSSI: { tagline: 'Logistik laut' },
};

module.exports = {
  async up(queryInterface) {
    for (const [ticker, d] of Object.entries(D)) {
      await queryInterface.sequelize.query(
        `UPDATE market_companies SET
           tagline = COALESCE(tagline, :tagline),
           "marketCap" = COALESCE("marketCap", :marketCap),
           "priceDate" = CASE WHEN "priceDate" IS NULL AND COALESCE("marketCap", :marketCap) IS NOT NULL THEN CAST(:priceDate AS DATE) ELSE "priceDate" END,
           profile = CASE WHEN CAST(:highlights AS JSONB) IS NULL THEN profile ELSE profile || jsonb_build_object('highlights', CAST(:highlights AS JSONB)) END,
           "updatedAt" = NOW()
         WHERE ticker = :ticker`,
        { replacements: { ticker, tagline: d.tagline || null, marketCap: d.marketCap || null, priceDate: PRICE_DATE, highlights: d.highlights ? JSON.stringify(d.highlights) : null } },
      );
    }
  },

  async down(queryInterface) {
    for (const [ticker, d] of Object.entries(D)) {
      await queryInterface.sequelize.query(
        `UPDATE market_companies SET
           tagline = CASE WHEN tagline = :tagline THEN NULL ELSE tagline END,
           "marketCap" = CASE WHEN "marketCap" = :marketCap THEN NULL ELSE "marketCap" END,
           "priceDate" = CASE WHEN "priceDate" = CAST(:priceDate AS DATE) THEN NULL ELSE "priceDate" END,
           profile = profile - 'highlights'
         WHERE ticker = :ticker`,
        { replacements: { ticker, tagline: d.tagline || '', marketCap: d.marketCap || -1, priceDate: PRICE_DATE } },
      );
    }
  },
};
