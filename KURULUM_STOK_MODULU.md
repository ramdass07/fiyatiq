# STOK MODÜLÜ v11.11 — Kurulum (14 Eylül 2026)

## 1) Supabase (önce bu)
`supabase/migrations/20260914150000_stok_modulu_v1111.sql` dosyasını
Supabase SQL Editor'de çalıştır. Sondaki KONTROL sorgusu
"fq_ stok fonksiyonları = 8" göstermeli.

## 2) GitHub upload/main (4 klasöre)
| Nereye | Dosya |
|---|---|
| kök | index.html |
| js/ | stok-modulu.js (YENİ) · teklif-takip.js |
| tests/ | harness.cjs · stok-modulu.test.cjs (YENİ) |
| supabase/migrations/ | 20260914150000_stok_modulu_v1111.sql (YENİ) |

Vercel ~1 dk → F5 → üst çubukta "v · 14 Eyl 2026 · stok modülü v11.11".

## 3) Ne değişti
- Teklif SATILDI işaretlenince ürünlerin stoktan düşümü sorulur (depo seçimi,
  en çok stoklu önseçili). Satıldı geri alınırsa düşümler otomatik geri gelir.
  Aynı teklif iki kez işaretlense bile ÇİFT DÜŞÜM İMKÂNSIZ (idempotent).
- 🔒 satır butonu: süreli rezerve (varsayılan 48 saat, süre dolunca kendiliğinden
  serbest). "🔒 Rezerveler" paneli: kaldır / +48s uzat.
- Net stok artık: sabah fotoğrafı − fotoğraf sonrası satışlar − aktif rezerveler.
  0 < net ≤ 2 → "⚠ SON X ADET" rozeti.
- SABAH YÜKLEMESİ AYNEN DEVAM: dosya fotoğrafı tazeler, rezervelere DOKUNMAZ.
- SQL çalıştırılmadan index yüklenirse modül sessizce devre dışı kalır — hiçbir
  şey bozulmaz (sıralama serbest, ikisi de güvenli).

Test: 208/208 geçti (202 mevcut + 6 yeni).
