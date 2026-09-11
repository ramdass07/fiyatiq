# FiyatIQ v11.10.1 doğrulama

`npm ci`, `npm run check`, `npm test` ile çalıştırılır. Node 20 ve üzeri gerekir.

202 test, gerçek sayfanın JavaScript kodunu jsdom üzerinde çalıştırır. Supabase Auth ve veri yanıtları taklit edilir; otomatik testler canlı hesaba e-posta göndermez veya canlı veritabanına yazmaz. Ayrıca yapılan canlı tarayıcı kontrolünün kapsamı aşağıda ayrı açıklanır.

Kapsam: müşteri değiştirirken eski teklifin korunması, yeni teklif numarası, hesap kapsamlı teklif arama, kayıt hataları, taslak saklama/geri yükleme, güncel fiyat onayı, manuel fiyatlar, geçersiz kurtarma bağlantıları, oturum yenileme ve ilk açılış verileri yüklenirken işlem koruması.

## Yayın sonrası kabul kontrolü

- Şifre kurtarma e-postasının geldiğini ve şifresini değiştirdiğini hesap sahibi 10 Eylül 2026'da doğruladı. Bu kabul maddesi kapalıdır; v11.9 için yeniden e-posta gönderilmedi.
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

## v11.9 satış tarihi raporu ve teklif geçmişi

Yönetim raporundaki Gerçekleşen satışlar görünümü `fq_satis_raporu` üzerinden kayıtlı satış tarihine göre çalışır. Ağustosta oluşturulup eylülde satılan teklif eylül satışlarına girer. Tarih aralığının iki sınırı da dahildir; Bu ay ve Önceki ay seçimleri Türkiye takvimini kullanır. Teklif ve satış görünümleri kendi filtrelerini ayrı saklar. Satış görünümünde satış sayısı, gerçekleşen toplam ve ortalama gösterilir; teklif dönüşüm oranı hesaplanmaz. Satış tarihi eksik veya geçersiz Satıldı kayıtları aya atanmaz; seçili mağaza ve aramadaki tüm dönemleri kapsayan ayrı bir sayıyla açıklanır. Eksik tutar veya tarih tahmin edilmez; gerçekleşen satış tutarı tahsilat değildir.

Satış Excel'i eşleşen kayıtların tamamını sayfalar halinde alır ve rapor kapsamını ayrı sayfada açıklar. Görünüm, filtre veya oturum değişirse devam eden aktarım iptal edilir. Eksik sayfa, mükerrer kayıt veya değişen rapor revizyonunda dosya oluşturulmaz. Arayüz testleri ay/yıl geçişlerini, artık yılı, bağımsız görünüm filtrelerini, geciken yanıtları, sıfır ve kuruşlu tutarları, tarihsiz kayıt açıklamasını ve tam Excel aktarımını kapsar.

Teklif ve görüşme geçmişi, başarılı teklif değişikliğiyle aynı işlem içinde sunucu tarafından eklenir. Müşteri, ürün/fiyat, durum, görüşme notu, arama ve gerçek satış bilgilerindeki değişiklikler önce/sonra değerleriyle tutulur. İstemci geçmişe doğrudan kayıt ekleyemez, değiştiremez veya silemez; okuma mevcut teklif ve marka erişimine bağlıdır. Başarısız veya geri alınan kayıt geçmiş bırakmaz; izlenen bilgiler değişmediyse yeni olay oluşmaz. Geçmiş ekranını açıp kapatmak takip formundaki kaydedilmemiş notları değiştirmez.

Mevcut teklifler için Başlangıç olayı, geçmiş kaydı açıldığı andaki bilgiyi saklar; eski görüşmeleri veya geçmişteki işlemleri yeniden kurmaz. İşlemi yapan bilgisi kullanılan mağaza/yönetim hesabını gösterir. Ayrı kişisel çalışan hesapları eklenmediği için ortak hesabı kullanan kişinin kimliği kesin olarak belirlenemez. İç geçmiş müşteri çıktısına eklenmez; maliyet, kâr, komisyon ve kimlik numarası gibi izin verilmeyen özet alanları geçmişe kopyalanmaz.

`tests/sales-date-report-rls.sql` Deneme üzerinde başarıyla çalıştı: 1.205 satışın eksiksiz sayfalanması, teklif ve satış ayının ayrılması, dahil tarih sınırları, sıfır/kuruşlu toplamlar, boş/sonsuz tarihler için ayrı sayım, arama/mağaza filtresi, yetkili merkez erişimi, bayi/pasif/eksik profil/anon retleri ve aktarım revizyonunun değişiklikleri yakalaması doğrulandı. `tests/quote-history-rls.sql` başlangıç anlamını, sistem işlemlerini, bozuk/eski özetlerin güvenli okunmasını, izinli alanları, hesap atfını, önceki notların korunmasını, teklif fiyatıyla gerçek tutarın ayrılmasını, sürüm çakışmasını, başarısız işlemlerin atomikliğini, geçmişe doğrudan yazmanın reddini, bayi/marka/anon sınırlarını, sayfalamayı ve geçmişi olan teklifin silinmesinin reddini doğruladı. İki SQL testi yalnız Deneme projesinde sentetik kayıtlarla çalıştırıldı; tüm test kayıtları ROLLBACK ile kaldırıldı.

Canlı migration: `20260910151518_sales_report_history_v119`. Mevcut 16 teklifin parmak izi işlem öncesi ve sonrası aynı kaldı (`e50207ab7db3c6f74ae4d2b7f9f51507`); her teklif için bir başlangıç olayı oluşturuldu. Geçmiş tablosunda RLS açık, authenticated rolünün doğrudan yazma yetkisi kapalıdır. İki yeni okuma RPC'si SECURITY INVOKER kullanır ve anon erişimi yoktur. 167 jsdom testi ve 15 JavaScript kaynağının sözdizimi kontrolü geçti. Canlı kullanıcı hesabıyla yeni akışların uçtan uca tarayıcı kullanımı ayrıca test edilmedi; bu doğrulamalar böyle bir kabul testi yerine geçmez.


## v11.9 satışçı maliyet görünürlüğü düzeltmesi

Sade görünüm maliyet/BİP/net maliyet sütunlarını gizlediği için satışçı bu tutarları yalnız Detaylı görünümde görebiliyordu. Ürün adının altına sürekli görünen Maliyet, BİP desteği ve Net maliyet alanları eklendi. Bunlar 1 adet için, kuruşlarıyla gösterilir; peşin/taksitli satış fiyatları mevcut satır toplamı anlamını korur. Net maliyet maliyet−BİP'tir; bundle hakedişi buradan ikinci kez düşülmez.

Manuel modda mevcut motor kuralı korunur: girilen birim maliyet kullanılır ve BİP ayrıca uygulanmaz. Bu durum açıkça yazılır. Manuel maliyet girdisi sade ekranda erişilebilir hale geldi; görünüm değişirken ikinci gizli input bırakılmaz. Sıfır BİP ve sıfır net maliyet görünür, bilinmeyen maliyet sıfır olarak sunulmaz. Ürün kodu değişince eski maliyet alanı temizlenir; başarısız/bekleyen veri için eski tutar gösterilmez.

`tests/sales-cost-visibility.test.cjs` altı yeni kontrol içerir: mağaza/merkez/yönetim görünürlüğü, çok adet için birim değer ve kuruşlar, manuel girdinin tek kalması ve müşteri görünümünün açılması, sıfır/eksik bilgi, değişen ürün/yükleme, pazarlık fiyatından bağımsız maliyet ve müşteri görünümünde iç bilgilerin bulunmaması. Müşteri görünümü ve kayıtlı yazdırma/WhatsApp regresyonlarıyla 26 hedefli kontrol geçti; 15 JavaScript kaynağı sözdizimi kontrolünden geçti.

Bu düzeltme v11.9 yayın paketine eklendi. Kullanıcı 10 Eylül 2026'da v11.9 kodlarının, migration ve test dosyalarının mevcut herkese açık GitHub deposunda paylaşılmasını ve fiyatiq.com üzerinde yayımlanmasını onayladı. Yeni veritabanı migration'ı gerekmiyor. Hesaplama motoru, fiyat kaynağı, PH oranı, erişim rolleri ve müşteri çıktılarının alan listeleri değiştirilmedi.


## v11.9.1 maliyetsiz üründe perakende fiyatı

Efektif birim maliyeti bulunmayan üründe, fiyat listesinden geçerli perakende fiyatı geliyorsa sade görünümde ürünün maliyet alanının başında Perakende fiyatı etiketiyle gösterilir. Bu, bir adet için referans tutardır; maliyet, net maliyet veya otomatik satış fiyatı olarak kullanılmaz. Kullanıcı manuel satış fiyatı girdiyse bu tutar korunur; maliyet girilince normal maliyet görünümü devam eder.

Adı ve maliyeti boş, yalnız perakende fiyatı olan sorgu yanıtı artık kaybolmaz; ürün kodu adı olarak kullanılır. Yeni sorguda perakende alanı yoksa eski değer temizlenir. Bekleyen/hatalı veri veya sıfır/bozuk perakende değeri gösterilmez.

Üç yeni regresyon testi perakende-only yanıtı, birim/kuruş gösterimini, bilinmeyen maliyetin korunmasını, otomatik satışa aktarılmamasını, manuel satışın korunmasını ve eksilen perakende fiyatının temizlenmesini kapsar. Bu değişiklik veritabanı migration'ı gerektirmez.

## v11.9.2 mobil satış ve negatif kâr düzeltmesi

700px ve altındaki ekranlarda satış görünümü ürün kartları kullanır; masaüstündeki sade/detaylı görünüm tercihi korunur. Menü ve teklif işlemleri açılır bölümlere taşınır. Maliyet, BİP, net maliyet ve gerektiğinde perakende referansı görünür kalır. Ek boş satırlar telefonda gösterilmez, ürün ekleme mevcut boş girdiyi kullanır. Döndürme sırasında odaklanmış alanın düzenlemesi kesilmez. CSS dosyası yayın izin listesine eklenmiştir.

Negatif hedef kâr motor tarafından reddediliyordu; tablo hesaplama öncesinde temizlendiği için kod ve ürün adı kayboluyordu. Sonlu negatif oranlar artık hesaplanır, zarar uyarıları korunur. Satır hesaplamaları görünür tablo temizlenmeden doğrulanır. Bundle olmadan iki ürünle -5% senaryosu, fiyatlar, zarar göstergesi, taslak ve kayıt doğrulanır.

`mobile-sales.test.cjs` mobil/masaüstü geçişi, tek manuel maliyet girdisi, perakende görünürlüğü, boş satır kullanımı ve odak korunmasını; `negative-profit-layout.test.cjs` negatif oranları ve kaydı kapsar. Gerçek telefon tarayıcısında görsel kontrol yapılmadı: yerel önizleme adresi bulut tarayıcısının URL politikası tarafından engellendi. Veritabanı migration'ı yoktur.

## v11.9.3: satış akışının birlikte doğrulanması ve öneri kutusu

Ürün öneri kutusunun sabit en az 340px genişliği dar ekranın sağına taşabiliyordu. Genişlik ve yatay konum görünür ekran içinde 8px kenar boşluklarına sınırlandı. Masaüstü genişliği, belge kaydırması ve öneriden ürün seçimi korundu. Maliyet bulunmayan ürün uyarısı “MALİYET EKSİK” olarak düzeltildi; listede perakende fiyatı varken ürünün hiç bulunmadığını söylemez.

Yeni 5 öneri kutusu testi 320/360/390/430px sınırlarını, sağ/sol kenarları, masaüstünü ve seçimi kapsar. Bunlar verilen DOM ölçüleriyle matematiksel yerleşim kontrolleridir; fiziksel telefon görsel testi değildir.

Yeni 2 satış entegrasyon testi Bosch ve Siemens için dört ürün, iki bundle, -5% hedef kâr, manuel pazarlık, kayıt, müşteri görünümü, kayıtlı çıktılar ve güncel maliyetle yeni kopya akışını birlikte doğrular. Stoksuz/zararına satış engellenmez; eski teklif ve müşteri çıktılarının gizliliği korunur. Canlı hesaptaki ürün, bundle, eksi kâr, pazarlık, kayıt ve müşteri görünümü kontrolü de yapıldı; fiziksel yazdırma veya gerçek WhatsApp gönderimi yapılmadı.

191/191 test ve 15 JavaScript sözdizimi kontrolü geçti. Fiyat motoru ve veritabanı şeması değiştirilmedi.

Kayıtlı teklif detayında h.karPct ödeme seçeneğinin kârını taşır; komisyonlu taksit kârına yanlışlıkla peşin deniyordu. Etiket kayıtlı komisyona göre düzeltilir; komisyon bilgisi belirsiz eski kayıtta nötr Kayıtlı kâr yazılır. Kayıtlı değerler değiştirilmez.

## v11.10.1: eksik ürün bilgileri başlığına tıklama

Canlı v11.10'da ayrı inceleme düğmesi çalışırken kart başlığı tıklanmıyordu; üst sürüm etiketi de aynı özellik adını taşıyordu. Kart artık Yönetim'de Aylık Veri Güncelleme'den önce görünür. Başlık, pencereyi açan gerçek bir düğmedir; klavye odağı, en az 44 px dokunma yüksekliği ve pencere ilişkisi vardır. Mevcut inceleme düğmesi de korunur. Üst sürüm etiketi yalnız tarih ve sürümü gösterir.

Yeni etkileşim testi iki düğmeye de gerçek DOM tıklamasıyla pencerenin açılmasını, tek yükleme yapılmasını, sonucun gelmesini, kapatılmasını ve satış sepetinin korunmasını denetler. Telefon görünümü ayrıca doğrulanmış sayılmaz.

## v11.10: yönetimde eksik ürün bilgileri

Yönetim → Eksik ürün bilgileri, seçili markanın mağaza veya dış bayi fiyat listesini kontrol eder. Her kaynağın en son toptan dönemi esas alınır; toptan dönem bulunamazsa satış ekranındaki gibi içinde bulunulan ay kullanılır. Diğer kaynak ya da eski dönem fiyatları eksik maliyeti doldurmaz. Liste maliyeti BİP öncesidir; peşin perakende nakit_fiyat alanıdır. Maliyet ve perakende için boş, sıfır, negatif veya geçersiz değerler; katalog adı için boş veya yalnız model kodundan oluşan adlar işaretlenir. BİP bulunmaması eksik sayılmaz.

İlk açılış güncel toptan/perakende listelerindeki ürünleri gösterir. Kullanıcı işareti kaldırınca fiyatı olmayan eski katalog ürünlerini de dahil edebilir. Katalog adı boşken satış ekranı stok kaydındaki adı gösterebilir; yeni panel stok verisini okumaz. Ürün kodu/adı araması ve eksik türü filtresi vardır. Özet sayıları ürün kapsamı ve aramaya aittir; eksik türleri aynı üründe birleşebilir. Sonuçlar 50 ürünlük sayfalarda gösterilir.

Mevcut RLS ve korunan profil kullanılır; admin ve aktif/deneme merkez editörü her iki markayı okuyabilir. Bayi ve şube hesaplarına panel açılmaz. Veri okumadan önce güncel profil doğrulanır. Katalog ve iki fiyat tablosu sıralı 500'lük sayfalarda okunur; toplam sayısı, eksik sayfa, mükerrer kod ve değişen dönem kontrol edilir. Hata durumunda kısmi sonuç veya yanlış “eksik yok” mesajı gösterilmez. Geç gelen sonuçlar kapatılmış, marka/kaynak/hesap değiştirilmiş pencereye yazılmaz. İçe aktarma, marka değişimi ve çıkış eski sonuçları temizler.

Yeni 10 test; fiyatı olmayan/perakende-only/katalog dışı ürünleri, kaynakların ayrı dönemlerini, 1.207 ürünün tam okunmasını, arama ve sayfalama, güvenli metin gösterimi, erişim ve güncel profil kontrolleri, hata/eksik sayfa/değişen sayı/mükerrer kod, geciken yanıtlar ve fiyat döneminin değişmesini kapsar. Mevcut satış sepeti ve hesapları korunur. Panel yalnız okur; ürün/fiyat değiştirmez, satış engeli eklemez. Yeni tablo, RPC, migration veya yetki değişikliği yoktur.

v11.9.3 mobil satış görünümünü kullanıcı 11 Eylül 2026'da “çalıştı güzel” diyerek kabul etti. Bu kabul yeni yönetim penceresinin fiziksel telefon testi yerine geçmez. Ayrı bayi hesabında canlı teklif kaydetme/yeniden açma denemesi açık kalır.
