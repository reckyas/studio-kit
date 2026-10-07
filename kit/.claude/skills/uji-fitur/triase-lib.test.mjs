// Jalankan: node --test ".claude/skills/uji-fitur/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { gabungKonfig, apakahDokumen, cariPemicu, tentukanTingkat, blokWajib, ujiDasar } from "./triase-lib.mjs";

const cfg = gabungKonfig({});
const nilai = (files, added = {}, c = cfg, rilis = false) => {
  const hits = cariPemicu(files, added, c);
  return { hits, ...tentukanTingkat({ files, hits, rilis, cfg: c }) };
};

test("tanpa perubahan → —; hanya dokumen/aset/.claude → T0", () => {
  assert.equal(nilai([]).tingkat, "—");
  assert.equal(nilai(["README.md", "docs/plans/PRD.md", "design/logo.svg", ".claude/agents/cto.md"]).tingkat, "T0");
  assert.ok(apakahDokumen("CHANGELOG.md", cfg) && !apakahDokumen("src/index.ts", cfg));
});

test("kode tanpa pemicu → T1; dokumen ikut berubah tidak menurunkan", () => {
  assert.equal(nilai(["src/util/format.ts", "README.md"], { "src/util/format.ts": ["export const a = 1;"] }).tingkat, "T1");
});

test("pemicu lewat path dan lewat isi baris tambahan → T2", () => {
  const r1 = nilai(["server/src/routes/pelanggan.ts"]);
  assert.equal(r1.tingkat, "T2");
  assert.deepEqual(r1.hits.map((h) => h.id), ["ENDPOINT"]);
  const r2 = nilai(["src/app.ts"], { "src/app.ts": ["app.post('/x', h)"] });
  assert.deepEqual(r2.hits.map((h) => h.id), ["ENDPOINT"]);
  assert.deepEqual(blokWajib(r2.tingkat, r2.hits), ["K1", "K2"]);
});

test("isi pemicu di berkas dokumen tidak dihitung (contoh kode di .md bukan permukaan)", () => {
  assert.equal(nilai(["docs/api.md"], { "docs/api.md": ["router.post('/login')", "jwt.sign()"] }).tingkat, "T0");
});

test("pemicu kritis → T3; ≥ 3 pemicu tinggi berbeda → T3; T3 mewajibkan semua blok", () => {
  const k = nilai(["src/lib/crypto.ts"]);
  assert.equal(k.tingkat, "T3");
  assert.match(k.alasan[0], /RAHASIA/);
  const t = nilai(["src/auth/login.ts", "db/migrations/001.sql", "src/berkas.ts"], { "src/berkas.ts": ["const up = multer()"] });
  assert.deepEqual(t.hits.map((h) => h.id).sort(), ["AUTH", "SKEMA-DB", "UNGGAH"]);
  assert.equal(t.tingkat, "T3");
  assert.equal(blokWajib("T3", []).length, 7);
  // dua pemicu tinggi saja → tetap T2
  assert.equal(nilai(["src/auth/login.ts", "db/migrations/001.sql"]).tingkat, "T2");
});

test("--rilis memaksa T3 walau hanya dokumen", () => {
  assert.equal(nilai(["README.md"], {}, cfg, true).tingkat, "T3");
});

test("konfigurasi proyek: pemicu baru, menimpa, menghapus, dan area uji dasar", () => {
  const c = gabungKonfig({
    pemicu: [
      { id: "PEMBAYARAN", bobot: "kritis", path: ["^server/src/bayar/"], blok: ["K1", "K2", "P2"] },
      { id: "DEPENDENSI", hapus: true },
      { id: "ENDPOINT", bobot: "tinggi", path: ["^api/"] },
    ],
    area: { server: { path: "^server/", dasar: ["npm test --prefix server"] }, web: { path: "^web/", dasar: ["npm run build --prefix web"] } },
  });
  assert.equal(nilai(["server/src/bayar/tagihan.ts"], {}, c).tingkat, "T3");
  assert.equal(nilai(["package.json"], {}, c).tingkat, "T1"); // DEPENDENSI dihapus
  assert.equal(nilai(["api/x.ts"], {}, c).hits[0].bobot, "tinggi");
  assert.deepEqual(ujiDasar(["server/a.ts", "docs/x.md"], c), [{ area: "server", perintah: ["npm test --prefix server"] }]);
});

test("konfigurasi rusak ditolak dengan pesan jelas", () => {
  assert.throws(() => gabungKonfig({ pemicu: [{ id: "kecil", bobot: "tinggi" }] }), /pemicu\.id/);
  assert.throws(() => gabungKonfig({ pemicu: [{ id: "X1", bobot: "berat" }] }), /bobot/);
  assert.throws(() => gabungKonfig({ pemicu: [{ id: "X1", bobot: "tinggi", blok: ["Z9"] }] }), /blok/);
  assert.throws(() => gabungKonfig({ pemicu: [{ id: "X1", bobot: "tinggi", path: ["("] }] }));
  assert.throws(() => gabungKonfig({ area: { a: { path: "^a/" } } }), /area/);
});
