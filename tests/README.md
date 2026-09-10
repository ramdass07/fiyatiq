# FiyatIQ v11.6 doğrulama

`npm ci`, `npm run check`, `npm test` ile çalıştırılır. Node 20 ve üzeri gerekir.

52 test, gerçek sayfanın JavaScript kodunu jsdom üzerinde çalıştırır. Supabase Auth ve veri yanıtları taklit edilir; canlı hesaba e-posta gönderilmez veya canlı veritabanına yazılmaz.

Kapsam: müşteri değiştirirken eski teklifin korunması, yeni teklif numarası, hesap kapsamlı teklif arama, kayıt hataları, taslak saklama/geri yükleme, güncel fiyat onayı, manuel fiyatlar, geçersiz kurtarma bağlantıları, oturum yenileme ve ilk açılış verileri yüklenirken işlem koruması.

## Yayın sonrası kabul kontrolü

- Test hesabıyla Şifremi unuttum bağlantısı iste; e-posta teslimini ve yeni şifreyle girişi doğrula. Supabase Auth yönlendirme listesinde https://fiyatiq.com/ bulunmalı; e-posta sağlayıcısı kullanılacak hesaplara gönderime izin vermeli.
- Mağaza hesabıyla teklif kaydet, Tekliflerim içinden incele; Yeni teklif ile farklı müşteri kaydının önceki teklifi değiştirmediğini doğrula.
- Sayfayı yenileyip Taslaklar üzerinden devam et; güncel fiyatları onaylayıp yeni kopya kaydet.

Taslaklar tarayıcıya ve hesaba özeldir, 7 gün tutulur; cihazlar arası eşitlenmez. TC kimlik numarası taslakta/kopya girdilerinde saklanmaz. Tekliflerim mağaza hesabı kapsamındadır; ayrı çalışan hesapları bu sürümün kapsamına dahil değildir.


## v11.6 müşteri takibi

Takip alanları teklifin fiyat/satır özetinden ayrı sütunlarda tutulur. Güncelleme `takip_surumu` ile karşılaştırılır; eski sürüm eşleşmediğinde kullanıcının notu pencerede korunur. Sunucu durum değişikliğinde sürümü, zamanı ve oturum sahibini damgalar. Satıldı/Kaybedildi arama planını kapatır; kayıp nedeni zorunludur.

`tests/followup-rls.sql` yalnız Deneme projesinde çalıştırıldı. Sentetik teklifler, iki gerçek test hesabının yetkileriyle aynı marka kapsamında denendi; işlem sonunda tamamı ROLLBACK yapıldı. Başka bayi/anon erişimi, eski sürüm, damga sahteleştirme, kapanmış aramalar ve fiyat özeti korunması geçti.

Müşteriye göster ekranı maliyet, kâr, komisyon, hakediş ve iç notları içermez. Manuel fiyat, sıfır komisyonlu taksit, metin güvenliği, eksik fiyat ve kapanış temizliği testleri vardır.

Ek kabul: Tekliflerim > Müşteri takibi üzerinden not ve arama gir; Bugün aranacaklar listesini kontrol et; Kaybedildi durumunda neden yaz; Müşteriye göster ekranını kullan. Görüşme notu yalnız Takibi kaydet ile kalıcılaşır. Buradaki tarih bir liste planıdır; otomatik e-posta/telefon bildirimi göndermez.
