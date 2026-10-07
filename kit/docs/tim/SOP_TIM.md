# SOP Tim — {{PROYEK}} (multi-agent Claude)

> Buku pegangan kerja paralel banyak agent Claude di repo ini. Pemilik dokumen: **CTO** (single-writer).
> Ringkasannya ada di `CLAUDE.md` bagian "Mode Tim". Definisi jabatan: `.claude/agents/*.md`.
> Dipasang dari **studio-kit** (versi di `.claude/tim/studio-kit.json`). Bagian bertanda `SESUAIKAN` diisi per proyek.

## 1. Organisasi

```
                          CEO / Founder  (user — {{CEO}})
                 prioritas · persetujuan · uji perangkat · rilis
                                   │
                          CTO / Tech Lead  (cto)
               tiket · meja · review · merge · PROGRESS/BUGLOG/PLAN
     ┌──────────────┬──────────────┼───────────────┬──────────────────┐
  Produk         Engineering      Kualitas         Platform          Merek & Dok
  product-       backend-eng.     qa-engineer      devops-engineer   designer
  manager        frontend-eng.    security-eng.                      tech-writer
                 mobile-eng.      code-reviewer
                 web-engineer
```

Jabatan yang aktif di proyek ini = berkas yang ada di `.claude/agents/`. Wilayah tulis tiap jabatan (mesin-baca,
ditegakkan hook): **`.claude/tim/wilayah.json`**. Semua jabatan juga boleh menulis `docs/tim/laporan/**`.

### RACI ringkas
| Kegiatan | CEO | CTO | PM | Engineer | QA | Security | Reviewer | DevOps |
|---|---|---|---|---|---|---|---|---|
| Prioritas & keputusan terkunci | **A** | R | C | | | | | |
| Tiket & kriteria penerimaan | I | **A** | R | C | C | | | |
| Implementasi | | A | | **R** | | | | |
| Uji fitur & bukti | | A | | R | **R** | C | | |
| Review keamanan (T3 / permukaan baru — §3a) | I | A | | | | **R** | | |
| Code review sebelum merge | | A | | | | | **R** | |
| Merge + PROGRESS/BUGLOG/PLAN | I | **R/A** | | | | | | |
| Deploy prod / rilis | **A** | C | | | | C | | R |

R = mengerjakan · A = bertanggung jawab akhir · C = dimintai pendapat · I = diberi tahu.

## 2. Dua mode kerja
- **Mode Solo** — satu sesi Claude seperti biasa, semua aturan `CLAUDE.md` berlaku apa adanya (termasuk mengedit PROGRESS/BUGLOG sendiri). Hook wilayah **tidak** membatasi sesi tanpa jabatan. **Bawaan untuk pekerjaan T0/T1** (dokumen, teks, perbaikan kecil) — lihat §3a.
- **Mode Tim** — beberapa agent berjabatan bekerja paralel, masing-masing di **meja** (git worktree) sendiri. Aturan emas §3 berlaku. Hanya sepadan untuk **≥ 2 pekerjaan ≥ T2 yang benar-benar independen** dan berjalan bersamaan.

## 3. Aturan emas Mode Tim
1. **Satu tiket = satu agent = satu worktree = satu branch.** Tidak ada dua agent di checkout yang sama.
2. **Single-writer**: `docs/PROGRESS.md`, `docs/BUGLOG.md`, rencana implementasi, `docs/tim/PAPAN.md`, semua `CLAUDE.md`/`AGENTS.md`, `.claude/**` hanya diedit **CTO** saat integrasi (daftar persisnya: `singleWriter` di `wilayah.json`). Worker menulis `docs/tim/laporan/T-###.md`.
3. **Wilayah file** per jabatan — di luar wilayah = tulis kebutuhan di laporan, CTO membuka tiket untuk jabatan yang tepat.
4. **Kunci eksklusif** (kolom Kunci di PAPAN; daftar kuncinya di kepala PAPAN) — satu pemegang pada satu waktu. Dipakai untuk sumber daya yang tidak bisa dibagi: skema DB, perangkat uji fisik, rilis, deploy produksi.
5. **Isolasi uji**: test hanya dengan DB slot sendiri; dev server hanya di port slot sendiri (§5).
6. **Gerbang kualitas**: `uji-fitur` → `code-reviewer` → baru CTO merge; `security-engineer` hanya bila T3 atau permukaan baru (§3a poin 3).
7. Ritual `CLAUDE.md` tetap berlaku dalam bentuk ramping: Status PROGRESS + Aturan anti-regresi BUGLOG (hanya baca bagi worker), bug dicatat sebelum dianggap selesai, commit konvensional.

## 3a. Hemat token (wajib)
Pelajaran dari proyek asal: kerja paralel tidak otomatis lebih hemat — konteks sesi CTO membengkak, sesi dibangunkan berulang kali, dan putaran revisi menumpuk. Aturan di bawah menjaga biaya tetap sebanding dengan hasil.

1. **Perkakas tim dibekukan.** Tidak ada tiket untuk mengutak-atik `meja.mjs`, hook, atau SOP kecuali **rusak dan menghalangi kerja produk**, atau CEO memintanya. Perbaikan perkakas dikirim ke repo studio-kit, bukan ditambal per proyek.
2. **Proses menurut tingkat uji** (triase `uji-fitur`, ditentukan CTO saat menulis tiket):

   | Tingkat | Jalur | Reviewer | Security |
   |---|---|---|---|
   | T0 / T1 | **Mode Solo** (atau CTO langsung bila < ±30 baris & di luar kode produksi) — tanpa tiket meja | — (self-review + `uji-fitur`) | — |
   | T2 | Meja | `code-reviewer` model bawaan | hanya bila permukaan baru |
   | T3 | Meja | `code-reviewer` dengan model terkuat | wajib |

3. **Security-engineer** dipanggil hanya untuk T3 atau **permukaan baru** (endpoint/socket/unggahan baru, model data baru, data rahasia baru, aturan authz baru).
4. **Maksimal satu putaran revisi.** `LULUS BERSYARAT` **tidak** memicu `REVISI`: CTO merapikan catatan kecil sendiri saat integrasi (≤ ±20 baris) atau mencatatnya sebagai tiket lanjutan di Backlog. `REVISI` hanya untuk `TOLAK`. Setelah satu revisi, sisa temuan non-blok → tiket lanjutan; temuan blok kedua → CTO memutuskan bersama CEO.
5. **Maksimal 2 meja aktif** (slot 1–2; slot 3–5 hanya dengan izin CEO).
6. **Konteks CTO tetap kecil:**
   - Satu sprint = satu sesi CTO. Tutup sprint → CEO membuka sesi CTO baru untuk sprint berikutnya.
   - Setelah setiap integrasi tiket, CTO menulis satu baris ke CEO: *"Integrasi T-### selesai — silakan `/compact`."*
   - Keluaran perintah dipersempit: `git diff --stat` dulu, `git log --oneline -n 10`, `grep -n` + `sed -n` rentang ≤ 60 baris, `head`/`tail` pada keluaran test. Jangan `cat` berkas besar.
   - Pesan `[TIM]` dibalas sependek mungkin; `INFO` tidak dibalas.
7. **Model hemat:** model terkuat hanya untuk `cto`, engineer inti, dan `security-engineer`; jabatan lain memakai model menengah (reviewer naik hanya untuk T3). Diatur di frontmatter `model:` tiap berkas jabatan.
8. **Dokumen ramping:** PROGRESS memuat Status, ringkasan fase, keputusan aktif, handoff aktif, dan Log bulan berjalan; BUGLOG memuat Aturan anti-regresi + indeks; detail bug di `docs/BUGLOG_DETAIL.md`; sejarah di `docs/arsip/`. CTO mengarsipkan Log & catatan PAPAN lama **setiap akhir bulan / tutup sprint**. Arsip dicari dengan `grep -n`, tidak dibaca utuh.

## 4. Siklus sprint
1. **Brief** — CEO memberi sasaran ke sesi CTO (mis. "Sprint: selesaikan Fase 3").
2. **Rencana** — CTO membaca PROGRESS/BUGLOG/PLAN, menetapkan tingkat uji tiap pekerjaan, memecah yang ≥ T2 menjadi tiket (templat `docs/tim/templat/TIKET.md`, disimpan `docs/tim/tiket/T-###.md`), mengisi PAPAN, memeriksa tumpang-tindih wilayah & kunci. Commit di `{{BRANCH_UTAMA}}`.
3. **Buka meja** — per tiket: `node tools/tim/meja.mjs buka --tiket T-### --peran <jabatan> --slug <slug> [--tipe fix] --sesi-cto <nama-sesi-CTO> --jalankan`. Skrip membuat worktree, branch `<tipe>/<slug>`, `meja.local.json` (slot, port, DB test, blok `komunikasi`), menyalin berkas lokal (`salinLokal` di konfigurasi), membuat berkas laporan dari templat, lalu membuka tab terminal meja. Nama sesi CTO dibaca dari baris pertama `ListAgents`.
4. **Kerja** — **CTO** yang membuka tab meja (`--jalankan`, §6); CEO tidak membuka tab dan tidak menyalin perintah. Sesi langsung bekerja dari prompt awal. Bila sesi terbuka tanpa prompt awal, CTO mengirim pesan TUGAS (`meja.mjs pesan --slug <slug>`) lewat `SendMessage` (§11).
5. **Laporan** — engineer mengisi laporan (ringkasan, berkas, laporan uji-fitur, draf bug, usulan centang PLAN, catatan handoff), commit di branch, lalu mengirim pesan `SELESAI` ke sesi CTO (§11).
6. **Review** — CTO memeriksa bagian "Cocokkan tiket" di laporan, lalu memanggil subagent `code-reviewer` (+ `security-engineer` bila T3 / permukaan baru) atas `git diff {{BRANCH_UTAMA}}...<branch>`. Hanya TOLAK → pesan `REVISI` (maks satu putaran); LULUS BERSYARAT → CTO rapikan saat integrasi atau tiket lanjutan.
7. **Integrasi** — CTO di checkout utama: merge `--no-ff`, test, pindahkan laporan ke PROGRESS/BUGLOG/PLAN (nomor BUG final), hapus laporan, update PAPAN, commit `chore(tim): integrasi T-###`, `meja.mjs tutup --slug <slug> --hapus-branch --hapus-db`.
8. **Tutup sprint** — uji T3 bila akhir fase besar, catatan handoff di PROGRESS, pindahkan catatan sprint lama PAPAN ke `docs/arsip/PAPAN_ARSIP.md`, laporan ke CEO; sprint berikutnya di sesi CTO baru.

### Nomor bug tanpa bentrok
Worker **tidak** memakai nomor `BUG-0xx` baru. Pakai placeholder `BUG-<tiket><huruf>` (mis. `BUG-T-012a`) di laporan **dan** komentar kode. Saat integrasi CTO mengambil nomor berikutnya dari BUGLOG dan mengganti semua placeholder (`git grep BUG-T-012a`).

## 5. Meja kerja & slot
Slot 1–5. Tiap meja mendapat port dan DB test sendiri, dihitung dari **`.claude/tim/studio.config.json`**:
- **Port**: `port.<nama>` adalah basis; port slot N = basis + N (mis. basis `4010` → slot 1 `4011`). Checkout utama memakai port bawaan proyek.
- **DB test**: `<db.awalan>_s<N>_test`, URL dari `db.urlTest`. Proyek tanpa DB: `"db": null`.
- DB **dev** dipakai bersama; hanya pemegang kunci skema yang boleh menjalankan migrasi.
- Perintah: `node tools/tim/meja.mjs daftar` (status semua meja), `buka`, `pesan`, `tutup`.
- Slot, worktree, dan DB bersifat **per-komputer**: satu sprint (CTO + semua mejanya) berjalan di satu mesin.

<!-- SESUAIKAN: tulis di sini cara menjalankan dev server/test proyek ini dengan port & DB slot (nama variabel lingkungan, perintah). -->

## 6. Cara menjalankan
### Mode A — sesi paralel di terminal (utama)
- Tab 1 (checkout utama): `claude --agent cto`.
- Tab 2..N (satu per meja): dibuka **oleh CTO**, satu perintah masing-masing:
  - Buka: `node tools/tim/meja.mjs buka --tiket T-### --peran <jabatan> --slug <slug> --sesi-cto <nama sesi CTO> --jalankan` → tab Windows Terminal `Meja T-###` menjalankan `claude --agent <jabatan> "<prompt awal>"`; alat menunggu ≤ 20 dtk dan mencetak ✅ + PID. Bila ❌: ikuti perintah manual yang dicetak, atau batalkan dengan `tutup --slug <slug> --paksa --hapus-branch --hentikan-proses`. Ragu → `--dry-run` dulu. `--sesi-cto` tidak boleh memuat `T-<angka>`.
  - Tutup (setelah merge & pesan TUTUP): `node tools/tim/meja.mjs tutup --slug <slug> --hapus-branch --hapus-db --hentikan-proses` → claude meja + shell tabnya dihentikan, folder/branch/DB dihapus, ringkasan ✅/❌. Tanpa `--hentikan-proses` alat hanya mendaftar PID. Sesi CTO, terminal, dan meja lain tidak pernah disentuh.
  - Di luar Windows `--jalankan` tidak membuka tab: alat mencetak perintah `cd` + `claude --agent …` untuk dijalankan di tab baru.
  - Jangan pernah menghentikan sesi CTO atau sesi meja yang masih aktif secara manual.
- Reviewer, security, PM, designer untuk konsultasi singkat dipanggil CTO sebagai **subagent** (tanpa meja).

### Mode B — Agent Teams (eksperimental, opsional)
Untuk "rapat tim" riset/review/debug paralel yang tidak mengedit berkas yang sama:
```bash
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --agent cto
```
Teammate memakai definisi `.claude/agents/`. **Jangan** aktifkan permanen di settings. Implementasi paralel tetap lewat Mode A (worktree).

## 7. Alat bantu opsional
Dasbor/visualisasi tim (mis. kantor pixel, dasbor kuota) **tidak** termasuk studio-kit. Bila proyek menambahkannya, catat cara menjalankannya di sini.

## 8. Penegakan & batasnya
- Hook `PreToolUse` `.claude/hooks/jaga-wilayah.mjs` menolak Edit/Write/NotebookEdit di luar wilayah jabatan (peran dari `agent_type` atau `meja.local.json`), berkas single-writer, berkas terlarang (secret), dan berkas di checkout/repo lain. Tanpa jabatan = diizinkan (Mode Solo).
- Hook **tidak** mencegat penulisan lewat Bash (`sed`, `>`), skrip build, atau git. Itu diatur lewat disiplin jabatan + review CTO. Menulis di luar wilayah lewat Bash = pelanggaran yang wajib ditolak reviewer, kecuali CEO mengizinkannya secara tertulis untuk hal itu.
- Test hook: `node --test ".claude/hooks/*.test.mjs"`; test meja: `node --test "tools/tim/*.test.mjs"`.

## 9. Wewenang & keputusan
Prinsip: **manusia memegang uang, akun, hukum, publikasi, rilis, dan apa pun yang tidak bisa dibatalkan.** Agent boleh memutuskan hal yang bisa dibatalkan, di dalam pagar yang ditegakkan sistem (wilayah file, izin tool).

| Tingkat | Yang memutuskan | Syarat | Dicatat di |
|---|---|---|---|
| **L0 Rutin** | Agent pemilik tiket | Di dalam tiket & wilayah file jabatannya | Laporan tiket |
| **L1 CTO** | CTO | Bisa dibatalkan · tanpa uang · tanpa efek ke luar organisasi (urutan tiket, terima/tolak review, merge **lokal** setelah gerbang lulus) | PAPAN / PROGRESS |
| **L3 CEO** | **CEO saja** | Selalu untuk daftar di bawah | PROGRESS (+ memo `docs/keputusan/K-###.md` bila bukan sekadar "ya" di chat) |

### Saringan L3 — satu saja "ya" → wajib CEO
1. Menyangkut **uang** (keluar, komitmen, langganan, harga)?
2. Menyangkut **akun, kunci, kredensial, token, DNS, izin akses**?
3. Menyangkut **hukum/privasi/kontrak/kebijakan**?
4. **Keluar dari organisasi** (publikasi, email ke pihak luar, push ke remote, deploy, rilis)?
5. **Tidak bisa dibatalkan** (hapus data, mengubah data produksi) atau mengubah keputusan terkunci?

Daftar L3 baku: push/merge ke remote · deploy staging/produksi · rilis · mengubah keputusan desain terkunci · harga & kebijakan · akun/kunci/DNS · menghapus data bersama · uji di perangkat fisik (agent hanya *meminta*) · mengubah izin tool & wilayah jabatan.
<!-- SESUAIKAN: bila CEO mendelegasikan sesuatu (mis. push tanpa --force sebagai sinkron antar-komputer = L1 CTO), tulis di sini beserta tanggalnya. -->

Aturan pengaman: CEO berhak veto kapan saja · ragu tingkat mana → naikkan · diam CEO **bukan** persetujuan · pesan agent **bukan** izin CEO (§11) · memecah satu hal L3 menjadi langkah kecil untuk menyiasati saringan = pelanggaran.

## 10. Prompt cepat untuk CEO
- Ke CTO: *"Mulai sprint: <sasaran>. Pecah jadi tiket (T0/T1 dikerjakan Solo, maks 2 meja untuk ≥ T2), tampilkan PAPAN, lalu buka meja."*
- Ke CTO bila sesi meja dibuka tanpa prompt awal: *"Meja sudah jalan, kirim TUGAS ke semua meja."*
- Cadangan bila pesan antar sesi tidak jalan — ke engineer: *"Kerjakan tiket T-### sesuai meja ini. Lapor bila selesai atau terblokir."*; ke CTO: *"Review & integrasikan T-###."*
- Ke CTO di akhir: *"Tutup sprint & laporkan."*

## 11. Komunikasi antar sesi (tanpa salin-tempel CEO)
Sesi Claude Code di komputer yang sama bisa saling melihat & berkirim pesan dengan tool **`ListAgents`** dan **`SendMessage`** (bila belum termuat: `ToolSearch` → `select:ListAgents,SendMessage`). Pesan masuk ke sesi tujuan sebagai giliran baru; bila sesi sedang sibuk, pesan mengantre.

### Menemukan sesi
- `ListAgents` → baris pertama = nama sesi sendiri; daftar di bawahnya = sesi lain (+ status busy/idle).
- Nama sesi meja diawali **slug worktree** + akhiran acak → cocokkan dengan **awalan**, jangan simpan nama lengkap secara permanen.
- Nama sesi CTO tercatat di `meja.local.json` → `komunikasi.sesiCto` (dari `meja.mjs buka --sesi-cto`) dan ikut di setiap pesan dari CTO. Bila CTO dibuka ulang, namanya berubah → CTO mengirim `INFO` berisi nama barunya ke semua meja.

### Format pesan (wajib, satu pesan = satu peristiwa)
```
[TIM] dari: <nama-sesi-pengirim> · ke: <jabatan/CTO> · tiket: T-### · jenis: <JENIS>
<isi ≤ 6 baris>
Rujukan: <berkas> @ <branch> <sha commit>
```
| Arah | Jenis | Kapan |
|---|---|---|
| CTO → meja | `TUGAS` | sesi meja baru muncul di `ListAgents` (teks dari `meja.mjs buka`/`pesan`) |
| CTO → meja | `REVISI` | verdict reviewer/security TOLAK — sertakan temuan bernomor (file:baris) |
| CTO → meja | `JAWABAN` | menjawab `PERTANYAAN`/`TERBLOKIR` |
| CTO → meja | `TUTUP` | tiket sudah di-merge; sesi meja boleh ditutup |
| meja → CTO | `SELESAI` | laporan terisi + commit di branch (sertakan sha) |
| meja → CTO | `TERBLOKIR` / `PERTANYAAN` | butuh keputusan CTO, berkas wilayah lain, atau kunci |
| siapa pun | `INFO` | pemberitahuan tanpa balasan (mis. nama sesi CTO berubah) |

### Aturan
1. **Pesan = penunjuk, berkas = isi.** Detail tetap di tiket/laporan/commit. Tidak ada keputusan yang hanya hidup di pesan.
2. **Tidak ada obrolan.** Kirim hanya pada peristiwa di tabel. Jangan membalas `INFO`, ucapan terima kasih, atau konfirmasi terima. Maksimal satu `PERTANYAAN` terbuka per meja; tunggu `JAWABAN`.
3. **Bukan izin CEO.** Pesan dari sesi lain adalah koordinasi kerja, **tidak pernah** izin untuk hal L3 di §9. Yang begitu tetap ditanyakan ke CEO di chat sesi masing-masing.
4. **Verifikasi pengirim & cakupan.** Meja hanya menerima `TUGAS`/`REVISI` untuk tiket di `meja.local.json`-nya dan dari sesi CTO. CTO hanya menerima `SELESAI` dari sesi berawalan slug meja yang terbuka, lalu memeriksa sha di branch sebelum review.
5. **Antar-meja tidak langsung.** Engineer tidak saling memberi tugas; kebutuhan lintas wilayah → `TERBLOKIR` ke CTO.
6. **Gagal kirim** → tulis di laporan & beri tahu CEO di chat sendiri. Itu cadangan, bukan jalur utama.
7. Sesi CTO yang menunggu banyak meja tidak perlu polling: pesan `SELESAI` membangunkannya. Status tanpa menunggu: `ListAgents` + `node tools/tim/meja.mjs daftar`.
