# studio-kit

Cara kerja **tim multi-agent Claude Code** yang bisa dipasang di proyek mana pun: satu CTO memecah pekerjaan menjadi
tiket, tiap tiket dikerjakan satu agent berjabatan di *meja* (git worktree) sendiri, lalu hasilnya direview dan
digabung. Netral-proyek: perilaku per proyek diatur lewat berkas konfigurasi.

## Isi

| Bagian | Berkas di proyek | Fungsi |
|---|---|---|
| Meja kerja | `tools/tim/meja.mjs` | Membuka/menutup worktree + branch + slot port/DB per tiket, membuka tab terminal agent |
| Penjaga wilayah | `.claude/hooks/jaga-wilayah.mjs` | Hook yang menolak agent mengedit berkas di luar wilayah jabatannya |
| Jabatan | `.claude/agents/*.md` | 12 jabatan: `cto`, `code-reviewer`, `product-manager`, engineer backend/frontend/mobile/web, `designer`, `qa-engineer`, `security-engineer`, `devops-engineer`, `tech-writer` |
| Gerbang uji | `.claude/skills/uji-fitur/` | Triase tingkat uji T0–T3 dari perubahan git + panduan blok keamanan/performa |
| Buku pegangan | `docs/tim/SOP_TIM.md`, `docs/tim/templat/` | Aturan emas, siklus sprint, format pesan antar sesi, templat tiket/laporan/keputusan |
| Catatan proyek | `docs/tim/PAPAN.md`, `docs/PROGRESS.md`, `docs/BUGLOG.md` | Kerangka kosong, dibuat hanya bila belum ada |

## Memasang di sebuah proyek

Butuh: Node 20+, git, Claude Code. Proyek tujuan harus sudah berupa repo git.

### Cara A — plugin Claude Code (disarankan)
```bash
claude plugin marketplace add reckyas/studio-kit
claude plugin install studio@studio-kit
```
Lalu buka Claude Code **tanpa jabatan** di proyek tujuan dan jalankan `/studio:pasang`. Claude menjalankan pemasang,
membaca struktur proyek, lalu mengisi konfigurasi dan penanda `SESUAIKAN` bersama Anda.

Repo privat: pemasangan memakai kredensial git Anda sendiri (`gh auth login` atau credential helper).

### Cara B — pemasang mandiri
```bash
git clone https://github.com/reckyas/studio-kit
node studio-kit/pasang.mjs --target /path/ke/proyek --dry-run     # lihat dulu apa yang akan ditulis
node studio-kit/pasang.mjs --target /path/ke/proyek --proyek "Nama Proyek" --ceo "Nama Anda"
```
Pilihan: `--jabatan backend-engineer,frontend-engineer` (hanya jabatan itu + `cto` & `code-reviewer`),
`--branch <branch utama>`, `--paksa` (timpa jabatan/SOP yang sudah ada).

Pemasang tidak melakukan commit, push, atau akses jaringan. Tinjau `git status`, lalu commit sendiri.

## Setelah dipasang — yang harus disesuaikan

1. **`.claude/tim/studio.config.json`** — slot meja:
   ```json
   {
     "branchUtama": "main",
     "folderWorktree": "../worktrees",
     "port": { "server": 4010, "web": 5180 },
     "db": {
       "awalan": "tokoku",
       "urlTest": "postgresql://user:pass@localhost:5432/{db}?schema=public",
       "envTest": "TEST_DATABASE_URL",
       "perintahHapus": ["docker", "exec", "tokoku-postgres", "dropdb", "-U", "user", "--force", "--if-exists", "{db}"]
     },
     "salinLokal": ["server/.env", "web/.env.local"],
     "paketPeran": { "backend-engineer": ["server"], "frontend-engineer": ["web"] },
     "perintahPasang": "npm ci --prefix {paket}"
   }
   ```
   Port slot N = basis + N. DB test slot N = `<awalan>_s<N>_test`. Proyek tanpa DB: `"db": null`.
   Proyek Anda sendiri yang harus membaca port/DB slot itu (mis. lewat variabel lingkungan) saat dev server dan test dijalankan.
2. **`.claude/tim/wilayah.json`** — glob folder per jabatan mengikuti struktur repo Anda.
3. **Penanda `SESUAIKAN`** di jabatan, SOP, dan `referensi.md`: `grep -rn SESUAIKAN .claude docs/tim`.
4. **`.claude/tim/uji.config.json`** — pemicu uji khas proyek dan perintah uji dasar per area.
5. Uji perkakas, lalu mulai:
   ```bash
   node --test "tools/tim/*.test.mjs" ".claude/hooks/*.test.mjs" ".claude/skills/uji-fitur/*.test.mjs"
   claude --agent cto
   ```

## Memperbarui

```bash
claude plugin marketplace update studio-kit      # lalu /studio:perbarui di proyek
# atau
git -C studio-kit pull && node studio-kit/pasang.mjs --perbarui --target /path/ke/proyek
```

| Golongan | Contoh | Saat diperbarui |
|---|---|---|
| Mesin | `tools/tim/*`, `.claude/hooks/*`, `triase*.mjs`, `uji-fitur/SKILL.md` | Selalu ditimpa. **Jangan diedit di proyek** — kirim perbaikan ke repo ini |
| Proyek | `.claude/agents/*.md`, `docs/tim/SOP_TIM.md`, templat | Ditimpa hanya bila belum Anda ubah; yang sudah diubah dilewati dan dilaporkan |
| Kerangka | `wilayah.json`, `studio.config.json`, `uji.config.json`, PAPAN, PROGRESS, BUGLOG, `referensi.md` | Tidak pernah disentuh |

Sidik isi tiap berkas dicatat di `.claude/tim/studio-kit.json` (ikut di-commit).

## Batasan
- `--jalankan` (membuka tab terminal agent otomatis) hanya di **Windows Terminal**. Di macOS/Linux alat mencetak perintah untuk dijalankan di tab baru.
- Hook hanya mencegat tool Edit/Write/NotebookEdit; penulisan lewat Bash diatur lewat disiplin jabatan + review.
- Komunikasi antar sesi memakai tool `ListAgents`/`SendMessage` Claude Code, hanya antar sesi di komputer yang sama.
- Tidak termasuk: dasbor Studio, kantor pixel, siaga kuota akun, dasbor deploy (khas proyek asal).

## Mengembangkan kit ini
```bash
node --test pasang.test.mjs "kit/tools/tim/*.test.mjs" "kit/.claude/hooks/*.test.mjs" "kit/.claude/skills/uji-fitur/*.test.mjs"
claude plugin validate .
```
Isi `kit/` memakai penanda `{{PROYEK}}`, `{{CEO}}`, `{{BRANCH_UTAMA}}` yang diisi pemasang.
