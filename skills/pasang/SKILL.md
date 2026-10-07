---
name: pasang
description: Memasang Mode Tim (studio-kit) di proyek ini — meja worktree, hook wilayah, jabatan agent, SOP, gerbang uji — lalu menyesuaikannya dengan struktur proyek. Pakai saat user meminta "pasang tim", "pasang studio-kit", "siapkan mode tim", atau ingin cara kerja multi-agent di proyek baru.
---

# Pasang studio-kit di proyek ini

Pemasang: `${CLAUDE_PLUGIN_ROOT}/pasang.mjs`. Ia hanya menyalin berkas; **tidak** commit, push, atau akses jaringan.

## Sebelum mulai
- Sesi ini harus **tanpa jabatan** (bukan `claude --agent …`); bila berjabatan, hook wilayah akan menolak penulisan — minta user membuka sesi biasa.
- Direktori kerja harus root repo git proyek tujuan. `git status` sebaiknya bersih agar perubahan pemasang mudah ditinjau; bila kotor, beri tahu user dan tanyakan apakah lanjut.
- Bila `.claude/tim/studio-kit.json` sudah ada, proyek ini sudah terpasang → pakai skill `perbarui`, bukan ini.

## Langkah
1. **Tanyakan singkat** (satu kali, boleh dilewati bila sudah jelas dari percakapan): nama proyek, nama CEO/pemilik, dan jabatan mana yang dipakai. Bawaan: nama folder, `git config user.name`, semua jabatan. Untuk proyek kecil sarankan subset, mis. `backend-engineer,frontend-engineer,qa-engineer`.
2. **Pratinjau**: `node "${CLAUDE_PLUGIN_ROOT}/pasang.mjs" --target . --dry-run [--proyek "…"] [--ceo "…"] [--jabatan a,b]` — tunjukkan ringkasannya, terutama baris "dilewati".
3. **Pasang**: perintah yang sama tanpa `--dry-run`.
4. **Sesuaikan dengan proyek** — baca struktur repo (folder tingkat atas, `package.json`/berkas build, compose, `.env.example`) lalu:
   - `.claude/tim/studio.config.json`: `port` (basis per layanan yang punya dev server; port slot N = basis + N, pilih basis yang tidak menabrak port bawaan), `db` (atau `null`), `salinLokal` (berkas `.env` lokal — **jangan** keystore/kunci rilis), `paketPeran`, `perintahPasang`.
   - `.claude/tim/wilayah.json`: ganti glob `tulis` tiap jabatan dengan folder nyata proyek. Jangan melonggarkan `singleWriter` atau `terlarang`.
   - `.claude/tim/uji.config.json`: `area` (perintah lint/test/build per paket) dan `pemicu` khas proyek (mis. pembayaran → `kritis`).
   - Penanda `SESUAIKAN` (`grep -rn SESUAIKAN .claude docs/tim`): isi stack & aturan teknis tiap jabatan, cara menjalankan dev server/test dengan port & DB slot (SOP §5), daftar kunci di PAPAN, perintah di `referensi.md`. Hapus penandanya setelah diisi.
   - Periksa apakah proyek benar-benar bisa memakai port/DB slot (variabel lingkungan dibaca dev server & test?). Bila belum, **laporkan sebagai pekerjaan lanjutan** — jangan mengubah kode produk di langkah ini.
5. **Uji perkakas**: `node --test "tools/tim/*.test.mjs" ".claude/hooks/*.test.mjs" ".claude/skills/uji-fitur/*.test.mjs"` dan `node tools/tim/meja.mjs buka --tiket T-001 --peran <jabatan> --slug coba --dry-run` (harus mencetak slot, port, dan DB yang masuk akal).
6. **Lapor**: daftar berkas baru (`git status --short`), apa yang sudah disesuaikan, apa yang masih perlu keputusan user. **Jangan commit** kecuali user memintanya.

## Jangan
- Jangan mengedit berkas mesin (`tools/tim/*`, `.claude/hooks/*`, `triase*.mjs`) — ia ditimpa saat pembaruan.
- Jangan menimpa `CLAUDE.md` di luar blok bertanda `studio-kit`.
- Jangan menjalankan `--paksa` tanpa persetujuan user.
