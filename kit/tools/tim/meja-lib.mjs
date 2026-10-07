// Logika murni "meja kerja" Mode Tim (tanpa I/O). SOP: docs/tim/SOP_TIM.md §Slot.
import { win32, posix } from "node:path";

export const MAKS_SLOT = 5;

/**
 * Konfigurasi proyek (.claude/tim/studio.config.json) — dibaca meja.mjs lalu dipasang lewat aturKonfig().
 *   branchUtama    : branch integrasi (base bawaan meja & acuan "sudah di-merge").
 *   folderWorktree : relatif ke root repo.
 *   port           : { nama: basis } → port slot N = basis + N (boleh kosong).
 *   db             : null, atau { awalan, urlTest (memuat {db}), envTest, perintahHapus (larik argv memuat {db}) }.
 *   salinLokal     : berkas lokal tak ter-commit yang disalin ke worktree baru (JANGAN keystore/secret rilis).
 *   paketPeran     : { jabatan: [folder paket] } → petunjuk pemasangan dependensi di worktree baru.
 *   perintahPasang : templat perintah per paket, memuat {paket}.
 */
export const KONFIG_BAWAAN = Object.freeze({
  branchUtama: "main",
  folderWorktree: "../worktrees",
  port: {},
  db: null,
  salinLokal: [],
  paketPeran: {},
  perintahPasang: "npm ci --prefix {paket}",
});
let K = KONFIG_BAWAAN;
export const konfig = () => K;

const KUNCI_MEJA = ["tiket", "peran", "slot", "branch", "base", "dibuka", "komunikasi", "testDb", "testDatabaseUrl"];

/** Validasi + pasang konfigurasi proyek. Melempar galat berbahasa jelas bila bentuknya salah. */
export function aturKonfig(mentah = {}) {
  const k = { ...KONFIG_BAWAAN, ...mentah };
  if (typeof k.branchUtama !== "string" || !/^[\w./-]{1,100}$/.test(k.branchUtama)) throw new Error("studio.config: branchUtama tidak sah");
  if (typeof k.folderWorktree !== "string" || !k.folderWorktree) throw new Error("studio.config: folderWorktree wajib teks");
  if (!k.port || typeof k.port !== "object" || Array.isArray(k.port)) throw new Error("studio.config: port harus objek { nama: basis }");
  for (const [nama, basis] of Object.entries(k.port)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(nama) || KUNCI_MEJA.includes(nama)) throw new Error(`studio.config: nama port '${nama}' tidak sah`);
    if (!Number.isInteger(basis) || basis < 1024 || basis + MAKS_SLOT > 65535) throw new Error(`studio.config: basis port '${nama}' harus bilangan 1024–65530`);
  }
  if (k.db !== null) {
    const d = k.db;
    if (!d || typeof d !== "object") throw new Error("studio.config: db harus null atau objek");
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(d.awalan ?? "")) throw new Error("studio.config: db.awalan wajib huruf kecil/angka/_ (diawali huruf)");
    if (typeof d.urlTest !== "string" || !d.urlTest.includes("{db}")) throw new Error("studio.config: db.urlTest wajib memuat {db}");
    if (d.perintahHapus !== undefined && (!Array.isArray(d.perintahHapus) || !d.perintahHapus.every((x) => typeof x === "string") || !d.perintahHapus.includes("{db}"))) {
      throw new Error("studio.config: db.perintahHapus harus larik argv yang memuat unsur '{db}'");
    }
  }
  if (!Array.isArray(k.salinLokal) || !k.salinLokal.every((x) => typeof x === "string" && !x.includes(".."))) throw new Error("studio.config: salinLokal harus larik path relatif");
  if (typeof k.perintahPasang !== "string" || !k.perintahPasang.includes("{paket}")) throw new Error("studio.config: perintahPasang wajib memuat {paket}");
  K = Object.freeze(k);
  return K;
}

/** Nama-nama port yang dikonfigurasi (kunci di meja.local.json). */
export const namaPort = () => Object.keys(K.port);
export const TIPE_BRANCH = ["feat", "fix", "docs", "chore", "test", "refactor", "perf"];

/** Port & DB test milik slot N: tiap port = basis + N; DB `<awalan>_sN_test` bila db dikonfigurasi. */
export function portSlot(n) {
  const hasil = Object.fromEntries(Object.entries(K.port).map(([nama, basis]) => [nama, basis + n]));
  if (K.db) {
    hasil.testDb = `${K.db.awalan}_s${n}_test`;
    hasil.testDatabaseUrl = K.db.urlTest.replaceAll("{db}", hasil.testDb);
  }
  return hasil;
}

/** Slot terkecil yang belum dipakai meja lain, atau slot yang diminta bila kosong. */
export function pilihSlot(terpakai, diminta) {
  if (diminta !== undefined) {
    if (!Number.isInteger(diminta) || diminta < 1 || diminta > MAKS_SLOT) throw new Error(`slot di luar rentang 1–${MAKS_SLOT}`);
    if (terpakai.includes(diminta)) throw new Error(`slot ${diminta} sedang dipakai meja lain`);
    return diminta;
  }
  for (let n = 1; n <= MAKS_SLOT; n++) if (!terpakai.includes(n)) return n;
  throw new Error(`semua ${MAKS_SLOT} slot penuh — tutup meja yang sudah di-merge dulu (node tools/tim/meja.mjs daftar)`);
}

export const namaBranch = (tipe, slug) => `${tipe}/${slug}`;

export function validasiArgs({ tiket, peran, slug, tipe }, daftarPeran) {
  if (!/^T-\d+$/.test(tiket ?? "")) throw new Error("--tiket wajib berformat T-<angka>, mis. T-012");
  if (!daftarPeran.includes(peran)) throw new Error(`--peran tidak dikenal. Pilihan: ${daftarPeran.filter((p) => p !== "cto").join(", ")}`);
  if (peran === "cto") throw new Error("CTO bekerja di checkout utama, bukan di meja worktree");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug ?? "")) throw new Error("--slug wajib huruf kecil/angka dipisah '-', mis. kuota-sesi");
  if (!TIPE_BRANCH.includes(tipe)) throw new Error(`--tipe harus salah satu: ${TIPE_BRANCH.join(", ")}`);
}

/**
 * Petunjuk komunikasi antar sesi (SOP §11): nama sesi Claude di meja diawali slug worktree;
 * nama sesi CTO (dari ListAgents) opsional, divalidasi agar tidak menyelundupkan teks ke pesan.
 */
export function infoKomunikasi(slug, sesiCto) {
  if (sesiCto !== undefined && (typeof sesiCto !== "string" || !/^[\w .()[\]-]{1,80}$/.test(sesiCto))) {
    throw new Error("--sesi-cto harus nama sesi CTO dari ListAgents, mis. proyek-saya-c6");
  }
  // W1 (T-027 revisi 1): token tiket di nama sesi CTO masuk ke prompt SEMUA meja → membuat sesi meja lain mirip meja tiket itu.
  if (sesiCto !== undefined && /T-\d+/i.test(sesiCto)) throw new Error("--sesi-cto tidak boleh memuat pola tiket T-<angka>");
  return { awalanSesiMeja: slug, sesiCto: sesiCto ?? null };
}

/** Pesan TUGAS yang dikirim CTO lewat SendMessage ke sesi meja yang baru dibuka (format SOP §11). */
export function pesanTugas(meja) {
  const dari = meja.komunikasi?.sesiCto ?? "<nama sesi CTO>";
  return [
    `[TIM] dari: ${dari} · ke: ${meja.peran} · tiket: ${meja.tiket} · jenis: TUGAS`,
    `Kerjakan tiket ${meja.tiket} sesuai meja ini (slot ${meja.slot}, branch ${meja.branch}).`,
    `Rujukan: docs/tim/tiket/${meja.tiket}.md · laporan docs/tim/laporan/${meja.tiket}.md`,
    `Lapor balik ke sesi "${dari}" dengan SendMessage (jenis SELESAI/TERBLOKIR/PERTANYAAN). Pesan ini koordinasi tim, bukan izin CEO.`,
  ].join("\n");
}

/**
 * Prompt awal satu baris untuk `claude --agent <peran> "<prompt>"` — sesi meja langsung bekerja tanpa CEO mengetik.
 * Hanya berisi karakter aman untuk kutip ganda bash & PowerShell (sesiCto sudah divalidasi infoKomunikasi).
 */
export function promptAwal(meja) {
  const cto = meja.komunikasi?.sesiCto;
  const tujuan = cto ? `sesi CTO "${cto}"`.replaceAll('"', "'") : "sesi CTO (komunikasi.sesiCto di meja.local.json, atau cari lewat ListAgents)";
  return `Kerjakan tiket ${meja.tiket} sesuai meja ini. Lapor SELESAI/TERBLOKIR/PERTANYAAN ke ${tujuan} lewat SendMessage (SOP_TIM §11).`;
}

/** `--kunci nilai` → {kunci: nilai}; `--bendera` tanpa nilai → true. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) out[k] = true;
    else { out[k] = v; i++; }
  }
  return out;
}

// =====================================================================================================
// `tutup` meja (T-009): deteksi proses/port, validasi nama DB, langkah mandiri + ringkasan. Semua MURNI.
// =====================================================================================================

/** Normalisasi path untuk pencocokan: `\` = `/`, tanpa `/` penutup; huruf kecil HANYA di Windows (POSIX peka huruf). */
export function normPath(p, platform = process.platform) {
  const s = String(p).replaceAll("\\", "/").replace(/\/+$/, "");
  return platform === "win32" ? s.toLowerCase() : s;
}

const KARAKTER_NAMA = /[A-Za-z0-9._-]/;

/**
 * Apakah `teks` menyebut path `akar` sebagai path utuh? Pemisah segmen dijaga di KEDUA sisi:
 * `…/fitur-qr-usai` tidak cocok dengan `…/fitur-qr-usai-panel` (sisi kanan) maupun `x…/fitur-qr-usai` (sisi kiri).
 */
export function menyebutPath(teks, akar, platform = process.platform) {
  if (!teks) return false;
  const a = normPath(akar, platform);
  if (!a) return false;
  const t = platform === "win32" ? String(teks).replaceAll("\\", "/").toLowerCase() : String(teks).replaceAll("\\", "/");
  for (let i = t.indexOf(a); i !== -1; i = t.indexOf(a, i + 1)) {
    const kiri = i === 0 ? "" : t[i - 1];
    const kanan = t[i + a.length] ?? "";
    if ((kiri === "" || !KARAKTER_NAMA.test(kiri)) && (kanan === "" || !KARAKTER_NAMA.test(kanan))) return true;
  }
  return false;
}

/** Himpunan pid `mulai` + semua leluhurnya (ParentProcessId berantai; aman dari siklus). */
export function rantaiLeluhur(proses, mulai) {
  const induk = new Map(proses.map((p) => [p.pid, p.ppid]));
  const hasil = new Set([mulai]);
  for (let pid = induk.get(mulai); pid !== undefined && pid > 0 && !hasil.has(pid); pid = induk.get(pid)) hasil.add(pid);
  return hasil;
}

/** "pid\tppid\tnama\texe\tcmd" per baris (Windows). Baris tanpa 5 kolom/pid bukan angka dibuang. */
export function parseProsesWin(teks) {
  const hasil = [];
  for (const baris of String(teks).split(/\r?\n/)) {
    const k = baris.split("\t");
    if (k.length !== 5 || !/^\d+$/.test(k[0]) || !/^\d+$/.test(k[1])) continue;
    hasil.push({ pid: Number(k[0]), ppid: Number(k[1]), nama: k[2], exe: k[3], cmd: k[4] });
  }
  return hasil;
}

/** `ps -eo pid=,ppid=,comm=,args=` (POSIX). Baris yang tak berpola dibuang. */
export function parseProsesPosix(teks) {
  const hasil = [];
  for (const baris of String(teks).split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(baris);
    if (m) hasil.push({ pid: Number(m[1]), ppid: Number(m[2]), nama: m[3], exe: "", cmd: m[4] });
  }
  return hasil;
}

/** "port\tpid" per baris (Get-NetTCPConnection, Windows). */
export function parsePortWin(teks) {
  const hasil = [];
  for (const baris of String(teks).split(/\r?\n/)) {
    const k = baris.split("\t");
    if (k.length === 2 && /^\d+$/.test(k[0]) && /^\d+$/.test(k[1])) hasil.push({ port: Number(k[0]), pid: Number(k[1]) });
  }
  return hasil;
}

/** `lsof -nP -iTCP -sTCP:LISTEN -Fpn`: baris `p<pid>` lalu `n<alamat>:<port>`. */
export function parsePortLsof(teks) {
  const hasil = [];
  let pid = null;
  for (const baris of String(teks).split(/\r?\n/)) {
    if (/^p\d+$/.test(baris)) pid = Number(baris.slice(1));
    else if (pid !== null && baris.startsWith("n")) {
      const m = /:(\d+)$/.exec(baris);
      if (m) hasil.push({ port: Number(m[1]), pid });
    }
  }
  return hasil;
}

/**
 * Proses yang mengganggu penghapusan worktree `akar`: command line / path executable di dalam folder, atau
 * LISTEN di port slot. `kecuali` = pid yang TIDAK boleh disentuh (alat ini + seluruh leluhurnya).
 * Hasil: [{ pid, nama, cmd, ports:[], alasan:[] }] terurut menurut pid.
 */
export function deteksiPemakai({ proses, listener = [], akar, portSlotMeja = [], kecuali = new Set(), platform = process.platform }) {
  const peta = new Map();
  const tambah = (p, alasan, port) => {
    const ada = peta.get(p.pid) ?? { pid: p.pid, nama: p.nama, cmd: p.cmd, ports: [], alasan: [] };
    ada.alasan.push(alasan);
    if (port !== undefined) ada.ports.push(port);
    peta.set(p.pid, ada);
  };
  for (const p of proses) {
    if (kecuali.has(p.pid)) continue;
    if (menyebutPath(p.cmd, akar, platform)) tambah(p, "command line di dalam worktree");
    else if (menyebutPath(p.exe, akar, platform)) tambah(p, "executable di dalam worktree");
  }
  const infoPid = new Map(proses.map((p) => [p.pid, p]));
  for (const l of listener) {
    if (kecuali.has(l.pid) || !portSlotMeja.includes(l.port)) continue;
    tambah(infoPid.get(l.pid) ?? { pid: l.pid, nama: "?", cmd: "" }, `LISTEN di port slot ${l.port}`, l.port);
  }
  // hanyaPort: tertangkap SEMATA lewat port slot (command line/exe tidak di dalam worktree) → bisa proses tak terkait.
  return [...peta.values()].map((p) => ({ ...p, hanyaPort: p.alasan.every((x) => x.startsWith("LISTEN")) })).sort((a, b) => a.pid - b.pid);
}

/** Teks penolakan (default tanpa --hentikan-proses): PID, nama, potongan command line, port, saran. */
export function daftarPemakaiTeks(pemakai) {
  return pemakai.map((p) => {
    const cmd = String(p.cmd ?? "").replace(/\s+/g, " ").trim();
    const port = p.ports.length ? ` · port ${[...new Set(p.ports)].join(",")}` : "";
    const awas = p.hanyaPort ? "  ⚠ hanya cocok lewat PORT slot — BUKAN di dalam worktree; pastikan ini memang server meja ini" : "";
    return `  pid ${p.pid} · ${p.nama}${port} · ${cmd.length > 100 ? cmd.slice(0, 100) + "…" : cmd}  [${p.alasan.join("; ")}]${awas}`;
  }).join("\n");
}

export function pesanPemakai(pemakai, { akar, slug }) {
  return [
    `Ada ${pemakai.length} proses yang masih memakai meja '${slug}' (${akar}). Tidak ada yang diubah.`,
    daftarPemakaiTeks(pemakai),
    `Saran: matikan server/terminalnya sendiri, atau ulangi dengan --hentikan-proses (menghentikan proses di atas + SEMUA proses anaknya).`,
  ].join("\n");
}

/** Nama DB yang boleh di-drop `tutup`: persis `<awalan>_s<slot>_test` / `<awalan>_s<slot>_dev` milik slot itu. */
export function validasiNamaDb(nama, slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAKS_SLOT) return false;
  if (!K.db) return false;
  return nama === `${K.db.awalan}_s${slot}_test` || nama === `${K.db.awalan}_s${slot}_dev`;
}

/** DB milik slot yang dihapus oleh `--hapus-db`. */
export const namaDbSlot = (slot) => (K.db ? [`${K.db.awalan}_s${slot}_test`, `${K.db.awalan}_s${slot}_dev`] : []);

/** Branch `<tipe>/<slug>` (tipe dari TIPE_BRANCH) di antara daftar nama branch. */
export function branchUntukSlug(daftar, slug) {
  return daftar.filter((b) => TIPE_BRANCH.some((t) => b === `${t}/${slug}`));
}

/** Perintah menghapus folder per shell (path dikutip; awalan `\\?\` untuk cmd agar tahan path panjang). */
export function perintahHapusFolder(path) {
  const w = String(path).replaceAll("/", "\\");
  return {
    cmd: `rd /s /q "\\\\?\\${w}"`,
    powershell: `Remove-Item -LiteralPath '${w.replaceAll("'", "''")}' -Recurse -Force`,
  };
}

/** Galat `git worktree remove` yang layak dicoba hapus-langsung (kunci berkas), BUKAN worktree terkunci `git worktree lock`. */
export function layakFallbackHapus(pesan, kode) {
  const t = String(pesan ?? "");
  if (/locked|git worktree unlock/i.test(t)) return false;
  return kode === "ETIMEDOUT" || /EBUSY|EPERM|Permission denied|Device or resource busy|being used by another process/i.test(t);
}

/**
 * Jalankan langkah satu per satu, MASING-MASING berdiri sendiri: galat satu langkah tidak melewati yang lain.
 * langkah = [{ nama, fn }]; fn mengembalikan string info, atau { ok:false, info } untuk gagal terkendali.
 */
export function jalankanLangkah(langkah) {
  return langkah.map(({ nama, fn }) => {
    try {
      const r = fn();
      if (r && typeof r === "object") return { nama, ok: r.ok !== false, info: r.info ?? "" };
      return { nama, ok: true, info: r ?? "" };
    } catch (e) {
      return { nama, ok: false, info: String(e?.message ?? e).split(/\r?\n/)[0] };
    }
  });
}

export const kodeKeluar = (hasil) => (hasil.some((h) => !h.ok) ? 1 : 0);

export function ringkasLangkah(hasil) {
  return hasil.map((h) => `${h.ok ? "✅" : "❌"} ${h.nama}${h.info ? " — " + h.info : ""}`).join("\n");
}

// ---- keamanan `tutup` meja: slug, bukti bekas meja, slot (T-009 revisi 2) ----

/** Slug sah = aturan yang sama dengan `buka` (`validasiArgs`): huruf kecil/angka dipisah `-`. Menolak `.`, `..`, path, absolut. */
export const slugAman = (slug) => typeof slug === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);

/** Folder meja harus PERSIS `<folderWorktree>/<slug>` (satu tingkat di bawah worktrees/), tak boleh `worktrees/` itu sendiri atau induknya. */
export function folderMejaSah(wtPath, folderWorktree, slug, platform = process.platform) {
  return slugAman(slug) && normPath(wtPath, platform) === `${normPath(folderWorktree, platform)}/${slug}`;
}

/**
 * Folder TAK terdaftar hanya boleh dihapus bila terbukti bekas meja repo ini: ada `.claude/tim/meja.local.json`, atau
 * `.git` (berkas) menunjuk gitdir `<ROOT>/.git/worktrees/…`.
 */
export function terbuktiBekasMeja({ adaMejaJson, ...gitdirArgs }) {
  return Boolean(adaMejaJson) || gitdirMejaSah(gitdirArgs);
}

/**
 * gitdir (isi `<folder>/.git`) yang BOLEH dihapus bersama folder bekas meja. Semua syarat wajib:
 * absolut; setelah resolve persis `<ROOT>/.git/worktrees/<satu-segmen>`; berkas balik `<gitdir>/gitdir` (isinya = `backLink`)
 * menunjuk `<wtPath>/.git`; dan bukan milik worktree terdaftar lain (`terdaftarLain` = path worktree selain wtPath).
 */
export function gitdirMejaSah({ gitdir, backLink, wtPath, root, terdaftarLain = [], platform = process.platform }) {
  if (!gitdir || !backLink) return false;
  const P = platform === "win32" ? win32 : posix;
  if (!P.isAbsolute(gitdir)) return false;
  const dasar = normPath(P.resolve(root, ".git", "worktrees"), platform);
  const g = normPath(P.resolve(gitdir), platform);
  if (!g.startsWith(`${dasar}/`)) return false;
  const sisa = g.slice(dasar.length + 1);
  if (!sisa || sisa.includes("/") || sisa === "." || sisa === "..") return false;
  const balik = normPath(P.resolve(String(backLink).trim()), platform);
  if (balik !== normPath(P.resolve(wtPath, ".git"), platform)) return false;
  return !terdaftarLain.some((x) => balik === normPath(P.resolve(x, ".git"), platform));
}

/**
 * Slot yang dipakai `tutup` (untuk DB & port). Menolak SEBELUM langkah apa pun bila:
 * tak ada worktree/folder/branch (--slot saja tak menjalankan apa pun); --slot ≠ slot di meja.local.json;
 * slot dipakai meja terdaftar lain (`slotLain`).
 */
export function slotBolehDitutup({ slotArg, mejaJsonSlot, slotLain = [] }) {
  if (slotArg !== undefined && mejaJsonSlot !== undefined && slotArg !== mejaJsonSlot) {
    return { ok: false, alasan: `--slot ${slotArg} berbeda dari slot meja ini (${mejaJsonSlot})` };
  }
  const slot = slotArg ?? mejaJsonSlot;
  if (slot !== undefined && slotLain.includes(slot)) {
    return { ok: false, alasan: `slot ${slot} sedang dipakai meja aktif lain — server & DB-nya tidak boleh disentuh` };
  }
  return { ok: true, slot };
}

/** Semua keturunan (anak, cucu, …) dari `akar` menurut ppid, tanpa pid di `kecuali`. Untuk menghentikan pohon proses di POSIX. */
export function semuaTurunan(proses, akar, kecuali = new Set()) {
  const anak = new Map();
  for (const p of proses) anak.set(p.ppid, [...(anak.get(p.ppid) ?? []), p.pid]);
  const hasil = new Set();
  const antre = [...akar];
  while (antre.length) {
    for (const c of anak.get(antre.shift()) ?? []) {
      if (!hasil.has(c) && !kecuali.has(c) && !akar.includes(c)) { hasil.add(c); antre.push(c); }
    }
  }
  return [...hasil];
}

// =====================================================================================================
// `buka --jalankan` & tab meja saat `tutup` (T-027). Semua MURNI; I/O ada di meja.mjs.
// =====================================================================================================

/** Peluncur & bendera tutup di dalam worktree (`<wt>/.claude/tim/`); keduanya lokal, ikut terhapus bersama folder meja. */
export const DIR_PELUNCUR = ".claude/tim";
export const NAMA_PELUNCUR = "jalankan.local.cmd";
export const NAMA_BENDERA_TUTUP = "tutup.local.flag";

/** Proses yang TIDAK PERNAH dihentikan `tutup` walau command line-nya menyebut worktree (mis. `wt -d <wt>` membuat WindowsTerminal baru). */
export const PROSES_TERLINDUNG = new Set(["windowsterminal.exe", "openconsole.exe", "wt.exe", "conhost.exe", "explorer.exe", "csrss.exe", "dwm.exe"]);
export const terlindung = (nama) => PROSES_TERLINDUNG.has(String(nama ?? "").toLowerCase());

/** Regex token tiket persis: `T-027` cocok di "tiket T-027 sesuai", tidak di `T-0271`, `XT-027`, `T-027a`, `BUG-T-027a`. */
export function polaTiket(tiket) {
  if (!/^T-\d+$/.test(tiket ?? "")) throw new Error("tiket wajib berformat T-<angka>");
  return new RegExp(`(?<![A-Za-z0-9_-])${tiket}(?![A-Za-z0-9_])`);
}
export const menyebutTiket = (teks, tiket) => polaTiket(tiket).test(String(teks ?? ""));

const namaKecil = (p) => String(p?.nama ?? "").toLowerCase();
const adalahClaude = (p) => namaKecil(p) === "claude.exe" || namaKecil(p) === "claude";
const adalahCmd = (p) => namaKecil(p) === "cmd.exe";

/** Semua token tiket berbeda (`T-<angka>` dengan batas kata yang sama dengan polaTiket) di sebuah teks. */
export function tokenTiket(teks) {
  return [...new Set([...String(teks ?? "").matchAll(/(?<![A-Za-z0-9_-])T-\d+(?![A-Za-z0-9_])/g)].map((m) => m[0]))];
}

/**
 * Status `claude` terhadap meja tiket ini (T-027 revisi 1, W1): "pasti" | "ragu" | null.
 * Syarat dasar: claude(.exe) dengan `--agent <bukan cto>` yang menyebut token tiket persis (aplikasi desktop tanpa `--agent`
 * dan sesi CTO tidak pernah cocok). "pasti" HANYA bila memuat frasa kanonik promptAwal ("Kerjakan tiket T-### sesuai meja ini")
 * DAN tidak menyebut token tiket lain. Selain itu "ragu" → didaftar, tidak pernah dihentikan.
 */
export function statusClaudeMeja(p, tiket) {
  if (!adalahClaude(p)) return null;
  const cmd = String(p.cmd ?? "");
  const agen = /(?:^|\s)--agent[=\s]+"?([A-Za-z0-9_-]+)/.exec(cmd);
  if (!agen || agen[1].toLowerCase() === "cto" || !menyebutTiket(cmd, tiket)) return null;
  const kanonik = new RegExp(`Kerjakan tiket ${tiket} sesuai meja ini(?![A-Za-z0-9_])`).test(cmd);
  return kanonik && tokenTiket(cmd).length === 1 ? "pasti" : "ragu";
}

/** Sesi meja tiket ini yang PASTI (boleh dihentikan / dihitung sebagai sesi baru). */
export const cocokClaudeMeja = (p, tiket) => statusClaudeMeja(p, tiket) === "pasti";

/** Argumen tunggal ala MSVCRT/CommandLineToArgvW: dikutip ganda, `"` → `\"`, backslash sebelum `"`/akhir digandakan. */
export function argWin(s) {
  let out = '"';
  let bs = 0;
  for (const ch of String(s)) {
    if (ch === "\\") { bs++; continue; }
    if (ch === '"') { out += "\\".repeat(bs * 2 + 1) + '"'; bs = 0; continue; }
    out += "\\".repeat(bs) + ch;
    bs = 0;
  }
  return out + "\\".repeat(bs * 2) + '"';
}

/**
 * Satu argumen untuk baris perintah di dalam berkas `.cmd`: kutip MSVCRT dulu, lalu SEMUA metakarakter cmd di-caret —
 * termasuk `"` sehingga cmd tak pernah masuk mode kutip (`&|<>()^!` di dalam prompt tetap literal) — dan `%` digandakan
 * (ekspansi persen berkas batch terjadi sebelum caret). Baris baru/NUL ditolak (memecah baris batch).
 */
export function escapeArgCmd(s) {
  const t = String(s);
  if (/[\r\n\0]/.test(t)) throw new Error("argumen peluncur tidak boleh memuat baris baru/NUL");
  return argWin(t).replace(/[\^&|<>()"!]/g, "^$&").replaceAll("%", "%%");
}

/**
 * Isi peluncur `<wt>/.claude/tim/jalankan.local.cmd` (CRLF, UTF-8 tanpa BOM; `chcp 65001` agar `§` dsb. utuh).
 * Folder dihitung dari letak peluncur (`%~dp0..\..`) → path worktree (spasi, `&`, `%`) tak perlu di-escape.
 * Alur tab: claude → (bendera tutup ada? exit 0) → cmd interaktif di folder meja → exit 0.
 * `exit 0` membuat Windows Terminal MENUTUP tab (closeOnExit "graceful"); tab yang shell-nya di-taskkill /F (kode 1)
 * tetap terbuka berisi "[process exited with code 1]".
 * `claude` = nama perintah polos, atau path absolut ke claude.exe (hasil `where`).
 */
export function isiPeluncur({ tiket, peran, prompt, claude = "claude" }) {
  polaTiket(tiket);
  if (!/^[a-z0-9-]+$/.test(peran ?? "")) throw new Error("peran tidak sah");
  const c = String(claude);
  let prog;
  if (/^[A-Za-z0-9._-]+$/.test(c)) prog = c;
  else if (/^[A-Za-z]:[\\/][^"\r\n\0]*\.exe$/i.test(c)) prog = `"${c.replaceAll("%", "%%")}"`;
  else throw new Error(`path claude tidak sah: ${c}`);
  return [
    "@echo off",
    `rem Peluncur meja ${tiket}, dibuat oleh: node tools/tim/meja.mjs buka --jalankan (T-027). Lokal, jangan di-commit.`,
    "chcp 65001 >nul",
    "setlocal DisableDelayedExpansion",
    'cd /d "%~dp0..\\.."',
    `${prog} --agent ${peran} ${escapeArgCmd(prompt)}`,
    `if exist "%~dp0${NAMA_BENDERA_TUTUP}" exit 0`,
    "echo.",
    `echo Sesi claude meja ${tiket} berakhir. Shell ini di folder meja; ketik exit untuk menutup tab.`,
    "cmd /d /k",
    "exit 0",
    "",
  ].join("\r\n");
}

/**
 * Argumen `wt.exe` (dipanggil tanpa shell — tak ada konversi path MSYS). `;` = pemisah perintah wt → ditolak.
 * Path peluncur sampai ke `cmd /c` sebagai satu argumen berkutip: spasi aman, metakarakter cmd (`&()^%!<>|@`) ditolak
 * (aturan kutip `cmd /c` membuang kutip bila ada karakter khusus).
 */
export function argsWt({ tiket, wt, peluncur }) {
  polaTiket(tiket);
  for (const [k, v] of Object.entries({ wt, peluncur })) {
    if (!v || /[;\r\n"]/.test(v)) throw new Error(`${k} tidak boleh kosong / memuat ; " atau baris baru: ${v}`);
  }
  if (/[&()^%!<>|@]/.test(peluncur)) throw new Error(`path peluncur memuat karakter khusus cmd (&()^%!<>|@): ${peluncur}`);
  return ["-w", "0", "new-tab", "--title", `Meja ${tiket}`, "--suppressApplicationTitle", "-d", wt, "cmd", "/d", "/c", peluncur];
}

/** Sesi meja yang baru muncul setelah tab dibuka: claude meja tiket ini yang pid-nya tak ada di `sebelum`. */
export function cariSesiBaru(proses, tiket, sebelum = new Set()) {
  return proses.filter((p) => !sebelum.has(p.pid) && cocokClaudeMeja(p, tiket));
}

/**
 * Proses TAB meja (T-027), pelengkap deteksiPemakai: `claude` meja tiket ini (cocokClaudeMeja) + induk `cmd.exe`-nya,
 * dan `cmd.exe` yang command line-nya menyebut worktree/peluncur. Tidak pernah: `kecuali` (rantai leluhur CTO), PROSES_TERLINDUNG.
 * Hasil: [{ pid, nama, cmd, ports:[], alasan:[], shellTab, ragu }] — shellTab = cmd.exe induk tab (dihentikan paling akhir);
 * ragu = claude yang menyebut tiket ini tetapi tidak pasti meja ini (W1): hanya didaftar, induknya tidak ikut.
 */
export function deteksiTabMeja({ proses, tiket, akar, kecuali = new Set(), platform = process.platform }) {
  const infoPid = new Map(proses.map((p) => [p.pid, p]));
  const peta = new Map();
  const boleh = (p) => p && !kecuali.has(p.pid) && !terlindung(p.nama);
  const tambah = (p, alasan, shellTab, ragu = false) => {
    const ada = peta.get(p.pid) ?? { pid: p.pid, nama: p.nama, cmd: p.cmd, ports: [], alasan: [], shellTab: false, ragu: true };
    ada.alasan.push(alasan);
    ada.shellTab ||= shellTab;
    ada.ragu &&= ragu;
    peta.set(p.pid, ada);
  };
  for (const p of proses) {
    if (!boleh(p)) continue;
    const status = statusClaudeMeja(p, tiket);
    if (status === "ragu") {
      tambah(p, `RAGU: claude menyebut ${tiket} tetapi bukan prompt kanonik meja ini / ada tiket lain (${tokenTiket(p.cmd).join(", ")}) — tidak dihentikan`, false, true);
    } else if (status === "pasti") {
      tambah(p, `sesi claude meja ${tiket}`, false);
      const induk = infoPid.get(p.ppid);
      if (boleh(induk) && adalahCmd(induk)) tambah(induk, `shell tab meja (induk claude ${p.pid})`, true);
    } else if (adalahCmd(p) && menyebutPath(p.cmd, akar, platform)) {
      tambah(p, "shell tab meja (peluncur/worktree)", true);
    }
  }
  return [...peta.values()].sort((a, b) => a.pid - b.pid);
}

/** Gabung hasil deteksiPemakai + deteksiTabMeja (per pid), buang PROSES_TERLINDUNG. ragu = semua sumbernya ragu. */
export function gabungPemakai(...daftar) {
  const peta = new Map();
  for (const p of daftar.flat()) {
    if (terlindung(p.nama)) continue;
    const ada = peta.get(p.pid);
    if (!ada) { peta.set(p.pid, { ...p, alasan: [...p.alasan], ports: [...p.ports], shellTab: Boolean(p.shellTab), ragu: Boolean(p.ragu) }); continue; }
    ada.alasan.push(...p.alasan.filter((x) => !ada.alasan.includes(x)));
    ada.ports.push(...p.ports);
    ada.shellTab ||= Boolean(p.shellTab);
    ada.ragu &&= Boolean(p.ragu); // ragu hanya bila SEMUA sumber ragu (path/port T-009 = pasti)
  }
  return [...peta.values()].map((p) => ({ ...p, hanyaPort: p.alasan.every((x) => x.startsWith("LISTEN")) })).sort((a, b) => a.pid - b.pid);
}

/**
 * Urutan penghentian (Windows, taskkill /T /F): `langsung` = pemakai non-shell + anak langsung shell tab (claude, cmd interaktif),
 * tanpa yang leluhurnya sudah ada di daftar (ikut mati lewat /T). `shell` = shell tab: ditunggu keluar sendiri (exit 0 → tab
 * tertutup), baru dipaksa bila masih hidup. `kecuali`, PROSES_TERLINDUNG, dan pemakai `ragu` (W1) tidak pernah masuk.
 */
export function rencanaHentikan(pemakai, proses, kecuali = new Set()) {
  const ragu = new Set(pemakai.filter((p) => p.ragu).map((p) => p.pid));
  const aman = pemakai.filter((p) => !p.ragu && !kecuali.has(p.pid) && !terlindung(p.nama));
  const shell = aman.filter((p) => p.shellTab).map((p) => p.pid);
  const kandidat = new Set(aman.filter((p) => !p.shellTab).map((p) => p.pid));
  for (const p of proses) if (shell.includes(p.ppid) && !shell.includes(p.pid) && !ragu.has(p.pid) && !kecuali.has(p.pid) && !terlindung(p.nama)) kandidat.add(p.pid);
  const langsung = [...kandidat].filter((pid) => {
    const leluhur = rantaiLeluhur(proses, pid);
    leluhur.delete(pid);
    return ![...leluhur].some((x) => kandidat.has(x));
  });
  return { langsung: langsung.sort((a, b) => a - b), shell: shell.sort((a, b) => a - b) };
}
