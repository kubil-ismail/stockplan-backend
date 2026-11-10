/**
 * StockPlan — model data yang diturunkan dari design.
 * Nama field boleh disesuaikan dengan konvensi repo, tapi relasi dan aturan di komentar wajib dipertahankan.
 * Semua uang dalam Rupiah (integer). Semua tanggal ISO 8601 (zona Asia/Jakarta untuk tampilan).
 */

export type Ticker = string; // 4 huruf kapital, mis. "BUMI"
export type StageGroup = 'hulu' | 'tengah' | 'hilir';

// ───────── Referensi pasar (dikelola admin, sumber: BEI) ─────────

export interface Sector { id: string; name: string } // "Energi", "Keuangan", "Barang baku", ...

export interface Company {
  ticker: Ticker;
  name: string;                    // "Bumi Resources Tbk"
  sectorId: string;
  logoUrl?: string;                // tanpa logo → avatar inisial 2 huruf, warna --sp-cat-*
  status: 'listed' | 'ipo' | 'suspended';
  listingBoard?: 'Utama' | 'Pengembangan' | 'Akselerasi' | 'Ekonomi Baru';
  summary: string;                 // ringkasan bisnis 1–2 kalimat
  strengths: string[]; weaknesses: string[]; watchItems: string[]; // "Kekuatan / Kelemahan / Yang dipantau"
  risks: string[];
  dataAsOf: string;                // tanggal data BEI terakhir → label "Data BEI per …"
  dataDelayed?: { period: string; lastAvailable: string }; // → banner EmitenDataTertunda
  ipo?: IpoInfo;
}

export interface IpoInfo {
  schedule: { label: string; date: string }[]; // bookbuilding, penawaran umum, penjatahan, pencatatan
  listingDate: string;
  useOfProceeds: { label: string; pct: number }[];
  underwriters: string[];
  prospectusUrl?: string;
}

export interface Theme {                // "Tema bisnis", mis. Batubara
  slug: string; name: string; sectorId: string;
  description: string;
  icon: string; color: string;
  status: 'draft' | 'review' | 'published';
  groups: StageGroupDef[];              // tahap utama, dikelola di AdminTemaEdit
  stages: Stage[];                      // tahap anak, berurutan
}
export interface StageGroupDef { id: string; key: StageGroup | string; title: string; description: string; icon: string; color: string }
export interface Stage {
  id: string; order: number; groupId: string;
  name: string;                         // "Kontraktor tambang"
  shortName: string;                    // "Kontraktor"
  description: string;                  // "Dibayar jasa menggali, bukan menjual batu bara sendiri."
  tickers: Ticker[];                    // satu emiten boleh di >1 tahap → badge angka biru di peta
}

// ───────── Data milik pengguna ─────────

export interface User {
  id: string; name: string; email: string; emailVerified: boolean; avatarUrl?: string;
  plan: 'beta' | 'monthly' | 'yearly';
  prefs: {
    numberFormat: 'short' | 'full';     // "Rp12,4 T" vs "Rp12.400.000.000.000"
    glossary: boolean;                  // garis bawah titik-titik pada istilah
    buyFeePct: number;                  // default 0,15
    sellFeePct: number;                 // default 0,25 (termasuk pajak 0,1%)
    defaultEvalEvery: 3 | 6 | 12;       // bulan, default 6
    notifications: NotificationPrefs;
  };
}

export type ThesisStatus = 'draft' | 'active' | 'archived';
export interface Thesis {
  id: string; userId: string; status: ThesisStatus;
  themeSlug?: string;
  statement: string;                    // wajib: "Tulis pernyataan tesis dulu — cukup satu kalimat pendek."
  reasons: string[];                    // langkah 2
  killConditions: { text: string; status: 'not_yet' | 'watch' | 'hit' }[]; // langkah 3
  holdings: { ticker: Ticker; weightPct: number; why: string; status: 'ok' | 'review'; reviewNote?: string }[]; // langkah 4, total bobot 100
  horizon: '1-3y' | '3-5y' | '5y+';     // langkah 5
  evalEveryMonths: 3 | 6 | 12;
  nextEvalAt: string;
  createdAt: string; updatedAt: string;
  history: { date: string; text: string }[];
}

/** Evaluasi: 3 alasan × 3 batas gugur × N emiten dijawab, lalu kesimpulan. Lihat suggestVerdict() di HANDOFF.md §6.3 */
export interface Evaluation {
  id: string; thesisId: string; createdAt: string;
  reasons: { verdict: 'ok' | 'weak' | 'no'; note?: string }[];
  kills: { verdict: 'no' | 'near' | 'yes'; note?: string }[];
  holdings: { ticker: Ticker; decision: 'keep' | 'reweight' | 'out'; newWeightPct?: number }[];
  verdict: 'tetap' | 'revisi' | 'gugur';
  note: string;
  nextEvalAt?: string;                  // kosong kalau gugur (tesis diarsipkan)
}

/** Portofolio = catatan pribadi berbasis modal (tidak ada eksekusi order). */
export interface Holding {
  userId: string; ticker: Ticker;
  thesisId?: string;                    // kosong → grup "Tanpa tesis"
  targetPct?: number;                   // target bobot di dalam tesis
  lots: number;                         // 1 lot = 100 lembar
  avgPrice: number;                     // harga rata-rata beli per lembar
  status: 'ok' | 'review';
}
export interface Transaction {
  id: string; userId: string; ticker: Ticker; side: 'buy' | 'sell';
  lots: number; price: number; feePct: number; date: string; note?: string;
}
export interface CashBalance { userId: string; amount: number }
export interface DecisionLog { id: string; userId: string; date: string; text: string; thesisId?: string; kind: 'add' | 'buy' | 'sell' | 'move' | 'out' | 'cash' | 'review' }

export type WatchStage = 'baru' | 'pel' | 'siap'; // dihitung, bukan disimpan
export interface WatchItem {
  userId: string; ticker: Ticker; themeName?: string; note: string;
  checklist: [boolean, boolean, boolean, boolean]; // Bisnis dipahami, Laporan dibaca, Risiko dicatat, Alasan ditulis
  savedAt: string; touchedAt: string;
}

// ───────── Notifikasi ─────────
export type NotificationKind = 'thesis_eval' | 'ticket_reply' | 'report_published' | 'data_delayed' | 'ipo' | 'theme_update' | 'feature';
export interface Notification {
  id: string; userId: string; kind: NotificationKind;
  title: string; body: string; href: string;
  createdAt: string; readAt?: string;   // disimpan 30 hari
}
export type NotificationPrefs = Record<NotificationKind, { inApp: boolean; email: boolean }>;

// ───────── Bantuan / masukan ─────────
export interface Ticket {
  id: string;                           // format "SP-YYMM-NNNN", mis. SP-2610-0418
  userId: string;
  kind: 'bug' | 'data' | 'fit' | 'etc';  // Laporkan masalah · Data salah · Usulan fitur · Lainnya
  subject: string;
  /** label pengguna / label admin:
   *  new  = Terkirim / Baru · prog = Sedang dicek / Ditangani
   *  wait = Perlu balasan Anda / Menunggu pengguna · done = Selesai */
  status: 'new' | 'prog' | 'wait' | 'done';
  assigneeId?: string; ticker?: Ticker; pageUrl?: string;
  messages: { from: 'user' | 'staff' | 'internal'; authorName: string; body: string; at: string }[];
  helpful?: boolean;                    // "Ya, membantu" / "Belum"
  unreadForUser: boolean;
}

// ───────── Admin ─────────
export type AdminModule = 'dash' | 'em' | 'tm' | 'usr' | 'fb' | 'log' | 'sync' | 'set' | 'acc';
export type AdminAction = 'view' | 'edit' | 'publish' | 'delete'; // Lihat, Ubah, Terbitkan, Hapus/tangguhkan
export interface AdminRole { id: string; name: string; system: boolean; perms: Record<AdminModule, AdminAction[]> }
export interface AdminUser { id: string; name: string; email: string; roleId: string; status: 'active' | 'invited' | 'suspended'; twoFactor: boolean; lastActiveAt?: string }
export interface AuditEntry { id: string; at: string; actorId: string; module: AdminModule; action: string; target: string; before?: unknown; after?: unknown; ip?: string; revertible: boolean }
export interface SyncRun { id: string; startedAt: string; finishedAt?: string; status: 'running' | 'ok' | 'partial' | 'failed'; failed: Ticker[]; pendingReports: number; conflicts: { ticker: Ticker; field: string; ours: string; bei: string }[] }
