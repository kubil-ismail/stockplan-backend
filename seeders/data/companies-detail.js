'use strict';

// Full page data for the two design examples: BUMI (design/screens/Emiten.dc.html) and ABNU (EmitenIPO.dc.html).
// Real people's names are replaced with placeholders (HANDOFF §1.3). ABNU is a fictional example with illustrative numbers.
const T = 1e12;
const M = 1e9;

module.exports = {
  BUMI: {
    marketCap: 44.9 * T,
    metrics: { pbv: 1.5, roePct: 7, grossMarginPct: 17, debtToAssetPct: 36 },
    listingBoard: 'Utama',
    listedYear: 1990,
    groupName: 'Grup Bakrie',
    financialPeriod: 'H1-2026',
    priceDate: '2026-10-29',
    profile: {
      overview: 'BUMI adalah induk tambang batu bara termal Grup Bakrie dan **produsen batu bara terbesar di Indonesia berdasarkan volume**. Uangnya hampir seluruhnya datang dari menjual batu bara termal (bahan bakar PLTU) yang ditambang dua anak usahanya, KPC dan Arutmin — jadi kinerjanya mengikuti harga batu bara termal dunia.',
      strengths: ['Skala terbesar di RI', 'Neraca sudah sehat (utang/aset 36%)', 'Margin bruto naik 8% → 17%'],
      weaknesses: ['ROE cuma 7%', '~44% ekuitas milik minoritas anak usaha', 'Laba kecil dibanding skala'],
      watchItems: ['Liabilitas naik Rp7 T di H1-2026', 'Harga batu bara termal', 'Aksi korporasi soal porsi KPC'],
      financials: {
        source: 'XBRL BEI',
        periods: [{ label: '2023', span: 'setahun' }, { label: '2024', span: 'setahun' }, { label: '2025', span: 'setahun' }, { label: 'H1-2026', span: '6 bulan' }],
        revenue: {
          values: [25.9 * T, 22.0 * T, 24.1 * T, 15.5 * T],
          note: 'Penjualan stabil di Rp22–26 T per tahun — bisnis matang bervolume besar, bukan pertumbuhan cepat. H1-2026 baru 6 bulan, jadi belum setara setahun penuh.',
        },
        netIncome: {
          values: [0.2 * T, 1.1 * T, 1.4 * T, 1.1 * T],
          note: 'Laba milik pemegang saham induk naik dari Rp0,2 T ke Rp1,4 T, dan 6 bulan pertama 2026 sudah Rp1,1 T. Tapi tetap kecil dibanding penjualan Rp24 T — sebagian besar laba KPC mengalir ke minoritas.',
        },
        grossMarginPct: {
          values: [8, 12, 17, 17],
          note: 'Ceritanya di sini: pendorong laba bukan volume, melainkan margin yang membaik seiring pemulihan harga batu bara dan pengendalian biaya.',
        },
      },
      subsidiaries: [
        { name: 'Kaltim Prima Coal (KPC)', business: 'Tambang batu bara termal, Kalimantan Timur', ownershipPct: 50.99 },
        { name: 'Arutmin Indonesia', business: 'Tambang batu bara termal, Kalimantan Selatan', ownershipPct: 90 },
        { name: 'Pendopo Energi Batubara', business: 'Konsesi batu bara', ownershipPct: 84.48 },
        { name: 'IndoCoal Resources', business: 'Perusahaan investasi grup batu bara', ownershipPct: 70 },
        { name: 'Bumi Resources Minerals', business: 'Tambang emas & mineral', ownershipPct: 20.09, ticker: 'BRMS' },
        { name: 'Darma Henwa', business: 'Kontraktor tambang (Tahap 1 rantai nilai)', ownershipPct: 12.44, ticker: 'DEWA' },
      ],
      shareholders: {
        items: [
          { name: 'Mach Energy (Hongkong) Ltd', pct: 45.78, public: false },
          { name: 'Publik (free float)', pct: 54.22, public: true },
        ],
        note: 'Free float besar, tapi pemilik akhir di balik Mach Energy tidak bisa ditelusuri dari data BEI.',
      },
      management: {
        total: 12,
        people: [
          { name: '[Nama presiden komisaris]', role: 'Presiden Komisaris' },
          { name: '[Nama presiden direktur]', role: 'Presiden Direktur' },
          { name: '[Nama wakil presiden direktur]', role: 'Wakil Presiden Direktur' },
        ],
      },
      risks: [
        { title: 'Harga batu bara termal', description: 'Komoditas siklikal, paling terpapar transisi energi dibanding batu bara metalurgi.', level: 'high' },
        { title: 'Porsi minoritas besar', description: '44% ekuitas dan hampir separuh laba KPC milik minoritas; sulit berubah tanpa aksi korporasi.', level: 'high' },
        { title: 'Imbal hasil rendah', description: 'ROE 7% walau skala besar; perbaikan masih bergantung harga komoditas.', level: 'medium' },
        { title: 'Utang naik lagi', description: 'Liabilitas +Rp7 T di H1-2026; kalau berlanjut, hasil deleveraging bisa terkikis.', level: 'medium' },
        { title: 'Tata kelola', description: 'Rekam jejak krisis utang grup; pemilik akhir di balik Mach Energy kurang transparan.', level: 'medium' },
        { title: 'Cadangan & regulasi', description: 'Umur tambang KPC/Arutmin, royalti, DMO, dan kebijakan hilirisasi.', level: 'medium' },
      ],
      news: [
        { title: 'BUMI targetkan jual 76–78 juta ton batu bara di 2026, naik dari target 2025 (73–75 juta ton)', source: 'Laporan keuangan BUMI', dateLabel: '30 Mar 2026' },
        { title: 'Produksi semester I 2025 tercatat 35,9 juta ton — KPC 25,3 juta ton, Arutmin 10,6 juta ton', source: 'Data operasional BUMI', dateLabel: 'H1 2025' },
        { title: 'Laporan Analisis Saham BUMI: margin bruto naik ke 17%, ROE masih tertahan di 7%', source: 'StockPlan', dateLabel: '30 Okt 2026' },
      ],
      reports: [
        { title: 'Laporan Analisis Saham: BUMI', date: '2026-10-30', pages: 6, contents: 'profil, keuangan, nilai wajar, skenario, risiko', url: null },
      ],
      sourceNote: 'Sumber: laporan keuangan XBRL BEI (2023–H1 2026), dokumen BEI, dan rilis produksi perseroan. Bukan rekomendasi saham.',
    },
  },

  ABNU: {
    name: 'Andalan Baterai Nusantara Tbk',
    sector: 'Barang baku',
    status: 'ipo',
    listingBoard: 'Utama',
    summary: 'Mengolah bijih nikel kadar rendah di Morowali menjadi MHP, bahan baku katoda baterai kendaraan listrik.',
    profile: {
      overview: 'ABNU mengolah bijih nikel kadar rendah dari tambangnya di Morowali menjadi **MHP (mixed hydroxide precipitate)**, bahan baku utama katoda baterai kendaraan listrik. Hampir seluruh pendapatannya datang dari menjual MHP ke produsen prekursor baterai, jadi kinerjanya mengikuti harga nikel dunia dan permintaan baterai EV.',
      strengths: ['Bijih dari tambang sendiri', 'Produknya dibutuhkan rantai baterai EV', 'Margin bruto naik 18% → 23%'],
      weaknesses: ['Satu produk, satu lokasi', 'Belum punya rekam jejak sebagai emiten', 'Pembeli terkonsentrasi'],
      watchItems: ['Smelter HPAL tahap 2 selesai tepat waktu', 'Harga nikel dunia', 'Laporan keuangan pertama setelah IPO'],
      risks: [
        { title: 'Harga nikel', description: 'Pendapatan hampir seluruhnya dari MHP, yang harganya mengikuti nikel dunia.', level: 'high' },
        { title: 'Proyek smelter tahap 2', description: '65% dana IPO ke proyek ini. Kalau terlambat atau biayanya membengkak, tambahan kapasitas ikut mundur.', level: 'high' },
        { title: 'Pembeli terkonsentrasi', description: 'Sebagian besar penjualan ke segelintir produsen prekursor baterai.', level: 'medium' },
        { title: 'Saham baru tercatat', description: 'Belum ada riwayat harga dan likuiditas; pergerakan harga awal sering lebar.', level: 'medium' },
      ],
      sourceNote: 'Sumber: prospektus awal ABNU dan pengumuman BEI. Contoh dengan angka ilustratif. Bukan rekomendasi untuk ikut atau tidak ikut IPO.',
    },
    ipo: {
      offerPrice: 450,
      priceRange: [420, 480],
      sharesOffered: 2.5 * M,
      sharesTotal: 12.5 * M,
      proceeds: 1.125 * T,
      valueAtOffer: 5.625 * T,
      publicPct: 20,
      prospectusDate: '2026-10-20',
      listingDate: '2026-11-12',
      schedule: [
        { label: 'Bookbuilding', start: '2026-10-20', end: '2026-10-27' },
        { label: 'Efektif OJK', start: '2026-10-30', end: '2026-10-30' },
        { label: 'Penawaran umum', start: '2026-11-04', end: '2026-11-10' },
        { label: 'Penjatahan', start: '2026-11-10', end: '2026-11-10' },
        { label: 'Pencatatan', start: '2026-11-12', end: '2026-11-12' },
      ],
      useOfProceeds: [
        { label: 'Pembangunan smelter HPAL tahap 2', amount: 731 * M, pct: 65 },
        { label: 'Modal kerja', amount: 225 * M, pct: 20 },
        { label: 'Pelunasan sebagian utang bank', amount: 169 * M, pct: 15 },
      ],
      useOfProceedsNote: 'Sebagian besar dana untuk menambah kapasitas, bukan membayar utang. Artinya hasil IPO baru terasa ke penjualan setelah smelter tahap 2 beroperasi.',
      shareholdersAfter: [
        { name: 'PT Andalan Mineral Group', pct: 80, public: false },
        { name: 'Publik (saham IPO)', pct: 20, public: true },
      ],
      lockupNote: 'Pemegang saham lama tidak boleh menjual sahamnya selama 8 bulan setelah pencatatan (lock-up).',
      underwriters: ['PT Sekuritas Nusantara Raya', 'PT Arta Kencana Sekuritas'],
      preIpoFinancials: {
        periods: [{ label: '2024', span: 'setahun' }, { label: '2025', span: 'setahun' }, { label: 'H1-2026', span: '6 bulan' }],
        revenue: [3.1 * T, 4.2 * T, 2.6 * T],
        netIncome: [0.21 * T, 0.38 * T, 0.27 * T],
        grossMarginPct: [18, 21, 23],
        debtToAssetPct: [58, 54, 52],
        note: 'Hanya tiga periode yang tersedia di prospektus. Grafik tren seperti di halaman emiten lain muncul setelah ABNU merilis laporan keuangan sebagai emiten tercatat.',
      },
      documents: [
        { title: 'Prospektus awal', date: '2026-10-20', sizeMb: 8.4, note: 'harga rentang Rp420–480', url: null },
        { title: 'Prospektus final', date: null, sizeMb: null, note: 'Menyusul setelah diunggah emiten', url: null },
      ],
    },
  },
};
