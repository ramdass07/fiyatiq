# FiyatIQ v11.8 doğrulama

`npm ci`, `npm run check`, `npm test` ile çalıştırılır. Node 20 ve üzeri gerekir.

135 test, gerçek sayfanın JavaScript kodunu jsdom üzerinde çalıştırır. Supabase Auth ve veri yanıtları taklit edilir; canlı hesaba e-posta gönderilmez veya canlı veritabanına yazılmaz.

Kapsam: müşteri değiştirirken eski teklifin korunması, yeni teklif numarası, hesap kapsamlı teklif arama, kayıt hataları, taslak saklama/geri yükleme, güncel fiyat onayı, manuel fiyatlar, geçersiz kurtarma bağlantıları, oturum yenileme ve ilk açılış verileri yüklenirken işlem koruması.

## Yayın sonrası kabul kontrolü

- Şifre kurtarma e-postasının geldiğini ve şifresini değiştirdiğini hesap sahibi 10 Eylül 2026'da doğruladı. Bu kabul maddesi kapalıdır; v11.8 için yeniden e-posta gönderilmedi.
- Mağaza hesabıyla teklif kaydet, Tekliflerim içinden incele; Yeni teklif ile farklı müşteri kaydının önceki teklifi değiştirmediğini doğrula.
- Sayfayı yenileyip Taslaklar üzerinden devam et; güncel fiyatları onaylayıp yeni kopya kaydet.

Taslaklar tarayıcıya ve hesaba özeldir, 7 gün tutulur; cihazlar arası eşitlenmez. TC kimlik numarası taslakta/kopya girdilerinde saklanmaz. Tekliflerim mağaza hesabı kapsamındadır; ayrı çalışan hesapları bu sürümün kapsamına dahil değildir.


## v11.6 müşteri takibi

Takip alanları teklifin fiyat/satır özetinden ayrı sütunlarda tutulur. Güncelleme `takip_surumu` ile karşılaştırılır; eski sürüm eşleşmediğinde kullanıcının notu pencerede korunur. Sunucu durum değişikliğinde sürümü, zamanı ve oturum sahibini damgalar. Satıldı/Kaybedildi arama planını kapatır; kayıp nedeni zorunludur.

`tests/followup-rls.sql` yalnız Deneme projesinde çalıştırıldı. Sentetik teklifler, iki gerçek test hesabının yetkileriyle aynı marka kapsamında denendi; işlem sonunda tamamı ROLLBACK yapıldı. Başka bayi/anon erişimi, eski sürüm, damga sahteleştirme, kapanmış aramalar ve fiyat özeti korunması geçti.

Müşteriye göster ekranı maliyet, kâr, komisyon, hakediş ve iç notları içermez. Manuel fiyat, sıfır komisyonlu taksit, metin güvenliği, eksik fiyat ve kapanış temizliği testleri vardır.

Ek kabul: Tekliflerim > Müşteri takibi üzerinden not ve arama gir; Bugün aranacaklar listesini kontrol et; Kaybedildi durumunda neden yaz; Müşteriye göster ekranını kullan. Görüşme notu yalnız Takibi kaydet ile kalıcılaşır. Buradaki tarih bir liste planıdır; otomatik e-posta/telefon bildirimi göndermez.

## v11.7 kayıt, teklif geçerliliği ve stok tarihi

Başvuru, ad/mağaza ve `basvuru_markalari` bilgisini saklar. Yeni hesap bayi, pasif, boş marka erişimi ve stok sahibi olmadan açılır. Yönetici marka ve stok/fiyat listesi modelini seçip tek güncellemeyle onaylar. Eski marka varsayılanları yeni onayda otomatik kabul edilmez. Mevcut aktif hesapların yetkileri korunur.

`tests/signup-rls.sql`, Deneme üzerinde beş sentetik Auth kaydı oluşturur; şifre veya e-posta üretmez. İstenen markaların yetkiye dönüşmemesi, kendi kendini onaylama girişiminin reddi, yönetici onayı, marka kapsamı, eski/bozuk metadata ve mevcut hesapların korunması geçti. İşlem ROLLBACK ile tamamlandı. Canlı migration sürümü: `20260910135448_signup_application_v117`.

Teklif tarihi Türkiye gününe göre varsayılan bugündür; değiştirilebilir. Uygulanan kampanyanın bilinen bitişi varsa süre onu aşmaz. Tarih kayda, geçmiş detaya, müşteri görünümüne, fiyat teklifi çıktısına ve WhatsApp hazırlığına girer. Taslak seçimi korur; yeni teklif/kopya bugüne döner. Eski kayıtta tarih uydurulmaz. Sipariş formuna fiyat teklifi geçerlilik şartı eklenmez.

Stok tarihleri kayıtlı `stok_tarihi` alanından gelir; yükleme/sorgu saati değildir. Mevcut ve ayrılan kayıtların en eski tarihi kullanılır; eksik, ileri, eski tarih ve kayıt yok ayrı gösterilir. Mars/Horoz için 3, kendi depo için 7 gün eşikleri bilgilendirme amaçlıdır. Geciken sorgular marka, hesap veya ürün değiştikten sonra sonuçları ezemez.

Geçmiş teklif tarihi, eski stok veya maliyet altı fiyat nedeniyle satış engeli eklenmedi. Maliyet altındaki ve geçmiş tarihli teklifin kaydı, yazdırılması ve WhatsApp hazırlığı test edildi. Kayıt sürerken bilgi değişirse farklı sürümler bir çıktıda karışmaz; kullanıcı son değişiklikleri koruyarak yeniden dener.

Auth birim testleri gerçek e-posta teslimini veya SMTP yapılandırmasını kanıtlamaz. E-posta teslimi ve parola değişimi hesap sahibinin yukarıdaki teyidine dayanır.

## v11.8 kayıtlı çıktı, rapor ve gerçek satış

Kayıtlı teklifin yazdırılması ve WhatsApp taslağı aynı saklanmış müşteri fiyat özetini kullanır. Güncel katalogdan fiyat hesaplanmaz, sepet ve kayıt güncellenmez. Eski kayıtta olmayan satır dağılımı veya geçerlilik tarihi uydurulmaz. Maliyet, kâr, komisyon, iç not ve kimlik numarası müşteri çıktısına taşınmaz. Çelişkili fiyat özeti güvenli hata verir; geçmiş geçerlilik ve maliyet altı fiyat satış engeli değildir. Açılır pencere, hesap ve geciken istek kontrolleri testlidir. Gerçek WhatsApp mesajı gönderilmedi.

Yönetim raporu mevcut RLS ve korunan profil yetkisiyle çalışan `fq_teklif_raporu` üzerinden 50 kayıtlık sayfalarda gelir. Arama, mağaza ve teklif oluşturulma tarihi sunucuda süzülür; Türkiye tarih sınırları kullanılır. Durum yalnız listeyi süzer, dönüşüm özeti aynı teklif grubundaki tüm durumları içerir. Gerçek satış toplamı bu teklif grubuna aittir; satış tarihine göre tahsilat raporu değildir. Excel tüm sonuçları 500'lük sayfalardan toplar, sayım/sıra veya rapor içeriği değişirse eksik dosya üretmez.

Satıldı seçildiğinde müşterinin kabul ettiği gerçek tutar, ödeme şekli, banka/taksit ve satış tarihi ayrıca kaydedilebilir. Bilgilerin tamamı boş kalabilir; girilmeye başlanan kayıtta tutar/ödeme/tarih birlikte tamamlanır. Sıfır tutar geçerlidir, bilinmeyen tutar sıfıra çevrilmez; kuruşlar korunur. Eski `satis_tutari` ve `toplam` teklif karşılığı olarak kalır, gerçek satışlara tahmini veri doldurulmaz. Teklif durumuna geri dönmek gerçek satış alanlarını temizler; mevcut bilgilerin silinmesi kullanıcıya onaylatılır. Takip sürümü çakışma ve damga koruması bu alanları da kapsar.

`tests/reporting-sales-rls.sql` Deneme üzerinde başarıyla çalıştı: 1.205 teklif, 4 Türkiye tarih sınırı kaydı; tam özet ve dışa aktarım, durumdan bağımsız dönüşüm, eski dizi kayıtları, arama karakterleri, aktif merkez erişimi, pasif/bayi/anon retleri, kendi kaydını güncelleme, gerçek tutar tutarlılığı, sürüm/damga ve saklanmış fiyatların korunması. Sentetik şifresiz hesaplar ve teklifler işlem sonunda ROLLBACK ile kaldırıldı. Canlı migration: `20260910143846_sales_reporting_v118`. Canlıdaki 16 teklifin önceki tüm alanlarının parmak izi migration öncesi ve sonrası aynı kaldı.

Otomatik arayüz testleri jsdom, veri testi gerçek Deneme PostgreSQL üzerinde çalışır. Bunlar canlı kullanıcı hesabında uçtan uca tarayıcı kullanımının veya bir mesajın tesliminin kanıtı değildir.
