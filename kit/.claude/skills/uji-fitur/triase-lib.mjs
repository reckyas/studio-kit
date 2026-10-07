// Logika murni triase uji fitur (tanpa I/O). Dipakai triase.mjs; diuji triase-lib.test.mjs.
// Pemicu bawaan bersifat umum; proyek menambah/menimpa lewat .claude/tim/uji.config.json.

export const DOKUMEN_BAWAAN = [
  "\\.(md|mdx|txt|rst|png|jpe?g|gif|webp|svg|ico|pdf)$",
  "^docs/",
  "^\\.claude/",
  "^(LICENSE|CHANGELOG)[^/]*$",
];

/** bobot: kritis → T3 langsung; tinggi/sedang → T2 (≥ 3 pemicu tinggi berbeda → T3). */
export const PEMICU_BAWAAN = [
  { id: "AUTH", bobot: "tinggi", ket: "autentikasi / otorisasi / sesi",
    path: ["(^|/)(auth|login|session|permission|rbac|acl)[^/]*"],
    isi: ["\\b(jwt|jsonwebtoken|bcrypt|argon2|passport|authorize|requireRole|requireAuth|isAdmin)\\b"], blok: ["K1", "K2"] },
  { id: "ENDPOINT", bobot: "sedang", ket: "endpoint / socket baru atau berubah",
    path: ["(^|/)(routes?|controllers?|handlers?)/"],
    isi: ["\\b(router|app)\\.(get|post|put|patch|delete)\\(", "@(Get|Post|Put|Patch|Delete)\\(", "\\b(io|socket)\\.on\\("], blok: ["K1", "K2"] },
  { id: "SKEMA-DB", bobot: "tinggi", ket: "skema / migrasi DB",
    path: ["(^|/)migrations?/", "schema\\.prisma$", "\\.sql$"], isi: [], blok: ["K2", "P1"] },
  { id: "UNGGAH", bobot: "tinggi", ket: "unggahan berkas / masukan besar",
    path: [], isi: ["\\b(multer|multipart|formidable|busboy|upload\\w*)\\b"], blok: ["K2", "P3"] },
  { id: "RAHASIA", bobot: "kritis", ket: "kriptografi / kunci / data rahasia",
    path: ["(^|/)(crypto|kripto|secrets?)[^/]*"],
    isi: ["\\b(createHmac|createCipheriv|createSign|privateKey|secretKey|signingKey)\\b"], blok: ["K1", "K2", "K3"] },
  { id: "DEPLOY", bobot: "sedang", ket: "infrastruktur / CI / reverse proxy",
    path: ["(^|/)Dockerfile$", "docker-compose[^/]*\\.ya?ml$", "^\\.github/workflows/", "(^|/)(Caddyfile|nginx[^/]*\\.conf)$", "^(deploy|infra)/"], isi: [], blok: ["K4"] },
  { id: "DEPENDENSI", bobot: "sedang", ket: "dependensi berubah",
    path: ["(^|/)(package(-lock)?\\.json|pnpm-lock\\.yaml|yarn\\.lock|requirements[^/]*\\.txt|go\\.(mod|sum)|build\\.gradle(\\.kts)?|Cargo\\.(toml|lock)|composer\\.(json|lock))$"], isi: [], blok: ["K3"] },
];

export const BLOK = {
  K1: "Suite serangan yang sudah ada (regresi keamanan)",
  K2: "Test serangan BARU untuk permukaan baru + uji mutasi penjaganya",
  K3: "Pindai rahasia & audit dependensi",
  K4: "Konfigurasi: header keamanan / CSP / TLS / hak akses kontainer",
  P1: "Rencana query (EXPLAIN) & index untuk jalur yang berubah",
  P2: "Uji beban jalur panas, dibandingkan baseline",
  P3: "Batas ukuran masukan / unggahan & waktu respons",
};
const BOBOT = ["sedang", "tinggi", "kritis"];
const SEMUA_BLOK = Object.keys(BLOK);

const re = (s) => new RegExp(s, "i");

/** Gabungkan konfigurasi proyek dengan bawaan. Pemicu ber-id sama menimpa bawaan; `"hapus": true` membuangnya. */
export function gabungKonfig(mentah = {}) {
  const peta = new Map(PEMICU_BAWAAN.map((p) => [p.id, p]));
  for (const p of mentah.pemicu ?? []) {
    if (!p || typeof p.id !== "string" || !/^[A-Z][A-Z0-9-]{1,30}$/.test(p.id)) throw new Error("uji.config: pemicu.id wajib HURUF-BESAR (mis. PEMBAYARAN)");
    if (p.hapus) { peta.delete(p.id); continue; }
    if (!BOBOT.includes(p.bobot)) throw new Error(`uji.config: pemicu ${p.id} bobot harus ${BOBOT.join("/")}`);
    for (const b of p.blok ?? []) if (!SEMUA_BLOK.includes(b)) throw new Error(`uji.config: pemicu ${p.id} blok '${b}' tidak dikenal`);
    for (const s of [...(p.path ?? []), ...(p.isi ?? [])]) re(s); // melempar bila regex rusak
    peta.set(p.id, { ket: p.id, path: [], isi: [], blok: ["K1", "K2"], ...p });
  }
  const area = mentah.area ?? {};
  for (const [nama, a] of Object.entries(area)) {
    if (!a || typeof a.path !== "string" || !Array.isArray(a.dasar)) throw new Error(`uji.config: area '${nama}' wajib { path, dasar: [perintah] }`);
    re(a.path);
  }
  return { dokumen: mentah.dokumen ?? DOKUMEN_BAWAAN, pemicu: [...peta.values()], area };
}

export const apakahDokumen = (berkas, cfg) => cfg.dokumen.some((d) => re(d).test(berkas));

/** @returns {{id,bobot,ket,blok,berkas:string[]}[]} pemicu yang kena, tiap id sekali. */
export function cariPemicu(files, addedByFile, cfg) {
  const hasil = [];
  const kode = files.filter((f) => !apakahDokumen(f, cfg));
  for (const p of cfg.pemicu) {
    const kena = new Set();
    for (const f of kode) {
      if ((p.path ?? []).some((s) => re(s).test(f))) { kena.add(f); continue; }
      const baris = addedByFile[f] ?? [];
      if ((p.isi ?? []).some((s) => { const r = re(s); return baris.some((l) => r.test(l)); })) kena.add(f);
    }
    if (kena.size) hasil.push({ id: p.id, bobot: p.bobot, ket: p.ket, blok: p.blok ?? [], berkas: [...kena].sort() });
  }
  return hasil;
}

/** @returns {{tingkat:"—"|"T0"|"T1"|"T2"|"T3", alasan:string[]}} */
export function tentukanTingkat({ files, hits, rilis = false, cfg }) {
  if (rilis) return { tingkat: "T3", alasan: ["--rilis: persiapan rilis / akhir fase besar"] };
  if (!files.length) return { tingkat: "—", alasan: ["tidak ada perubahan"] };
  if (files.every((f) => apakahDokumen(f, cfg))) return { tingkat: "T0", alasan: ["hanya dokumen/aset/perkakas"] };
  if (!hits.length) return { tingkat: "T1", alasan: ["kode berubah tanpa pemicu keamanan/performa"] };
  const kritis = hits.filter((h) => h.bobot === "kritis");
  const tinggi = hits.filter((h) => h.bobot === "tinggi");
  if (kritis.length) return { tingkat: "T3", alasan: [`pemicu kritis: ${kritis.map((h) => h.id).join(", ")}`] };
  if (tinggi.length >= 3) return { tingkat: "T3", alasan: [`≥ 3 pemicu bobot tinggi: ${tinggi.map((h) => h.id).join(", ")}`] };
  return { tingkat: "T2", alasan: [`pemicu: ${hits.map((h) => h.id).join(", ")}`] };
}

/** Blok yang wajib dijalankan menurut tingkat. T3 = semua. */
export function blokWajib(tingkat, hits) {
  if (tingkat === "T3") return SEMUA_BLOK;
  if (tingkat !== "T2") return [];
  return SEMUA_BLOK.filter((b) => hits.some((h) => h.blok.includes(b)));
}

/** Uji dasar (lint/test/build) untuk area paket yang tersentuh. */
export function ujiDasar(files, cfg) {
  const kode = files.filter((f) => !apakahDokumen(f, cfg));
  return Object.entries(cfg.area)
    .filter(([, a]) => kode.some((f) => re(a.path).test(f)))
    .map(([nama, a]) => ({ area: nama, perintah: a.dasar }));
}
