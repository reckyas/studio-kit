#!/usr/bin/env node
/**
 * Triase uji fitur — membaca perubahan git lalu menyarankan TINGKAT uji (T0–T3)
 * dan BLOK uji keamanan/performa yang relevan. Detail tiap blok: referensi.md.
 *
 *   node .claude/skills/uji-fitur/triase.mjs                 perubahan belum di-commit (+ untracked);
 *                                                            bila bersih → commit terakhir
 *   node .claude/skills/uji-fitur/triase.mjs --base <ref>    semua perubahan sejak <ref> (mis. awal fitur)
 *   node .claude/skills/uji-fitur/triase.mjs --rilis         paksa T3 (persiapan rilis / akhir fase besar)
 *   node .claude/skills/uji-fitur/triase.mjs --json          keluaran mesin
 *
 * Pemicu & area proyek: .claude/tim/uji.config.json (menambah/menimpa bawaan di triase-lib.mjs).
 * Hasil skrip adalah BATAS BAWAH. Boleh dinaikkan dengan alasan; diturunkan hanya dengan alasan tertulis.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { BLOK, gabungKonfig, cariPemicu, tentukanTingkat, blokWajib, ujiDasar } from "./triase-lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

let cfg;
try {
  const p = path.join(root, ".claude/tim/uji.config.json");
  cfg = gabungKonfig(existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
} catch (e) {
  console.error(`❌ .claude/tim/uji.config.json: ${e.message}`);
  process.exit(1);
}

// ---------- kumpulkan berkas & baris tambahan ----------
let files = [];
let added = "";
let sumber;
function diffAgainst(ref) {
  files.push(...git("diff", "--name-only", ref).split("\n").filter(Boolean));
  added += git("diff", "-U0", ref);
}
function untracked() {
  for (const f of git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)) {
    files.push(f);
    const p = path.join(root, f);
    try {
      if (statSync(p).size < 512 * 1024) added += `\n+++ b/${f}\n` + readFileSync(p, "utf8").split("\n").map((l) => "+" + l).join("\n");
    } catch {}
  }
}
const base = opt("--base");
const dirty = git("status", "--porcelain").trim().length > 0;
if (base) { diffAgainst(base); untracked(); sumber = `sejak ${base} (+ perubahan belum di-commit)`; }
else if (dirty) { diffAgainst("HEAD"); untracked(); sumber = "perubahan belum di-commit"; }
else {
  try { diffAgainst("HEAD~1"); sumber = "commit terakhir (HEAD~1..HEAD)"; }
  catch { sumber = "commit pertama — tidak ada pembanding"; }
}
files = [...new Set(files)].map((f) => f.replace(/\\/g, "/"));

const addedByFile = {};
{
  let cur = null;
  for (const line of added.split("\n")) {
    if (line.startsWith("+++ ")) { cur = line.replace(/^\+\+\+ (b\/)?/, "").trim(); continue; }
    if (cur && line.startsWith("+")) (addedByFile[cur] ??= []).push(line.slice(1));
  }
}

const hits = cariPemicu(files, addedByFile, cfg);
const { tingkat, alasan } = tentukanTingkat({ files, hits, rilis: flag("--rilis"), cfg });
const blok = blokWajib(tingkat, hits);
const dasar = tingkat === "T0" || tingkat === "—" ? [] : ujiDasar(files, cfg);
const hasil = { sumber, berkas: files.length, tingkat, alasan, pemicu: hits, blok, ujiDasar: dasar };

if (flag("--json")) {
  console.log(JSON.stringify(hasil, null, 2));
} else {
  const NAMA = { "—": "tidak ada", T0: "T0 Dokumen", T1: "T1 Dasar", T2: "T2 Terarah", T3: "T3 Maksimal" };
  console.log(`Triase uji — ${sumber} · ${files.length} berkas`);
  console.log(`Tingkat (batas bawah): ${NAMA[tingkat]} — ${alasan.join("; ")}`);
  for (const h of hits) console.log(`  pemicu ${h.id} [${h.bobot}] ${h.ket}: ${h.berkas.slice(0, 4).join(", ")}${h.berkas.length > 4 ? ` (+${h.berkas.length - 4})` : ""}`);
  if (dasar.length) {
    console.log("\nUji dasar (wajib T1+):");
    for (const d of dasar) console.log(`  ${d.area}: ${d.perintah.join(" · ")}`);
  } else if (tingkat !== "T0" && tingkat !== "—") {
    console.log("\nUji dasar (wajib T1+): lint + test + build paket yang disentuh (isi 'area' di .claude/tim/uji.config.json agar tercetak di sini).");
  }
  if (blok.length) {
    console.log("\nBlok wajib:");
    for (const b of blok) console.log(`  ${b} — ${BLOK[b]}`);
  }
}
