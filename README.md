# BCIFT Blog Studio

CMS blog Astro + Node + SQLite. Template tampilan, artikel dan SEO BCIFT tetap tersedia.

## Login

Akun admin tetap dikonfigurasi pada `src/server/internal-accounts.mjs`. Gunakan email/password awal yang sudah diberikan, lalu langsung masuk ke `/blog/admin/`. Tidak ada authenticator, kode OTP atau langkah aktivasi tambahan. Pendaftaran melalui web ditutup.

Password asli tidak ditulis ke source code: file konfigurasi memuat email, hash scrypt, peran (admin/editor), dan enabled. File ini hanya dipakai server, tidak masuk bundle browser. Untuk mengganti password, jalankan `npm run cms:password-hash` di terminal, lalu salin hash ke konfigurasi. Untuk menambah akun tetap, tambahkan entri pada file tersebut. Restart server atau rebuild/restart saat produksi.

Perubahan password/peran/status konfigurasi langsung mencabut sesi saat server membaca konfigurasi baru. Menghapus entri menonaktifkan akun yang dikelola kode; mengembalikannya mengaktifkan sesuai enabled. Akun lama dan artikel tidak ditimpa. Akun berlabel Dari kode tidak bisa diubah lewat dashboard. Alat lokal `npm run cms:user:create` tetap tersedia untuk pengelola server bila diperlukan, tetapi bukan langkah yang diperlukan untuk akun tetap.

## Menjalankan

Gunakan Node 22.13+ (diuji dengan Node 26):

```sh
npm install
npm run dev
```

Blog: http://localhost:4321/blog/
Dashboard: http://localhost:4321/blog/admin/

```sh
npm run build
npm test
npm start
```

Tidak ada deployment atau push GitHub otomatis.

## Akses dan keamanan

Login langsung menggunakan email dan password. Password di-hash scrypt, sesi disimpan sebagai token acak dengan hash di database, cookie HttpOnly + SameSite=Strict (Secure pada HTTPS). Sesi berakhir setelah 8 jam atau 30 menit tanpa aktivitas. Percobaan login dibatasi 10 kegagalan per IP/email dalam 15 menit.

Token CSRF bertanda tangan dikirim otomatis oleh dashboard; perbedaan alamat browser/server akibat tunnel tidak memblokir login. Token lama diperbarui otomatis dan request dicoba ulang sekali. Tidak ada token yang perlu diisi pengguna. Permintaan tanpa bukti CSRF sah ditolak.

Admin dapat menerbitkan, menarik dan menghapus artikel serta mengelola status/peran akun yang tidak dikelola kode. Editor menulis draft dan upload gambar; tidak dapat menerbitkan, menghapus, mengubah artikel terbit atau mengelola anggota. Pemeriksaan peran berlaku di API. Penonaktifan akun/perubahan peran mencabut sesinya. Minimal satu admin aktif dipertahankan oleh pengaturan dashboard.

Link reset password hanya untuk akun non-konfigurasi yang sudah ada, berlaku 24 jam dan satu kali pakai. Bagikan melalui kanal internal pribadi; belum ada pengiriman email otomatis. Untuk akun Dari kode, ubah hash di file konfigurasi. Aktivitas login dan perubahan artikel/anggota dicatat. Untuk pengaturan akses sensitif, login ulang diperlukan jika login sebelumnya lebih dari 15 menit.

## Artikel dan SEO

Tulis lewat editor visual: paragraf, H2/H3, tebal, miring, daftar, kutipan, tautan dan gambar. Upload JPG/PNG/WebP maksimal 5 MB. Lengkapi alt gambar sebelum publish. Draft tetap privat dan hanya dapat dipratinjau setelah login. Artikel terbit langsung masuk blog dan sitemap tanpa build ulang.

Judul SEO opsional; fallback judul artikel. Ringkasan menjadi meta description. Saran kata kunci berdasarkan judul dan bisa diedit, bukan riset volume pencarian/janji ranking. Canonical, Open Graph/Twitter, schema artikel/breadcrumb dan tanggal otomatis. Enam Markdown lama tetap arsip draft; tiga artikel di homepage belum dikerjakan sesuai permintaan.

## Data dan hosting

`data/blog.sqlite` menyimpan akun, artikel, gambar, sesi, link reset dan audit. `data/csrf.key` kunci token CSRF. Data MFA lama, bila ada, disimpan sebagai arsip dan tidak dipakai untuk login. Seluruh folder data diabaikan Git. Backup folder data saat server berhenti atau gunakan backup SQLite online. Gunakan CMS_DATA_DIR absolut pada disk persisten produksi; jangan hapus data saat deploy. Batasi akses folder ke pengelola/service server.

Produksi memerlukan Node, disk persisten dan HTTPS. Proxy `/blog/`, `/_astro/`, `/images/`, `/favicon.png` sesuai aplikasi; jangan mengganti homepage utama BCIFT. Proxy harus memvalidasi host serta menimpa header X-Forwarded-For/Host/Proto dan membatasi port backend agar hanya bisa diakses proxy. Batas body 8 MB. Keanggotaan internal membatasi akses dashboard, bukan menyembunyikan URL login.

Tambahkan https://bcift.co.id/blog/sitemap.xml ke robots.txt situs utama dan Search Console. Untuk konfigurasi host proxy khusus gunakan CMS_PUBLIC_ORIGIN, tanpa path, lalu restart/rebuild server. Keamanan mutasi CMS tidak bergantung pada pencocokan origin tunnel.

## Pengujian

`npm test` memakai database sementara terisolasi: login password langsung tanpa 2FA, sesi idle/logout, pencabutan akun, peran server-side, pendaftaran web ditutup, reset sekali pakai, CSRF dan refresh otomatis, tunnel yang berubah, HTML sanitization, upload, draft privat, publish dan sitemap.

Logo/foto ferry/terminal dari bcift.co.id. beach.jpg/island.jpg merupakan ilustrasi Unsplash, bukan foto lokasi Batam terverifikasi; gunakan foto yang disetujui sebelum publikasi.
