# Laporan {{TIKET}} — {{PERAN}}

> Dibuat otomatis oleh `tools/tim/meja.mjs` (slot {{SLOT}}, branch `{{BRANCH}}`). Diisi jabatan pemilik meja,
> dibaca CTO saat integrasi lalu **dihapus** (isinya pindah ke PROGRESS/BUGLOG/PLAN).

## Status
<Sedang dikerjakan / Siap review / Terblokir: alasan>

## Ringkasan perubahan
- …

## Berkas utama yang berubah
- `…` — …

## Cocokkan tiket (wajib sebelum `SELESAI`)
<!-- SETIAP butir Cakupan & SETIAP kriteria tiket, nomor sama dengan tiket. ⚠ = sebagian. Jangan ✅ tanpa bukti. -->
| Butir tiket | Status | Bukti (test / langkah manual / screenshot) atau alasan bila ❌/⚠ |
|---|---|---|
| Cakupan 1 | ✅/⚠/❌ | … |
| Kriteria 1 | ✅/⚠/❌ | … |

**Tidak dikerjakan / dipersempit**: — (atau sebutkan & alasannya)

## Laporan uji (`uji-fitur`)
- Triase: `node .claude/skills/uji-fitur/triase.mjs --base <ref>` → tingkat **T?** (alasan naik/turun: …)
- Test: <paket> <lulus>/<total> (DB/port slot {{SLOT}})
- Blok keamanan/performa: …
- Uji manual (browser / perangkat): …

## Draf bug (nomor final diberi CTO)
<!-- Pakai placeholder BUG-{{TIKET}}a, BUG-{{TIKET}}b … di sini DAN di komentar kode. -->
### BUG-{{TIKET}}a — <judul>
- Gejala: …
- Akar masalah: …
- Perbaikan: …
- Pencegahan / usulan aturan anti-regresi: …

## Usulan untuk berkas single-writer
- Centang PLAN: <task>
- Baris log PROGRESS: `YYYY-MM-DD | <Fase.Task> | ✅ | <ringkasan> | <commit>`
- Catatan handoff: …

## Butuh jabatan lain
- <mis. frontend-engineer: tampilkan field X di halaman Y> / —

## Tanggapan review
<!-- Verdict dicatat CTO di PAPAN. Bila TOLAK, tulis di sini temuan mana yang sudah diperbaiki (commit). -->
- …
