// Jalankan: node --test pasang.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pasang, gabungSettings, sisipBlok, sidik, MANIFES_REL, MULAI, AKHIR } from "./pasang.mjs";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "kit");
const baca = (dir, rel) => readFileSync(join(dir, rel), "utf8");
function repoBaru() {
  const d = mkdtempSync(join(tmpdir(), "studio-kit-"));
  mkdirSync(join(d, ".git")); // cukup untuk dikenali sebagai root repo; pemasang tidak menjalankan perintah git yang menulis
  return d;
}
const NILAI = { proyek: "Toko Kita", ceo: "Budi", branchUtama: "main" };

test("pemasangan baru: berkas lengkap, penanda terisi, hook + gitignore + blok CLAUDE.md + manifes", (t) => {
  const d = repoBaru(); t.after(() => rmSync(d, { recursive: true, force: true }));
  const { manifes } = pasang({ target: d, ...NILAI, versi: "1.0.0" });
  for (const rel of ["tools/tim/meja.mjs", ".claude/hooks/jaga-wilayah.mjs", ".claude/agents/cto.md", ".claude/tim/wilayah.json",
    ".claude/tim/studio.config.json", "docs/tim/SOP_TIM.md", "docs/tim/templat/TIKET.md", "docs/tim/PAPAN.md", "docs/PROGRESS.md", "docs/BUGLOG.md", ".claude/skills/uji-fitur/triase.mjs"]) {
    assert.ok(existsSync(join(d, rel)), `harus ada: ${rel}`);
  }
  assert.ok(!existsSync(join(d, "CLAUDE.tim.md")), "templat blok tidak disalin mentah");
  assert.match(baca(d, ".claude/agents/cto.md"), /CTO \/ Tech Lead — Toko Kita/);
  assert.match(baca(d, ".claude/agents/cto.md"), /user, Budi/);
  assert.equal(JSON.parse(baca(d, ".claude/tim/studio.config.json")).branchUtama, "main");
  // tidak ada penanda pemasang yang tersisa di berkas non-mesin; penanda templat laporan ({{TIKET}} dst.) harus tetap utuh
  for (const rel of Object.keys(manifes.berkas).filter((r) => !r.startsWith("tools/") && !r.startsWith(".claude/hooks/"))) {
    assert.doesNotMatch(baca(d, rel), /\{\{(PROYEK|CEO|BRANCH_UTAMA)\}\}/, rel);
  }
  assert.match(baca(d, "docs/tim/templat/LAPORAN.md"), /\{\{TIKET\}\}/);
  const s = JSON.parse(baca(d, ".claude/settings.json"));
  assert.match(s.hooks.PreToolUse[0].hooks[0].command, /jaga-wilayah\.mjs/);
  assert.match(baca(d, ".gitignore"), /^\.claude\/tim\/\*\.local\.\*$/m);
  const c = baca(d, "CLAUDE.md");
  assert.ok(c.includes(MULAI) && c.includes(AKHIR) && c.includes("## Mode Tim"));
  assert.equal(manifes.versi, "1.0.0");
  assert.deepEqual(JSON.parse(baca(d, MANIFES_REL)).nilai, NILAI);
});

test("idempoten: pemasangan kedua tidak mengubah apa pun dan tidak menggandakan hook/blok", (t) => {
  const d = repoBaru(); t.after(() => rmSync(d, { recursive: true, force: true }));
  pasang({ target: d, ...NILAI });
  const sebelum = { s: baca(d, ".claude/settings.json"), c: baca(d, "CLAUDE.md"), g: baca(d, ".gitignore") };
  const { langkah } = pasang({ target: d, ...NILAI });
  assert.deepEqual(langkah.filter((l) => /dibuat|diperbarui|ditambahkan|didaftarkan|disisipkan|dilewati/.test(l.aksi)), []);
  assert.equal(baca(d, ".claude/settings.json"), sebelum.s);
  assert.equal(baca(d, "CLAUDE.md"), sebelum.c);
  assert.equal(baca(d, ".gitignore"), sebelum.g);
  assert.equal(baca(d, "CLAUDE.md").split(MULAI).length - 1, 1);
});

test("--jabatan: hanya jabatan terpilih + cto & code-reviewer; wilayah.json ikut disaring", (t) => {
  const d = repoBaru(); t.after(() => rmSync(d, { recursive: true, force: true }));
  const { manifes } = pasang({ target: d, ...NILAI, jabatan: ["backend-engineer"] });
  assert.deepEqual(readdirSync(join(d, ".claude/agents")).sort(), ["backend-engineer.md", "code-reviewer.md", "cto.md"]);
  assert.deepEqual(Object.keys(JSON.parse(baca(d, ".claude/tim/wilayah.json")).peran).sort(), ["backend-engineer", "code-reviewer", "cto"]);
  assert.deepEqual(manifes.jabatan.sort(), ["backend-engineer", "code-reviewer", "cto"]);
  assert.throws(() => pasang({ target: d, ...NILAI, jabatan: ["tukang-sihir"] }), /tidak ada di kit/);
});

test("berkas yang sudah ada di proyek tidak ditimpa; settings & CLAUDE.md lama dipertahankan", (t) => {
  const d = repoBaru(); t.after(() => rmSync(d, { recursive: true, force: true }));
  mkdirSync(join(d, ".claude/agents"), { recursive: true });
  writeFileSync(join(d, ".claude/agents/cto.md"), "CTO buatan sendiri\n");
  writeFileSync(join(d, ".claude/settings.json"), JSON.stringify({ permissions: { allow: ["Bash(npm test:*)"] }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hai" }] }] } }));
  writeFileSync(join(d, "CLAUDE.md"), "# Proyek\n\nAturan lama.\n");
  writeFileSync(join(d, "docs.txt"), "x");
  const { langkah } = pasang({ target: d, ...NILAI });
  assert.equal(baca(d, ".claude/agents/cto.md"), "CTO buatan sendiri\n");
  assert.match(langkah.find((l) => l.rel === ".claude/agents/cto.md").aksi, /dilewati/);
  const s = JSON.parse(baca(d, ".claude/settings.json"));
  assert.deepEqual(s.permissions.allow, ["Bash(npm test:*)"]);
  assert.equal(s.hooks.PreToolUse.length, 2);
  assert.ok(s.hooks.PreToolUse.some((m) => m.hooks[0].command === "echo hai"));
  assert.match(baca(d, "CLAUDE.md"), /^# Proyek\n\nAturan lama\.\n\n<!-- studio-kit:mulai/);
  // --paksa menimpa berkas PROYEK
  pasang({ target: d, ...NILAI, paksa: true });
  assert.match(baca(d, ".claude/agents/cto.md"), /Tech Lead — Toko Kita/);
});

test("--perbarui: mesin selalu ditimpa; berkas PROYEK diperbarui hanya bila belum diubah; KERANGKA tidak disentuh", (t) => {
  const d = repoBaru(); const kit2 = mkdtempSync(join(tmpdir(), "studio-kit-v2-"));
  t.after(() => { rmSync(d, { recursive: true, force: true }); rmSync(kit2, { recursive: true, force: true }); });
  pasang({ target: d, ...NILAI, versi: "1.0.0" });
  // proyek mengubah: satu jabatan, konfigurasi, dan (keliru) berkas mesin
  writeFileSync(join(d, ".claude/agents/backend-engineer.md"), baca(d, ".claude/agents/backend-engineer.md") + "\nAturan khas proyek.\n");
  writeFileSync(join(d, ".claude/tim/studio.config.json"), '{"branchUtama":"main","port":{"api":3000}}\n');
  writeFileSync(join(d, "tools/tim/meja.mjs"), "// diutak-atik\n");
  // kit versi baru: SOP, dua jabatan, mesin, dan kerangka berubah
  cpSync(KIT, kit2, { recursive: true });
  for (const rel of ["docs/tim/SOP_TIM.md", ".claude/agents/backend-engineer.md", ".claude/agents/qa-engineer.md", ".claude/tim/studio.config.json"]) {
    writeFileSync(join(kit2, rel), baca(kit2, rel) + "\n<!-- v2 {{PROYEK}} -->\n");
  }
  const { langkah, manifes } = pasang({ target: d, kit: kit2, perbarui: true, versi: "2.0.0" });
  const aksi = (rel) => langkah.find((l) => l.rel === rel).aksi;
  assert.equal(aksi("docs/tim/SOP_TIM.md"), "diperbarui");
  assert.match(baca(d, "docs/tim/SOP_TIM.md"), /<!-- v2 Toko Kita -->/); // nilai diambil dari manifes
  assert.equal(aksi(".claude/agents/qa-engineer.md"), "diperbarui");
  assert.match(aksi(".claude/agents/backend-engineer.md"), /dilewati — diubah di proyek/);
  assert.match(baca(d, ".claude/agents/backend-engineer.md"), /Aturan khas proyek\./);
  assert.doesNotMatch(baca(d, ".claude/agents/backend-engineer.md"), /v2/);
  assert.equal(aksi("tools/tim/meja.mjs"), "diperbarui");
  assert.equal(baca(d, "tools/tim/meja.mjs"), baca(kit2, "tools/tim/meja.mjs"));
  assert.equal(aksi(".claude/tim/studio.config.json"), "dipertahankan (milik proyek)");
  assert.deepEqual(JSON.parse(baca(d, ".claude/tim/studio.config.json")).port, { api: 3000 });
  assert.equal(manifes.versi, "2.0.0");
  // sidik berkas yang dilewati tetap versi lama → tetap dikenali "diubah" pada pembaruan berikutnya
  assert.notEqual(manifes.berkas[".claude/agents/backend-engineer.md"], sidik(baca(d, ".claude/agents/backend-engineer.md")));
});

test("penolakan: bukan repo git, --perbarui tanpa manifes, nilai berisi baris baru", (t) => {
  const d = mkdtempSync(join(tmpdir(), "studio-kit-")); t.after(() => rmSync(d, { recursive: true, force: true }));
  assert.throws(() => pasang({ target: d, ...NILAI }), /bukan root repo git/);
  mkdirSync(join(d, ".git"));
  assert.throws(() => pasang({ target: d, perbarui: true }), /belum dipasangi/);
  assert.throws(() => pasang({ target: d, ...NILAI, proyek: "A\nB" }), /tidak sah/);
  assert.ok(!existsSync(join(d, ".claude")), "penolakan tidak meninggalkan berkas");
});

test("--dry-run tidak menulis apa pun", (t) => {
  const d = repoBaru(); t.after(() => rmSync(d, { recursive: true, force: true }));
  const { langkah } = pasang({ target: d, ...NILAI, dryRun: true });
  assert.ok(langkah.some((l) => l.aksi === "dibuat"));
  assert.deepEqual(readdirSync(d), [".git"]);
});

test("gabungSettings & sisipBlok: kasus tepi", () => {
  const s = {};
  assert.equal(gabungSettings(s), true);
  assert.equal(gabungSettings(s), false);
  assert.equal(s.hooks.PreToolUse.length, 1);
  assert.equal(sisipBlok("", "isi"), `${MULAI}\nisi\n${AKHIR}\n`);
  const dua = sisipBlok(sisipBlok("# A\n", "satu"), "dua");
  assert.ok(dua.includes("dua") && !dua.includes("satu") && dua.startsWith("# A\n"));
  assert.equal(sisipBlok(`x\n${MULAI}\nlama\n${AKHIR}\nsesudah\n`, "baru"), `x\n${MULAI}\nbaru\n${AKHIR}\nsesudah\n`);
  assert.throws(() => sisipBlok(`${MULAI}\nputus`, "x"), /tidak berpasangan/);
  assert.equal(sidik("a\r\nb"), sidik("a\nb"));
});
