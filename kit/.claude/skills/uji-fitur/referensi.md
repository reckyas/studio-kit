# Referensi uji fitur — {{PROYEK}}

> Berkas ini **milik proyek** (tidak ditimpa pembaruan studio-kit). Isi perintah nyata proyek di tiap blok;
> blok yang belum punya perkakas ditulis "belum ada — <rencana>" agar tidak dianggap lulus diam-diam.

## Uji dasar (T1+)
<!-- SESUAIKAN: perintah lint, pemeriksaan tipe, test, dan build per paket. Samakan dengan 'area' di .claude/tim/uji.config.json. -->
| Paket | Lint / tipe | Test | Build |
|---|---|---|---|
| — | — | — | — |

## Blok keamanan
| Blok | Isi | Perintah di proyek ini |
|---|---|---|
| K1 | Suite serangan yang sudah ada | <!-- SESUAIKAN --> |
| K2 | Test serangan baru + uji mutasi | lihat "Serangan minimum" di bawah |
| K3 | Pindai rahasia & audit dependensi | mis. `gitleaks detect` · `npm audit --omit=dev` <!-- SESUAIKAN --> |
| K4 | Header keamanan / CSP / TLS / kontainer | <!-- SESUAIKAN --> |

### Serangan minimum per permukaan baru (K2)
| Permukaan | Wajib diuji |
|---|---|
| Endpoint / socket | tanpa login → ditolak · peran lebih rendah → ditolak · **milik pengguna/tenant lain → ditolak** · masukan tak sah → 4xx, bukan 5xx |
| Unggahan | ukuran di atas batas → ditolak · tipe palsu → ditolak · nama berkas berbahaya dinetralkan |
| Data rahasia | tidak muncul di respons, log, atau galat · tidak bocor sebelum waktunya |
| Publik tanpa login | pembatas laju aktif · batas ukuran body |

**Uji mutasi**: untuk setiap penjaga baru, hapus/lemahkan penjaganya sementara → minimal satu test harus gagal → kembalikan. Catat di laporan: "mutasi: <apa> → <n> gagal ✅".

## Blok performa
| Blok | Isi | Perintah di proyek ini |
|---|---|---|
| P1 | EXPLAIN query jalur yang berubah; tidak ada pemindaian penuh tabel besar | <!-- SESUAIKAN --> |
| P2 | Uji beban jalur panas (mis. k6), dibandingkan baseline | <!-- SESUAIKAN --> |
| P3 | Batas ukuran masukan & waktu respons | <!-- SESUAIKAN --> |

### Baseline performa
<!-- SESUAIKAN: isi setelah putaran T3 pertama; perbarui setiap T3. Regresi > 20 % = bug. -->
| Skenario | Beban | p95 | Galat | Tanggal |
|---|---|---|---|---|
| — | — | — | — | — |
