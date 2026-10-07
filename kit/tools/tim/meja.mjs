#!/usr/bin/env node
// Meja kerja Mode Tim: satu tiket = satu agent = satu worktree = satu branch (docs/tim/SOP_TIM.md).
//
//   node tools/tim/meja.mjs buka  --tiket T-012 --peran backend-engineer --slug kuota-sesi [--tipe feat] [--base <branchUtama>] [--slot N] [--sesi-cto <nama>] [--jalankan] [--dry-run]
//       --jalankan (Windows): tulis <worktree>/.claude/tim/jalankan.local.cmd lalu buka tab Windows Terminal "Meja T-###" yang
//       menjalankan claude --agent <peran> "<prompt awal>"; tunggu ≤ 20 dtk sampai claude.exe meja muncul (✅ pid / ❌ + perintah manual).
//   node tools/tim/meja.mjs daftar
//   node tools/tim/meja.mjs pesan --slug kuota-sesi   (cetak ulang pesan TUGAS untuk SendMessage, SOP §11)
//   node tools/tim/meja.mjs tutup --slug kuota-sesi [--hapus-branch] [--hapus-db] [--paksa] [--hentikan-proses] [--slot N] [--semua-branch]
//       Menolak (tanpa mengubah apa pun) bila ada proses yang command line/executable-nya di folder worktree atau yang
//       LISTEN di port slot, atau tab meja (claude.exe ber-T-### meja itu + cmd.exe induknya; T-027); --hentikan-proses
//       menghentikan HANYA proses itu (+anak) — shell tab dibiarkan keluar sendiri agar tabnya tertutup — lalu lanjut. Tiap langkah (folder,
//       branch, DB) berdiri sendiri; akhiri dengan ringkasan ✅/❌, kode keluar ≠ 0 bila ada yang gagal.
//       Meja setengah tertutup (git sudah melepas worktree) dituntaskan lewat slug yang sama; --slot N bila
//       meja.local.json sudah hilang. DB yang dihapus hanya <awalan>_s<N>_test/_dev milik slot itu (db.perintahHapus di konfigurasi).
//
// Konfigurasi proyek: .claude/tim/studio.config.json (port slot, DB test, berkas lokal, paket per jabatan) — lihat KONFIG_BAWAAN di meja-lib.mjs.
//
// Worktree dibuat di <folder induk repo>/worktrees/<slug> (pola yang sudah dipakai proyek ini).
// Identitas meja ditulis ke <worktree>/.claude/tim/meja.local.json (di-gitignore) dan dibaca hook jaga-wilayah.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aturKonfig, namaPort, portSlot, pilihSlot, namaBranch, validasiArgs, parseArgs, infoKomunikasi, pesanTugas, promptAwal, MAKS_SLOT,
  parseProsesWin, parseProsesPosix, parsePortWin, parsePortLsof, rantaiLeluhur, deteksiPemakai, pesanPemakai,
  DIR_PELUNCUR, NAMA_PELUNCUR, NAMA_BENDERA_TUTUP, isiPeluncur, argsWt, cariSesiBaru, deteksiTabMeja, gabungPemakai, rencanaHentikan,
  validasiNamaDb, namaDbSlot, slugAman, folderMejaSah, terbuktiBekasMeja, gitdirMejaSah, normPath, slotBolehDitutup, semuaTurunan, daftarPemakaiTeks, branchUntukSlug, perintahHapusFolder, layakFallbackHapus, jalankanLangkah, ringkasLangkah, kodeKeluar,
} from "./meja-lib.mjs";

const git = (args, cwd, timeout) => execFileSync("git", args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }).trim();

// Root checkout utama (bukan worktree) — sama dari mana pun skrip dipanggil.
const DI_SINI = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(git(["rev-parse", "--path-format=absolute", "--git-common-dir"], DI_SINI));
const KONFIG_REL = ".claude/tim/studio.config.json";
const K = (() => {
  const p = join(ROOT, KONFIG_REL);
  if (!existsSync(p)) return aturKonfig({});
  try { return aturKonfig(JSON.parse(readFileSync(p, "utf8"))); } catch (e) { console.error(`❌ ${KONFIG_REL}: ${e.message}`); process.exit(1); }
})();
const FOLDER_WORKTREE = resolve(ROOT, K.folderWorktree);
const MEJA_REL = ".claude/tim/meja.local.json";

// Berkas lokal tak ter-commit yang dibutuhkan untuk menjalankan/menguji. Keystore SENGAJA tidak disalin.
const SALIN_LOKAL = K.salinLokal;

// Paket npm yang perlu dipasang per peran (worktree baru tidak punya node_modules).
// `npm test` di admin ikut menjalankan test `design/` → peran yang memasang admin juga butuh design.
const PAKET_PERAN = K.paketPeran;
const perintahPasang = (p) => K.perintahPasang.replaceAll("{paket}", p);

function daftarWorktree() {
  const out = git(["worktree", "list", "--porcelain"], ROOT);
  return out.split(/\r?\n\r?\n/).filter(Boolean).map((blok) => {
    const baris = Object.fromEntries(blok.split(/\r?\n/).map((l) => [l.split(" ")[0], l.slice(l.indexOf(" ") + 1)]));
    const path = baris.worktree;
    const mejaPath = join(path, MEJA_REL);
    const meja = existsSync(mejaPath) ? JSON.parse(readFileSync(mejaPath, "utf8")) : null;
    return { path, branch: (baris.branch ?? "").replace("refs/heads/", ""), meja };
  });
}

function peranTerdaftar() {
  const aturan = JSON.parse(readFileSync(join(ROOT, ".claude/tim/wilayah.json"), "utf8"));
  return Object.keys(aturan.peran);
}

function buka(a) {
  const args = { tipe: "feat", base: K.branchUtama, ...a };
  validasiArgs(args, peranTerdaftar());
  const komunikasi = infoKomunikasi(args.slug, args["sesi-cto"]);
  const terpakai = daftarWorktree().filter((w) => w.meja).map((w) => w.meja.slot);
  const slot = pilihSlot(terpakai, args.slot !== undefined ? Number(args.slot) : undefined);
  const branch = namaBranch(args.tipe, args.slug);
  const wt = join(FOLDER_WORKTREE, args.slug);
  if (existsSync(wt)) throw new Error(`folder ${wt} sudah ada`);
  const meja = {
    tiket: args.tiket,
    peran: args.peran,
    slot,
    branch,
    base: args.base,
    ...portSlot(slot),
    dibuka: new Date().toISOString(),
    komunikasi,
  };

  console.log(`Meja ${args.tiket} · ${args.peran} · slot ${slot}\n  worktree: ${wt}\n  branch  : ${branch} (dari ${args.base})`);
  if (args["dry-run"]) {
    console.log("\n(--dry-run) tidak ada yang dibuat. Isi meja.local.json:\n" + JSON.stringify(meja, null, 2));
    console.log(`\nPerintah sesi meja:\n  claude --agent ${args.peran} "${promptAwal(meja)}"`);
    if (args.jalankan) jalankanTab(meja, wt, args.slug, { dryRun: true });
    cetakPesan(meja);
    return;
  }

  // K1 (T-027 revisi 1): peluncur & argumen wt divalidasi SEBELUM worktree dibuat → path bermasalah gagal tanpa sisa.
  if (args.jalankan && process.platform === "win32") siapkanTab(meja, wt);

  mkdirSync(FOLDER_WORKTREE, { recursive: true });
  git(["worktree", "add", wt, "-b", branch, args.base], ROOT);
  mkdirSync(join(wt, ".claude/tim"), { recursive: true });
  writeFileSync(join(wt, MEJA_REL), JSON.stringify(meja, null, 2) + "\n");

  for (const rel of SALIN_LOKAL) {
    const src = join(ROOT, rel);
    if (existsSync(src) && !existsSync(join(wt, rel))) {
      mkdirSync(dirname(join(wt, rel)), { recursive: true });
      copyFileSync(src, join(wt, rel));
      console.log(`  disalin : ${rel}`);
    }
  }

  const templat = [join(wt, "docs/tim/templat/LAPORAN.md"), join(ROOT, "docs/tim/templat/LAPORAN.md")].find(existsSync);
  const laporan = join(wt, `docs/tim/laporan/${args.tiket}.md`);
  if (templat && !existsSync(laporan)) {
    mkdirSync(dirname(laporan), { recursive: true });
    const isi = readFileSync(templat, "utf8")
      .replaceAll("{{TIKET}}", args.tiket)
      .replaceAll("{{PERAN}}", args.peran)
      .replaceAll("{{BRANCH}}", branch)
      .replaceAll("{{SLOT}}", String(slot));
    writeFileSync(laporan, isi);
    console.log(`  laporan : docs/tim/laporan/${args.tiket}.md`);
  }

  const paket = PAKET_PERAN[args.peran] ?? [];
  if (args.jalankan) {
    const hasil = jalankanTab(meja, wt, args.slug);
    if (hasil.ok) {
      if (paket.length) console.log(`  (paket npm worktree belum terpasang — sesi meja menjalankan sendiri bila perlu: ${paket.map(perintahPasang).join(" · ")})`);
      cetakPesan(meja);
      return;
    }
    if (hasil.gagal) process.exitCode = 1;
  }
  console.log("\nLangkah berikutnya (tab terminal baru):");
  console.log(`  cd "${wt}"`);
  for (const p of paket) console.log(`  ${perintahPasang(p)}`);
  if (meja.testDatabaseUrl) {
    const env = K.db.envTest ?? "TEST_DATABASE_URL";
    console.log(`  # test dengan DB slot sendiri (jangan pakai DB bersama):`);
    console.log(`  #   bash       : ${env}="${meja.testDatabaseUrl}" <perintah test>`);
    console.log(`  #   PowerShell : $env:${env}="${meja.testDatabaseUrl}"; <perintah test>`);
  }
  if (namaPort().length) console.log(`  # port slot ${slot}: ${namaPort().map((n) => `${n} ${meja[n]}`).join(" · ")}`);
  console.log(`  claude --agent ${args.peran} "${promptAwal(meja)}"`);
  cetakPesan(meja);
}

// ---- buka --jalankan (T-027) ----------------------------------------------------------------------------

const WT = process.env.MEJA_WT || "wt.exe";
const TIMEOUT_JALANKAN_MS = Number(process.env.MEJA_TIMEOUT_JALANKAN_MS) || 20_000;

// claude.exe absolut (installer native) agar tab tak bergantung PATH lingkungan Windows Terminal; gagal → "claude" polos.
function cariClaude() {
  try {
    const baris = execFileSync("where.exe", ["claude"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/);
    return baris.map((x) => x.trim()).find((x) => /^[A-Za-z]:\\.*\.exe$/i.test(x) && !x.includes('"')) ?? "claude";
  } catch { return "claude"; }
}

function cetakManual(meja, wt, peluncur) {
  console.log("Buka tab meja secara manual:");
  if (peluncur && existsSync(peluncur)) {
    console.log(`  PowerShell/cmd : wt -w 0 new-tab --title "Meja ${meja.tiket}" -d "${wt}" cmd /d /c "${peluncur}"`);
    console.log(`  Git Bash       : MSYS_NO_PATHCONV=1 wt -w 0 new-tab --title "Meja ${meja.tiket}" -d "${wt}" cmd /d /c "${peluncur}"`);
  }
  console.log(`  atau tab baru  : cd "${wt}"  lalu  claude --agent ${meja.peran} "${promptAwal(meja)}"`);
}

/**
 * Buka tab Windows Terminal meja & verifikasi claude.exe-nya muncul. Hasil: { ok } (tab terverifikasi), { manual } (bukan Windows /
 * wt.exe tak ada / dry-run — bukan galat), atau { gagal } (❌; worktree tetap ada & tercatat di `daftar`).
 */
// Isi peluncur + argumen wt (murni, bisa melempar) — dipanggil sebelum worktree dibuat (K1) dan saat membuka tab.
function siapkanTab(meja, wt) {
  const peluncur = join(wt, DIR_PELUNCUR, NAMA_PELUNCUR);
  const isi = isiPeluncur({ tiket: meja.tiket, peran: meja.peran, prompt: promptAwal(meja), claude: cariClaude() });
  return { peluncur, isi, args: argsWt({ tiket: meja.tiket, wt, peluncur }) };
}

function jalankanTab(meja, wt, slug, { dryRun = false } = {}) {
  if (process.platform !== "win32") {
    console.log("\n(--jalankan: bukan Windows — tab tidak dibuka otomatis; pakai perintah di bawah.)");
    return { manual: true };
  }
  const { peluncur, isi, args } = siapkanTab(meja, wt);
  if (dryRun) {
    console.log(`\n(--jalankan --dry-run) isi peluncur ${peluncur}:\n${isi.replace(/\r\n$/, "").split("\r\n").map((b) => `  │ ${b}`).join("\n")}`);
    console.log(`\nArgumen ${WT} (execFileSync, tanpa shell):\n  ${JSON.stringify(args)}`);
    return { manual: true };
  }
  writeFileSync(peluncur, isi);
  console.log(`  peluncur: ${DIR_PELUNCUR}/${NAMA_PELUNCUR}`);
  const batalkan = `Worktree tetap ada (tercatat di: node tools/tim/meja.mjs daftar). Batalkan meja: node tools/tim/meja.mjs tutup --slug ${slug} --paksa --hapus-branch --hentikan-proses`;
  let sebelum;
  try { sebelum = new Set(ambilProses().map((p) => p.pid)); }
  catch (e) {
    console.log(`\n❌ daftar proses tak terbaca (${String(e.message).split(/\r?\n/)[0]}) — tab tidak dibuka karena hasilnya tak bisa diverifikasi.`);
    cetakManual(meja, wt, peluncur);
    console.log(batalkan);
    return { gagal: true };
  }
  try {
    execFileSync(WT, args, { stdio: "ignore", timeout: 15_000 });
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log(`\n(--jalankan: ${WT} tidak ditemukan — tab tidak dibuka otomatis.)`);
      cetakManual(meja, wt, peluncur);
      return { manual: true };
    }
    console.log(`\n❌ ${WT} gagal: ${String(e.stderr || e.message).trim().split(/\r?\n/)[0]}`);
    cetakManual(meja, wt, peluncur);
    console.log(batalkan);
    return { gagal: true };
  }
  const batas = Date.now() + TIMEOUT_JALANKAN_MS;
  let galat = "";
  for (;;) {
    tidur(Math.min(1000, TIMEOUT_JALANKAN_MS));
    if (Date.now() >= batas) break; // batas dicek SEBELUM tiap pemeriksaan (batas kecil = gagal pasti, untuk uji)
    try {
      const baru = cariSesiBaru(ambilProses(), meja.tiket, sebelum);
      if (baru.length) {
        console.log(`\n✅ Tab "Meja ${meja.tiket}" terbuka — claude.exe pid ${baru.map((p) => p.pid).join(", ")} (--agent ${meja.peran}).`);
        return { ok: true };
      }
    } catch (e) { galat = String(e.message).split(/\r?\n/)[0]; }
  }
  console.log(`\n❌ Sesi claude meja ${meja.tiket} tidak terdeteksi dalam ${(TIMEOUT_JALANKAN_MS / 1000).toFixed(1)} dtk${galat ? ` (${galat})` : ""}. Periksa tab "Meja ${meja.tiket}" (bisa jadi terbuka tetapi claude gagal start).`);
  cetakManual(meja, wt, peluncur);
  console.log(batalkan);
  return { gagal: true };
}

// SOP §11: cadangan bila sesi meja sudah terbuka tanpa prompt awal — CTO → ListAgents → SendMessage.
function cetakPesan(meja) {
  console.log(`\nKomunikasi (SOP §11): sesi meja di atas langsung bekerja & melapor ke CTO lewat SendMessage.`);
  console.log(`Bila sesi meja sudah terbuka tanpa prompt awal, CTO → ListAgents → sesi berawalan "${meja.komunikasi.awalanSesiMeja}" → SendMessage:`);
  console.log(pesanTugas(meja).replace(/^/gm, "  │ "));
}

function pesan(a) {
  if (!a.slug) throw new Error("--slug wajib");
  const w = daftarWorktree().find((x) => x.meja && resolve(x.path) === resolve(FOLDER_WORKTREE, a.slug));
  if (!w) throw new Error(`meja '${a.slug}' tidak ditemukan (lihat: node tools/tim/meja.mjs daftar)`);
  // Meja yang dibuka sebelum §11 belum punya blok komunikasi; --sesi-cto boleh diberikan di sini.
  const komunikasi = a["sesi-cto"] ? infoKomunikasi(a.slug, a["sesi-cto"]) : (w.meja.komunikasi ?? infoKomunikasi(a.slug));
  console.log(`Perintah sesi meja (di "${w.path}"):\n  claude --agent ${w.meja.peran} "${promptAwal({ ...w.meja, komunikasi })}"`);
  cetakPesan({ ...w.meja, komunikasi });
}

function daftar() {
  const meja = daftarWorktree().filter((w) => w.meja);
  if (!meja.length) return console.log("Tidak ada meja terbuka.");
  let merged = [];
  try { merged = git(["branch", "--merged", K.branchUtama, "--format=%(refname:short)"], ROOT).split(/\r?\n/); } catch {}
  for (const w of meja.sort((x, y) => x.meja.slot - y.meja.slot)) {
    const status = git(["status", "--porcelain"], w.path) ? "ada perubahan" : "bersih";
    const m = merged.includes(w.branch) ? "sudah di-merge" : "belum di-merge";
    console.log(`slot ${w.meja.slot} · ${w.meja.tiket} · ${w.meja.peran} · ${w.branch} · ${status} · ${m}\n        ${w.path}`);
  }
}

// ---- tutup meja (T-009) -------------------------------------------------------------------------------

const TIMEOUT_REMOVE_MS = Number(process.env.MEJA_TIMEOUT_REMOVE_MS) || 120_000;
const tidur = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Tetap-tertutup: bila deteksi proses/port gagal, JANGAN dianggap "tidak ada proses" (lempar galat → tutup berhenti).
function ambilProses() {
  if (process.platform === "win32") {
    // Keluaran per baris "pid<TAB>ppid<TAB>nama<TAB>exe<TAB>cmd"; karakter kontrol per kolom dibuang (JSON bisa gagal diurai).
    const skrip =
      "$ErrorActionPreference='Stop'; $t=[char]9; function s($x){ ([string]$x) -replace '[\\x00-\\x1f]',' ' }; " +
      "Get-CimInstance Win32_Process | ForEach-Object { (s $_.ProcessId)+$t+(s $_.ParentProcessId)+$t+(s $_.Name)+$t+(s $_.ExecutablePath)+$t+(s $_.CommandLine) }";
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", skrip], { encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
    const daftarProses = parseProsesWin(out);
    if (!daftarProses.length) throw new Error("daftar proses kosong/tak terbaca");
    return daftarProses;
  }
  const out = execFileSync("ps", ["-eo", "pid=,ppid=,comm=,args="], { encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
  const daftarProses = parseProsesPosix(out);
  if (!daftarProses.length) throw new Error("daftar proses kosong/tak terbaca");
  return daftarProses;
}

function ambilListener(ports) {
  if (!ports.length) return [];
  if (process.platform === "win32") {
    const skrip =
      `$t=[char]9; try { Get-NetTCPConnection -State Listen -LocalPort ${ports.join(",")} -ErrorAction Stop | ForEach-Object { "$($_.LocalPort)$t$($_.OwningProcess)" } } ` +
      "catch { if ($_.CategoryInfo.Category -ne 'ObjectNotFound') { [Console]::Error.WriteLine($_.Exception.Message); exit 3 } }; exit 0";
    return parsePortWin(execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", skrip], { encoding: "utf8", timeout: 30_000 }));
  }
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${ports.join(",")}`, "-sTCP:LISTEN", "-Fpn"], { encoding: "utf8", timeout: 30_000 });
    return parsePortLsof(out);
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log("(lsof tidak tersedia — deteksi port dilewati, hanya path/command line)");
      return [];
    }
    if (e.status === 1 && !String(e.stdout ?? "").trim()) return []; // lsof: tidak ada yang cocok
    throw e;
  }
}

function deteksiMeja({ akar, ports, tiket }) {
  const proses = ambilProses();
  const kecuali = rantaiLeluhur(proses, process.pid);
  kecuali.add(process.ppid);
  const pemakai = gabungPemakai(
    deteksiPemakai({ proses, listener: ambilListener(ports), akar, portSlotMeja: ports, kecuali }),
    /^T-\d+$/.test(tiket ?? "") ? deteksiTabMeja({ proses, tiket, akar, kecuali }) : [],
  );
  return { pemakai, proses, kecuali };
}

const hidup = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

// Hentikan HANYA proses hasil deteksi; tunggu sampai mati (±10 dtk). Kembalikan pid yang masih hidup (gagal) + catatan.
function hentikan(pemakaiAwal, { proses = [], kecuali = new Set(), akar } = {}) {
  if (process.platform === "win32") return hentikanWin(pemakaiAwal, { proses, kecuali, akar });
  const catatan = [];
  // Windows: taskkill /T mematikan pohon. POSIX: kita hitung turunannya sendiri dari ppid (ps).
  const turunan = process.platform === "win32" ? [] : semuaTurunan(proses, pemakaiAwal.map((x) => x.pid), kecuali);
  const pemakai = [...pemakaiAwal, ...turunan.map((pid) => ({ pid, nama: "(anak)" }))];
  for (const p of pemakai) {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "pipe", encoding: "utf8", timeout: 15_000 }); }
      catch (e) { catatan.push(`taskkill pid ${p.pid} gagal: ${String(e.stderr || e.stdout || e.message).trim().split(/\r?\n/)[0]}`); }
    } else {
      try { process.kill(p.pid, "SIGTERM"); } catch (e) { catatan.push(`kill pid ${p.pid} gagal: ${e.code ?? e.message}`); }
    }
  }
  const batas = Date.now() + 10_000;
  let sisa = pemakai.filter((p) => hidup(p.pid));
  while (sisa.length && Date.now() < batas) { tidur(250); sisa = sisa.filter((p) => hidup(p.pid)); }
  if (sisa.length && process.platform !== "win32") {
    for (const p of sisa) { try { process.kill(p.pid, "SIGKILL"); } catch {} }
    const batas2 = Date.now() + 3_000;
    while (sisa.length && Date.now() < batas2) { tidur(200); sisa = sisa.filter((p) => hidup(p.pid)); }
  }
  return { sisa, catatan };
}

const taskkill = (pid, catatan) => {
  try { execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "pipe", encoding: "utf8", timeout: 15_000 }); }
  catch (e) { if (hidup(pid)) catatan.push(`taskkill pid ${pid} gagal: ${String(e.stderr || e.stdout || e.message).trim().split(/\r?\n/)[0]}`); }
};

// Windows (T-027): anak shell tab (claude, cmd interaktif) dihentikan dulu; shell tab dibiarkan keluar sendiri (exit 0 →
// Windows Terminal menutup tab). Bendera tutup membuat peluncur langsung exit 0 alih-alih membuka cmd interaktif. Shell yang
// masih hidup setelah ±8 dtk baru dipaksa (tabnya bisa tetap terbuka berisi "process exited").
function hentikanWin(pemakai, { proses, kecuali, akar }) {
  const catatan = [];
  const { langsung, shell } = rencanaHentikan(pemakai, proses, kecuali);
  if (shell.length && akar && existsSync(join(akar, DIR_PELUNCUR))) {
    try { writeFileSync(join(akar, DIR_PELUNCUR, NAMA_BENDERA_TUTUP), `tutup ${new Date().toISOString()}\n`); } catch {}
  }
  for (const pid of langsung) taskkill(pid, catatan);
  let sisaShell = shell.filter(hidup);
  const batasShell = Date.now() + 8_000;
  while (sisaShell.length && Date.now() < batasShell) { tidur(250); sisaShell = sisaShell.filter(hidup); }
  for (const pid of sisaShell) {
    catatan.push(`shell tab ${pid} tidak keluar sendiri → dipaksa (tabnya bisa tetap terbuka berisi "process exited"; tutup manual)`);
    taskkill(pid, catatan);
  }
  const semua = [...new Set([...pemakai.map((p) => p.pid), ...langsung])];
  const batas = Date.now() + 10_000;
  let sisa = semua.filter(hidup);
  while (sisa.length && Date.now() < batas) { tidur(250); sisa = sisa.filter(hidup); }
  return { sisa: sisa.map((pid) => ({ pid })), catatan };
}

function cetakPerintahHapus(path) {
  const p = perintahHapusFolder(path);
  return `hapus manual setelah penguncinya ditutup — cmd: ${p.cmd}  |  PowerShell: ${p.powershell}`;
}

// Argumen validasi gitdir untuk folder `wtPath` (isi `.git` + berkas balik) — dinilai oleh gitdirMejaSah (murni).
function bacaGitdir(wtPath, semuaMeja) {
  let gitdir = null;
  try { gitdir = readFileSync(join(wtPath, ".git"), "utf8").match(/gitdir:\s*(.+)/)?.[1]?.trim() ?? null; } catch {}
  let backLink = null;
  if (gitdir) { try { backLink = readFileSync(join(gitdir, "gitdir"), "utf8").trim(); } catch {} }
  const terdaftarLain = semuaMeja.map((x) => x.path).filter((x) => normPath(x) !== normPath(wtPath));
  return { gitdir, backLink, wtPath, root: ROOT, terdaftarLain };
}

// Hapus folder worktree (git dulu, dengan batas waktu). Hanya galat kunci-berkas yang boleh jatuh ke hapus-langsung.
function hapusFolder(path, terdaftar) {
  if (terdaftar) {
    try {
      git(["worktree", "remove", "--force", path], ROOT, TIMEOUT_REMOVE_MS);
      if (!existsSync(path)) return "worktree dihapus";
    } catch (e) {
      const pesan = String(e.stderr || e.message);
      if (!layakFallbackHapus(pesan, e.code)) {
        return { ok: false, info: `git worktree remove gagal: ${pesan.trim().split(/\r?\n/).pop()} (worktree terkunci? coba \`git worktree unlock\`)` };
      }
    }
  }
  const gitdirArgs = bacaGitdir(path, daftarWorktree()); // dibaca SEBELUM folder dihapus
  try { rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch {}
  // Registrasi git hanya dibuang bila tervalidasi penuh (bukan milik meja aktif lain, bukan path sembarang).
  if (existsSync(path) && gitdirMejaSah(gitdirArgs)) { try { rmSync(gitdirArgs.gitdir, { recursive: true, force: true }); } catch {} }
  try { git(["worktree", "prune"], ROOT); } catch {}
  if (existsSync(path)) return { ok: false, info: `folder masih ada (terkunci proses lain); registrasi git sudah dilepas — ${cetakPerintahHapus(path)}` };
  return "folder dihapus (setelah percobaan ulang)";
}

function hapusDb(slot) {
  if (!K.db?.perintahHapus) return "DB: tidak dikonfigurasi (db.perintahHapus) — dilewati";
  const [perintah, ...argv] = K.db.perintahHapus;
  const hasil = [];
  for (const nama of namaDbSlot(slot)) {
    if (!validasiNamaDb(nama, slot)) throw new Error(`nama DB '${nama}' bukan milik slot ${slot} — ditolak`);
    try {
      execFileSync(perintah, argv.map((x) => (x === "{db}" ? nama : x)), { stdio: "pipe", encoding: "utf8", timeout: 60_000 });
      hasil.push(nama);
    } catch (e) {
      throw new Error(`hapus DB ${nama} gagal: ${String(e.stderr || e.message).trim().split(/\r?\n/)[0]} (Docker/Postgres jalan?)`);
    }
  }
  return `DB dihapus: ${hasil.join(", ")}`;
}

function cabangDaftar() {
  return git(["branch", "--format=%(refname:short)"], ROOT).split(/\r?\n/).filter(Boolean);
}

function tutup(a) {
  if (!a.slug || a.slug === true) throw new Error("--slug wajib");
  // Slug & folder divalidasi SEBELUM apa pun: '.', '..', path, atau absolut tak boleh mengarah ke luar worktrees/<slug>.
  if (!slugAman(a.slug)) throw new Error(`--slug '${a.slug}' tidak sah: huruf kecil/angka dipisah '-', mis. kuota-sesi`);
  const wtPath = resolve(FOLDER_WORKTREE, a.slug);
  if (!folderMejaSah(wtPath, FOLDER_WORKTREE, a.slug)) throw new Error(`folder meja '${wtPath}' bukan <worktrees>/<slug> — ditolak`);
  const semuaMeja = daftarWorktree();
  const w = semuaMeja.find((x) => normPath(x.path) === normPath(wtPath));
  const slotArg = a.slot !== undefined ? Number(a.slot) : undefined;
  if (slotArg !== undefined && (!Number.isInteger(slotArg) || slotArg < 1 || slotArg > MAKS_SLOT)) throw new Error(`--slot harus 1–${MAKS_SLOT}`);

  // Meja setengah tertutup: worktree sudah dilepas git, tetapi folder / branch / DB masih tersisa → tuntaskan sisanya.
  const cabang = w ? [w.branch] : branchUntukSlug(cabangDaftar(), a.slug);
  const folderAda = existsSync(wtPath);
  let mejaJson = w?.meja ?? null;
  if (!mejaJson) { try { mejaJson = JSON.parse(readFileSync(join(wtPath, MEJA_REL), "utf8")); } catch {} }
  if (!w && !folderAda && !cabang.length) {
    throw new Error(`meja '${a.slug}' tidak ditemukan (tak ada worktree, folder, atau branch */${a.slug}; lihat: node tools/tim/meja.mjs daftar)`);
  }
  const slotLain = semuaMeja.filter((x) => x !== w && x.meja && Number.isInteger(x.meja.slot)).map((x) => x.meja.slot);
  const cek = slotBolehDitutup({ slotArg, mejaJsonSlot: mejaJson?.slot, slotLain });
  if (!cek.ok) throw new Error(`${cek.alasan}. Tidak ada yang diubah.`);
  const slot = cek.slot;
  if (cabang.length > 1 && !a["semua-branch"]) {
    throw new Error(`ada ${cabang.length} branch untuk slug ini (${cabang.join(", ")}). Tidak ada yang diubah — ulangi dengan --semua-branch bila memang semuanya dihapus.`);
  }
  // Folder tak terdaftar: hanya boleh dihapus bila terbukti bekas meja repo ini.
  let bekasMeja = true;
  if (!w && folderAda) {
    bekasMeja = terbuktiBekasMeja({ adaMejaJson: existsSync(join(wtPath, MEJA_REL)), ...bacaGitdir(wtPath, semuaMeja) });
  }
  if (!w) console.log(`(meja '${a.slug}' tidak terdaftar di git — menuntaskan sisa: ${[folderAda && "folder", cabang.length && "branch", slot !== undefined && "DB slot"].filter(Boolean).join(", ") || "-"})`);

  // --- Pemeriksaan sebelum mengubah APA PUN ---
  if (w) {
    const merged = git(["branch", "--merged", K.branchUtama, "--format=%(refname:short)"], ROOT).split(/\r?\n/);
    if (!merged.includes(w.branch) && !a.paksa) {
      throw new Error(`${w.branch} belum di-merge ke ${K.branchUtama}. Integrasikan dulu (CTO) atau pakai --paksa bila memang dibuang.`);
    }
    // meja.local.json & berkas salinan di-gitignore → `worktree remove` butuh --force; perubahan ter-track dicek manual.
    const kotor = git(["status", "--porcelain", "--untracked-files=no"], w.path);
    if (kotor && !a.paksa) throw new Error(`worktree masih punya perubahan belum di-commit:\n${kotor}`);
  }
  const ports = mejaJson ? namaPort().map((n) => mejaJson[n]).filter(Number.isInteger) : slot !== undefined ? Object.values(portSlot(slot)).filter(Number.isInteger) : [];
  let pemakai, prosesSemua, kecualiSemua;
  try {
    ({ pemakai, proses: prosesSemua, kecuali: kecualiSemua } = folderAda || ports.length ? deteksiMeja({ akar: wtPath, ports, tiket: mejaJson?.tiket }) : { pemakai: [], proses: [], kecuali: new Set() });
  } catch (e) {
    throw new Error(`deteksi proses/port gagal (${String(e.stderr || e.message).trim().split(/\r?\n/)[0].slice(0, 200)}) — tutup dibatalkan, tidak ada yang diubah. Periksa manual lalu ulangi.`);
  }
  // W1 (T-027 revisi 1): claude yang hanya "ragu" (menyebut tiket ini tanpa prompt kanonik / bersama tiket lain) tidak memblokir & tidak dihentikan.
  const ragu = pemakai.filter((p) => p.ragu);
  pemakai = pemakai.filter((p) => !p.ragu);
  if (ragu.length) console.log(`⚠ ${ragu.length} sesi claude menyebut tiket ini tetapi TIDAK pasti milik meja ini — tidak disentuh (periksa manual):\n${daftarPemakaiTeks(ragu)}`);
  if (pemakai.length && !a["hentikan-proses"]) throw new Error(pesanPemakai(pemakai, { akar: wtPath, slug: a.slug }));
  if (pemakai.length) console.log(`Proses yang akan dihentikan (+ semua proses anaknya):\n${daftarPemakaiTeks(pemakai)}`);

  // --- Langkah mandiri ---
  const langkah = [];
  let terhenti = true;
  if (pemakai.length) {
    langkah.push({
      nama: "hentikan proses",
      fn: () => {
        if (!bekasMeja) { terhenti = false; return { ok: false, info: "dilewati: folder tidak terbukti bekas meja repo ini" }; }
        const { sisa, catatan } = hentikan(pemakai, { proses: prosesSemua, kecuali: kecualiSemua, akar: wtPath });
        terhenti = sisa.length === 0;
        const info = `${pemakai.map((p) => `${p.pid}(${p.nama})`).join(", ")}${catatan.length ? " · " + catatan.join("; ") : ""}`;
        return terhenti ? { ok: true, info: `dihentikan: ${info}` } : { ok: false, info: `masih hidup setelah ±10 dtk: ${sisa.map((p) => p.pid).join(", ")} · ${info}` };
      },
    });
  }
  if (folderAda || w) {
    langkah.push({
      nama: "folder/worktree",
      fn: () => {
        if (!bekasMeja) return { ok: false, info: `folder tidak terbukti bekas meja repo ini (tak ada ${MEJA_REL} / .git → ${ROOT}/.git/worktrees/<nama> yang sah) — TIDAK dihapus otomatis; periksa lalu ${cetakPerintahHapus(wtPath)}` };
        if (!terhenti) return { ok: false, info: "dilewati: proses belum mati" };
        return hapusFolder(wtPath, Boolean(w));
      },
    });
  }
  if (a["hapus-branch"]) {
    langkah.push({
      nama: "branch",
      fn: () => {
        if (!cabang.length) return `tidak ada branch */${a.slug}`;
        for (const b of cabang) git(["branch", a.paksa ? "-D" : "-d", b], ROOT);
        return `dihapus: ${cabang.join(", ")}`;
      },
    });
  }
  if (a["hapus-db"]) {
    langkah.push({ nama: "DB uji", fn: () => (slot === undefined ? { ok: false, info: "slot tak diketahui (meja.local.json hilang) — ulangi dengan --slot N" } : hapusDb(slot)) });
  }
  const hasil = jalankanLangkah(langkah);
  console.log(`\nRingkasan tutup '${a.slug}':\n${ringkasLangkah(hasil)}`);
  if (kodeKeluar(hasil)) process.exitCode = 1;
}


const [perintah, ...sisa] = process.argv.slice(2);
try {
  const a = parseArgs(sisa);
  if (perintah === "buka") buka(a);
  else if (perintah === "daftar") daftar();
  else if (perintah === "tutup") tutup(a);
  else if (perintah === "pesan") pesan(a);
  else console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 20).filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
} catch (e) {
  console.error(`Galat: ${e.message}`);
  process.exit(1);
}
