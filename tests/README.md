# FiyatIQ v11.5 doğrulama

`npm ci`, `npm run check`, `npm test` ile çalıştırılır. Node 20 ve üzeri gerekir.

36 test, gerçek sayfanın JavaScript kodunu jsdom üzerinde çalıştırır. Supabase Auth ve veri yanıtları taklit edilir; canlı hesaba e-posta gönderilmez veya canlı veritabanına yazılmaz.

Kapsam: müşteri değiştirirken eski teklifin korunması, yeni teklif numarası, hesap kapsamlı teklif arama, kayıt hataları, taslak saklama/geri yükleme, güncel fiyat onayı, manuel fiyatlar, geçersiz kurtarma bağlantıları oturum yenileme ve ilk açılış verileri yüklenirken işlem koruması.

## Yayın sonrası kabul kontrolü

- Test hesabıyla Şifremi unuttum bağlantısı iste; e-posta teslimini ve yeni şifreyle girişi doğrula. Supabase Auth yönlendirme listesinde https://fiyatiq.com/ bulunmalı; e-posta sağlayıcısı kullanılacak hesaplara gönderime izin vermeli.
- Mağaza hesabıyla teklif kaydet, Tekliflerim içinden incele; Yeni teklif ile farklı müşteri kaydının önceki teklifi değiştirmediğini doğrula.
- Sayfayı yenileyip Taslaklar üzerinden devam et; güncel fiyatları onaylayıp yeni kopya kaydet.

Taslaklar tarayıcıya ve hesaba özeldir, 7 gün tutulur; cihazlar arası eşitlenmez. TC kimlik numarası taslakta/kopya girdilerinde saklanmaz. Tekliflerim mağaza hesabı kapsamındadır; ayrı çalışan hesapları bu sürümün kapsamına dahil değildir.
