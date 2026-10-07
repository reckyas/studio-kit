---
name: perbarui
description: Memperbarui perkakas Mode Tim (studio-kit) di proyek ini ke versi kit terbaru tanpa menimpa penyesuaian proyek. Pakai saat user meminta "perbarui studio-kit", "update perkakas tim", atau setelah menarik versi baru kit.
---

# Perbarui studio-kit di proyek ini

Pemasang: `${CLAUDE_PLUGIN_ROOT}/pasang.mjs --perbarui`. Mesin selalu ditimpa; jabatan/SOP/templat hanya ditimpa bila belum diubah di proyek; konfigurasi & catatan proyek tidak disentuh.

## Langkah
1. Syarat: sesi **tanpa jabatan** (atau jabatan `cto` di checkout utama), root repo proyek, `.claude/tim/studio-kit.json` ada, **tidak ada meja terbuka** (`node tools/tim/meja.mjs daftar`) — memperbarui `meja.mjs` saat meja aktif berisiko; bila ada, minta user menutupnya dulu atau menunda.
2. Pratinjau: `node "${CLAUDE_PLUGIN_ROOT}/pasang.mjs" --perbarui --target . --dry-run`. Tunjukkan baris "diperbarui" dan "dilewati".
3. Jalankan tanpa `--dry-run`.
4. Untuk tiap berkas **dilewati — diubah di proyek**: bandingkan dengan versi kit (`${CLAUDE_PLUGIN_ROOT}/kit/<path>`), ringkas bedanya untuk user, dan gabungkan hanya bagian yang berguna. Jangan `--paksa` tanpa persetujuan.
5. Bila versi baru menambah kunci konfigurasi (lihat `KONFIG_BAWAAN` di `tools/tim/meja-lib.mjs`), sebutkan ke user — `studio.config.json` tidak diubah otomatis.
6. Uji: `node --test "tools/tim/*.test.mjs" ".claude/hooks/*.test.mjs" ".claude/skills/uji-fitur/*.test.mjs"`.
7. Lapor `git diff --stat` dan versi baru (`versi` di `.claude/tim/studio-kit.json`). **Jangan commit** kecuali diminta.
