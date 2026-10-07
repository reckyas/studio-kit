#!/usr/bin/env node
// studio-kit — memasang / memperbarui "Mode Tim" (multi-agent Claude Code) di sebuah proyek.
//
//   node pasang.mjs [--target <folder proyek>] [--proyek <nama>] [--ceo <nama>] [--branch <branch utama>]
//                   [--jabatan backend-engineer,frontend-engineer,…] [--paksa] [--dry-run]
//   node pasang.mjs --perbarui [--target <folder proyek>] [--dry-run]
//
// Tiga golongan berkas:
//   MESIN    — perkakas (meja, hook, triase). Selalu ditimpa versi kit. Jangan diedit di proyek.
//   PROYEK   — jabatan, SOP, templat. Dipasang sekali; saat --perbarui hanya ditimpa bila belum diubah di proyek.
//   KERANGKA — konfigurasi & catatan proyek (wilayah, studio.config, PAPAN, PROGRESS, BUGLOG). Dibuat bila belum ada, lalu tidak disentuh lagi.
// Selain itu: hook didaftarkan di .claude/settings.json, baris .gitignore ditambahkan, dan blok "Mode Tim" disisipkan
// ke CLAUDE.md di antara penanda studio-kit. Tidak ada commit, push, atau perintah jaringan.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT_ROOT = dirname(fileURLToPath(import.meta.url));
export const MANIFES_REL = ".claude/tim/studio-kit.json";
export const MULAI = "<!-- studio-kit:mulai (blok ini dikelola studio-kit; edit di luar penanda) -->";
export const AKHIR = "<!-- studio-kit:akhir -->";
export const JABATAN_WAJIB = ["cto", "code-reviewer"];
const HOOK_CMD = 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/jaga-wilayah.mjs"';
const GITIGNORE = ["# Mode Tim (studio-kit): identitas meja per worktree", ".claude/tim/*.local.*"];

const KERANGKA = new Set([
  "docs/PROGRESS.md", "docs/BUGLOG.md", "docs/BUGLOG_DETAIL.md", "docs/tim/PAPAN.md",
  ".claude/tim/studio.config.json", ".claude/tim/uji.config.json", ".claude/tim/wilayah.json",
  ".claude/skills/uji-fitur/referensi.md",
]);
const golongan = (rel) => {
  if (rel === "CLAUDE.tim.md") return "BLOK";
  if (KERANGKA.has(rel)) return "KERANGKA";
  if (rel.startsWith("tools/tim/") || rel.startsWith(".claude/hooks/") || rel.startsWith(".claude/skills/uji-fitur/")) return "MESIN";
  return "PROYEK";
};

const lf = (s) => s.replace(/\r\n/g, "\n");
export const sidik = (isi) => createHash("sha256").update(lf(isi)).digest("hex").slice(0, 16);

function telusur(dir, akar = dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? telusur(p, akar) : [relative(akar, p).replace(/\\/g, "/")];
  }).sort();
}

const isi = (s, nilai) => s.replaceAll("{{PROYEK}}", nilai.proyek).replaceAll("{{CEO}}", nilai.ceo).replaceAll("{{BRANCH_UTAMA}}", nilai.branchUtama);

/** Daftarkan hook jaga-wilayah di settings tanpa mengusik hook lain. Mengembalikan true bila berubah. */
export function gabungSettings(s) {
  s.hooks ??= {};
  s.hooks.PreToolUse ??= [];
  const sudah = s.hooks.PreToolUse.some((m) => (m.hooks ?? []).some((h) => String(h.command ?? "").includes("jaga-wilayah.mjs")));
  if (sudah) return false;
  s.hooks.PreToolUse.unshift({ matcher: "Edit|Write|NotebookEdit", hooks: [{ type: "command", command: HOOK_CMD, timeout: 10 }] });
  return true;
}

/** Sisipkan / ganti blok bertanda di CLAUDE.md. */
export function sisipBlok(lama, blok) {
  const utuh = `${MULAI}\n${blok.trim()}\n${AKHIR}`;
  const a = lama.indexOf(MULAI);
  const b = lama.indexOf(AKHIR);
  if (a >= 0 && b > a) return lama.slice(0, a) + utuh + lama.slice(b + AKHIR.length);
  if (a >= 0 || b >= 0) throw new Error("CLAUDE.md: penanda studio-kit tidak berpasangan — rapikan manual dulu");
  return (lama.trim() ? lama.replace(/\s*$/, "\n\n") : "") + utuh + "\n";
}

const git = (args, cwd) => { try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

/**
 * @param {{target:string, kit?:string, proyek?:string, ceo?:string, branchUtama?:string, jabatan?:string[],
 *          perbarui?:boolean, paksa?:boolean, dryRun?:boolean, versi?:string}} o
 * @returns {{langkah:{rel:string, aksi:string}[], manifes:object}}
 */
export function pasang(o) {
  const target = resolve(o.target);
  const kit = o.kit ?? join(KIT_ROOT, "kit");
  if (!existsSync(join(target, ".git"))) throw new Error(`${target} bukan root repo git (tidak ada .git) — jalankan 'git init' dulu atau periksa --target`);
  if (resolve(kit).startsWith(target + "\\") || resolve(kit).startsWith(target + "/") || resolve(kit) === target) throw new Error("target tidak boleh repo studio-kit itu sendiri");

  const manifesPath = join(target, MANIFES_REL);
  const lamaM = existsSync(manifesPath) ? JSON.parse(readFileSync(manifesPath, "utf8")) : null;
  if (o.perbarui && !lamaM) throw new Error(`--perbarui: ${MANIFES_REL} tidak ada — proyek ini belum dipasangi studio-kit (jalankan tanpa --perbarui)`);

  const nilai = {
    proyek: o.proyek ?? lamaM?.nilai?.proyek ?? basename(target),
    ceo: o.ceo ?? lamaM?.nilai?.ceo ?? (git(["config", "user.name"], target) || "CEO"),
    branchUtama: o.branchUtama ?? lamaM?.nilai?.branchUtama ?? (git(["symbolic-ref", "--short", "HEAD"], target) || "main"),
  };
  for (const [k, v] of Object.entries(nilai)) if (typeof v !== "string" || !v || /[\r\n{}]/.test(v)) throw new Error(`nilai ${k} tidak sah`);

  const semua = telusur(kit);
  const tersedia = semua.filter((r) => r.startsWith(".claude/agents/")).map((r) => basename(r, ".md"));
  const diminta = o.jabatan ?? lamaM?.jabatan ?? tersedia;
  for (const j of diminta) if (!tersedia.includes(j)) throw new Error(`--jabatan '${j}' tidak ada di kit. Pilihan: ${tersedia.join(", ")}`);
  const jabatan = tersedia.filter((j) => JABATAN_WAJIB.includes(j) || diminta.includes(j));

  const langkah = [];
  const berkas = { ...(lamaM?.berkas ?? {}) };
  const tulis = (rel, teks) => { if (!o.dryRun) { mkdirSync(dirname(join(target, rel)), { recursive: true }); writeFileSync(join(target, rel), teks); } };
  const catat = (rel, aksi) => langkah.push({ rel, aksi });

  for (const rel of semua) {
    const g = golongan(rel);
    if (g === "BLOK") continue;
    if (rel.startsWith(".claude/agents/") && !jabatan.includes(basename(rel, ".md"))) continue;
    let baru = readFileSync(join(kit, rel), "utf8");
    if (g !== "MESIN") baru = isi(baru, nilai);
    if (rel === ".claude/tim/wilayah.json") {
      const w = JSON.parse(baru);
      w.peran = Object.fromEntries(Object.entries(w.peran).filter(([p]) => jabatan.includes(p)));
      baru = JSON.stringify(w, null, 2) + "\n";
    }
    const tujuan = join(target, rel);
    const ada = existsSync(tujuan);
    const kini = ada ? readFileSync(tujuan, "utf8") : null;
    const sama = ada && lf(kini) === lf(baru);

    if (g === "KERANGKA") {
      if (ada) catat(rel, "dipertahankan (milik proyek)");
      else { tulis(rel, baru); catat(rel, "dibuat"); }
      continue;
    }
    if (g === "MESIN") {
      if (sama) catat(rel, "sudah terbaru");
      else { tulis(rel, baru); catat(rel, ada ? "diperbarui" : "dibuat"); }
      berkas[rel] = sidik(baru);
      continue;
    }
    // PROYEK
    if (!ada) { tulis(rel, baru); berkas[rel] = sidik(baru); catat(rel, "dibuat"); continue; }
    if (sama) { berkas[rel] = sidik(baru); catat(rel, "sudah terbaru"); continue; }
    const belumDiubah = berkas[rel] !== undefined && berkas[rel] === sidik(kini);
    if (belumDiubah || o.paksa) { tulis(rel, baru); berkas[rel] = sidik(baru); catat(rel, o.paksa && !belumDiubah ? "DITIMPA (--paksa)" : "diperbarui"); }
    else catat(rel, lamaM ? "dilewati — diubah di proyek (bandingkan manual dengan kit)" : "dilewati — sudah ada sebelum pemasangan (--paksa untuk menimpa)");
  }

  // .claude/settings.json
  {
    const rel = ".claude/settings.json";
    const p = join(target, rel);
    const s = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { $schema: "https://json.schemastore.org/claude-code-settings.json" };
    if (gabungSettings(s)) { tulis(rel, JSON.stringify(s, null, 2) + "\n"); catat(rel, "hook jaga-wilayah didaftarkan"); }
    else catat(rel, "hook sudah terdaftar");
  }
  // .gitignore
  {
    const rel = ".gitignore";
    const p = join(target, rel);
    const lama = existsSync(p) ? readFileSync(p, "utf8") : "";
    if (lf(lama).split("\n").map((l) => l.trim()).includes(GITIGNORE[1])) catat(rel, "sudah memuat pola meja");
    else { tulis(rel, (lama.trim() ? lama.replace(/\s*$/, "\n\n") : "") + GITIGNORE.join("\n") + "\n"); catat(rel, "pola meja ditambahkan"); }
  }
  // CLAUDE.md
  {
    const rel = "CLAUDE.md";
    const p = join(target, rel);
    const lama = existsSync(p) ? readFileSync(p, "utf8") : `# CLAUDE.md — ${nilai.proyek}\n`;
    const baru = sisipBlok(lama, isi(readFileSync(join(kit, "CLAUDE.tim.md"), "utf8"), nilai));
    if (existsSync(p) && lf(lama) === lf(baru)) catat(rel, "blok Mode Tim sudah terbaru");
    else { tulis(rel, baru); catat(rel, existsSync(p) ? "blok Mode Tim disisipkan/diperbarui" : "dibuat dengan blok Mode Tim"); }
  }

  const kini = new Date().toISOString();
  const manifes = {
    $catatan: "Dikelola studio-kit (pasang.mjs). 'berkas' = sidik isi saat dipasang; dipakai --perbarui untuk mengenali berkas yang sudah diubah di proyek.",
    versi: o.versi ?? "0.0.0",
    dipasang: lamaM?.dipasang ?? kini,
    diperbarui: kini,
    nilai,
    jabatan,
    berkas: Object.fromEntries(Object.entries(berkas).sort()),
  };
  tulis(MANIFES_REL, JSON.stringify(manifes, null, 2) + "\n");
  return { langkah, manifes };
}

// ---------------------------------------------------------------- CLI
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) out[k] = true; else { out[k] = v; i++; }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || a.bantuan) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    process.exit(0);
  }
  try {
    const versi = JSON.parse(readFileSync(join(KIT_ROOT, "package.json"), "utf8")).version;
    const sha = git(["rev-parse", "--short", "HEAD"], KIT_ROOT);
    const { langkah, manifes } = pasang({
      target: typeof a.target === "string" ? a.target : process.cwd(),
      proyek: typeof a.proyek === "string" ? a.proyek : undefined,
      ceo: typeof a.ceo === "string" ? a.ceo : undefined,
      branchUtama: typeof a.branch === "string" ? a.branch : undefined,
      jabatan: typeof a.jabatan === "string" ? a.jabatan.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      perbarui: !!a.perbarui, paksa: !!a.paksa, dryRun: !!a["dry-run"],
      versi: sha ? `${versi}+${sha}` : versi,
    });
    const diam = new Set(["sudah terbaru", "dipertahankan (milik proyek)", "hook sudah terdaftar", "sudah memuat pola meja", "blok Mode Tim sudah terbaru"]);
    console.log(`studio-kit ${manifes.versi} → ${manifes.nilai.proyek} (branch utama ${manifes.nilai.branchUtama}, CEO ${manifes.nilai.ceo})${a["dry-run"] ? "  [--dry-run: tidak ada yang ditulis]" : ""}`);
    for (const l of langkah) if (!diam.has(l.aksi)) console.log(`  ${l.aksi.padEnd(12)} ${l.rel}`);
    console.log(`  ${langkah.filter((l) => diam.has(l.aksi)).length} berkas tidak berubah · jabatan: ${manifes.jabatan.join(", ")}`);
    if (langkah.some((l) => l.aksi.startsWith("dilewati"))) console.log("\n⚠ Ada berkas yang dilewati karena berbeda dari kit. Bandingkan dengan folder kit/ lalu gabungkan manual, atau --paksa untuk menimpa.");
    if (!a.perbarui && !a["dry-run"]) {
      console.log("\nLangkah berikutnya:");
      console.log("  1. Sesuaikan .claude/tim/studio.config.json (port, db, salinLokal, paketPeran) dan .claude/tim/wilayah.json (glob folder).");
      console.log("  2. Cari penanda SESUAIKAN: grep -rn SESUAIKAN .claude docs/tim");
      console.log('  3. Uji perkakas: node --test "tools/tim/*.test.mjs" ".claude/hooks/*.test.mjs" ".claude/skills/uji-fitur/*.test.mjs"');
      console.log("  4. Tinjau `git status`, commit, lalu mulai: claude --agent cto");
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
