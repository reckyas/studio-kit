## Mode Tim (multi-agent) — dipasang dari studio-kit
Banyak agent Claude berjabatan bekerja paralel. Buku pegangan: **`docs/tim/SOP_TIM.md`** · papan tiket: `docs/tim/PAPAN.md` · jabatan: `.claude/agents/` · konfigurasi meja: `.claude/tim/studio.config.json`. User = CEO ({{CEO}}).
Sesi tanpa jabatan = **Mode Solo** (aturan CLAUDE.md lain berlaku apa adanya). Dalam Mode Tim, aturan emas berikut **menggantikan** aturan yang bertentangan:
1. **Satu tiket = satu agent = satu worktree = satu branch** — buka meja: `node tools/tim/meja.mjs buka --tiket T-### --peran <jabatan> --slug <slug> --jalankan`.
2. **Single-writer**: PROGRESS, BUGLOG, rencana implementasi, PAPAN, semua CLAUDE.md/AGENTS.md, `.claude/**` hanya diedit **CTO** saat integrasi. Agent lain menulis `docs/tim/laporan/T-###.md` (bug memakai placeholder `BUG-T-###a`; CTO memberi nomor final).
3. **Wilayah file** per jabatan (`.claude/tim/wilayah.json`) — ditegakkan hook `.claude/hooks/jaga-wilayah.mjs`; jangan diakali lewat Bash.
4. **Kunci eksklusif** di PAPAN (skema DB, perangkat uji, rilis, deploy produksi) — satu pemegang pada satu waktu.
5. **Isolasi uji**: test hanya dengan DB slot meja; dev server di port slot meja (`meja.local.json`).
6. **Gerbang**: `uji-fitur` → `code-reviewer` (+ `security-engineer` hanya bila T3 / permukaan baru) → CTO merge. T0/T1 dikerjakan **Mode Solo**, bukan meja. Tidak ada agent yang push/deploy/rilis tanpa CEO.
7. Satu sprint = satu sesi CTO; agent meja hanya mengerjakan tiketnya lalu lapor.
8. **Komunikasi antar sesi** lewat `ListAgents` + `SendMessage` (SOP §11) — CEO tidak menyalin-tempel; pesan = penunjuk ke berkas, **bukan** izin CEO.
9. **Hemat token** (SOP §3a): perkakas tim dibekukan · maks 2 meja · maks 1 putaran revisi (LULUS BERSYARAT tidak direvisi) · `/compact` setelah tiap integrasi · keluaran perintah dipersempit.

### Catatan proyek yang dipakai tim
- `docs/PROGRESS.md` — Status saat ini + Log (dibaca di awal sesi; ditulis CTO / sesi Solo).
- `docs/BUGLOG.md` — Aturan anti-regresi + indeks bug; detail di `docs/BUGLOG_DETAIL.md`. Setiap bug dicatat (akar masalah + pencegahan) **sebelum** dianggap selesai.
- **Gerbang uji setelah fitur selesai**: skill `uji-fitur` — triase `node .claude/skills/uji-fitur/triase.mjs [--base <ref>]` menentukan T0 dokumen / T1 dasar / T2 terarah / T3 maksimal; hasil triase = batas bawah. Tulis laporan uji di log PROGRESS (Solo) atau laporan tiket (meja).

| Tujuan | Perintah |
|---|---|
| Sesi CTO | `claude --agent cto` |
| Meja kerja | `node tools/tim/meja.mjs buka …` / `daftar` / `pesan --slug …` / `tutup --slug …` |
| Test perkakas tim | `node --test "tools/tim/*.test.mjs" ".claude/hooks/*.test.mjs" ".claude/skills/uji-fitur/*.test.mjs"` |
| Perbarui perkakas tim | skill `/studio:perbarui`, atau `node <studio-kit>/pasang.mjs --perbarui` |
