---
name: uji-fitur
description: Gerbang uji keamanan & performa setelah fitur/task selesai. Menentukan tingkat uji (T0 dokumen, T1 dasar, T2 terarah, T3 maksimal) dari perubahan git, menjalankan blok uji yang relevan (suite serangan, test serangan baru + uji mutasi, pindai rahasia & dependensi, konfigurasi, EXPLAIN, uji beban), lalu menulis laporan uji. WAJIB dipakai sebelum mencentang task/fitur dan sebelum commit fitur; juga saat user bertanya "perlu diuji apa?", "sudah aman?", atau "uji keamanan/performa".
---

# Uji fitur — gerbang keamanan & performa

Perintah tiap blok dan angka baseline proyek ada di [referensi.md](referensi.md) (diisi per proyek). Pemicu & area paket proyek: `.claude/tim/uji.config.json`.

## Prinsip
- **Uji sebanding dengan risiko.** Mengubah teks tidak perlu uji beban. Menyentuh data rahasia atau jalur panas wajib diuji maksimal.
- **Permukaan baru = test serangan baru.** Suite lama hanya melindungi fitur lama. Fitur yang tidak diuji tidak boleh dianggap lolos.
- **Bukti, bukan klaim.** Setiap penjaga keamanan baru dibuktikan dengan uji mutasi (hapus penjaganya → test harus gagal). Setiap klaim performa dibuktikan dengan angka yang dibandingkan baseline.

## Langkah

### 1. Triase
```bash
node .claude/skills/uji-fitur/triase.mjs                  # perubahan belum commit (atau commit terakhir)
node .claude/skills/uji-fitur/triase.mjs --base <ref>     # seluruh fitur sejak <ref> (commit sebelum fitur dimulai)
```
Pakai `--base` bila fitur terdiri dari beberapa commit. Tambahkan `--rilis` untuk persiapan rilis atau akhir fase besar.

Hasil skrip adalah **batas bawah**. Lalu baca diff-nya sendiri dan jawab pertanyaan berikut, karena skrip tidak bisa membaca maksud kode:

| Pertanyaan | Bila "ya" |
|---|---|
| Ada data yang hanya boleh dilihat peran/pemilik tertentu, atau baru boleh dilihat **setelah waktu tertentu**? | Naik ke ≥ T2, K2 "data rahasia" |
| Dijalankan **per pengguna pada jam sibuk** (jalur panas)? | Naik ke ≥ T2, P1 + P2 |
| Menerima berkas atau teks bebas besar dari pengguna? | K2 unggah + P3 |
| Mengubah skema tabel besar, index, atau transaksi yang diperebutkan? | P1 + P2 |
| Bisa dipicu **tanpa login**? | K2 pembatas laju + ukuran body |
| Menyentuh uang, kuota, atau hak akses? | T3 |

**Naikkan** tingkat bila jawabannya "ya", walau skrip bilang lebih rendah. **Turunkan** hanya dengan alasan tertulis di laporan, misalnya "pemicu ENDPOINT hanya karena mengganti nama variabel".

### 2. Tingkat uji

| Tingkat | Kapan | Yang dijalankan |
|---|---|---|
| **T0 Dokumen** | Hanya dokumen, aset, perkakas `.claude/` | Tidak ada uji. Cukup periksa tautan dan isinya |
| **T1 Dasar** | Kode berubah tanpa menyentuh permukaan sensitif (teks/gaya UI, refactor lokal, logika murni) | Lint + test + build paket yang disentuh. Test baru untuk logika baru |
| **T2 Terarah** | Ada pemicu keamanan dan/atau performa | T1 + **hanya** blok yang dipicu (lihat keluaran triase) |
| **T3 Maksimal** | Pemicu kritis, ≥ 3 pemicu bobot tinggi, persiapan rilis, atau akhir fase besar | Semua suite + semua blok K1–K4 dan P1–P3, dibandingkan baseline |

Blok: **K1** suite serangan yang ada · **K2** test serangan baru + uji mutasi · **K3** pindai rahasia & audit dependensi · **K4** konfigurasi (header/CSP/TLS/kontainer) · **P1** EXPLAIN & index · **P2** uji beban jalur panas · **P3** batas ukuran masukan.

### 3. Jalankan
- Kerjakan blok **berurutan dari yang termurah**: uji dasar → K1/K2 → K3/K4 → P1 → P3 → P2. Bila yang murah gagal, perbaiki dulu.
- Di meja Mode Tim: test & server uji **hanya** dengan DB dan port slot meja (`.claude/tim/meja.local.json`).
- Password/kredensial tidak pernah dimasukkan sendiri; login selalu oleh user.
- Temuan (celah, regresi performa > 20 %, galat baru) adalah **bug**: catat di `docs/BUGLOG.md` + entri detail di `docs/BUGLOG_DETAIL.md` (akar masalah + pencegahan), perbaiki, lalu buktikan dengan test. Di meja: tulis sebagai draf bug `BUG-<tiket>a` di laporan tiket.
- Uji yang butuh perangkat fisik atau login user → tulis sebagai "menunggu user" beserta langkah spesifiknya. Jangan dianggap lulus.

### 4. Laporan uji
Tempel di baris log `docs/PROGRESS.md` untuk task itu (Mode Solo) atau bagian "Laporan uji" laporan tiket (meja):

```
Uji: T2 (pemicu ENDPOINT, UNGGAH) — dasar ✅ server 120/120; K1 ✅; K2 +3 test (akses lintas pemilik → 403, berkas 30 MB → 413, peran rendah ubah data → 403), mutasi: hapus penjaga pemilik → 2 gagal ✅; P3 ✅. Turun/naik: —. Menunggu user: —
```

### 5. Gerbang commit
Task/fitur **tidak boleh dicentang dan tidak boleh di-commit sebagai selesai** selama:
- ada blok wajib di tingkatnya yang gagal atau dilewati tanpa alasan tertulis;
- ada test yang ditandai "boleh gagal" tanpa catatan temuan;
- ada temuan tanpa entri BUGLOG (atau draf bug di laporan tiket).

## Memperbarui skill ini
- Pemicu baru khas proyek → tambahkan di `.claude/tim/uji.config.json` (`pemicu`), bukan di `triase-lib.mjs` (berkas itu milik studio-kit dan ditimpa saat pembaruan).
- Perintah blok & baseline performa → `referensi.md` (milik proyek, tidak ditimpa).
- Temuan yang lolos gerbang ini → tambahkan pemicu atau serangan minimum supaya tidak lolos lagi, lalu catat di BUGLOG (pencegahan).
