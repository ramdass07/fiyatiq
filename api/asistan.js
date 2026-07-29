// Vercel Serverless Function — FiyatIQ Satış Asistanı (Claude)
// Görevi: Mağaza personelinin doğal dille sorduğu soruya, SADECE stoktaki ürünler
//         ve gerçek fiyatlar üzerinden cevap vermek.
// API anahtarı SUNUCUDA gizli: process.env.ANTHROPIC_API_KEY
// İstek : POST { marka, soru, gecmis:[{rol,metin}], urunler:[{k,ad,adet,pesin,toptan}] }
// Cevap : { cevap: "..." }

const SEMA = `Sen FiyatIQ'nun satış asistanısın. Bir Bosch/Siemens yetkili satıcısının mağaza personeline yardım ediyorsun.

NASIL CEVAP VERİRSİN:
- Kısa, net, sohbet dilinde. Madde madde gerekiyorsa en fazla 3-5 ürün öner.
- Her öneride: model kodu, ürün adı, peşin fiyat (TL) ve stok adedi.
- SADECE aşağıdaki "STOKTAKİ ÜRÜNLER" listesinden ürün öner. Listede olmayan model kodu YAZMA, uydurma.
- Bütçe verilmişse bütçeyi aşan ürünü önce yazma; yakınsa "biraz üstünde ama..." diye belirt.
- Uygun ürün yoksa dürüstçe söyle ve en yakın alternatifi öner.
- Fiyatları listedeki gibi ver, kendin indirim/artış hesaplama. İskonto kararı satıcınındır.
- TOPTAN (bayi maliyeti) bilgisini müşteriye söylenecek bir şey gibi sunma; sadece personel sorarsa kâr marjı yorumunda kullan.
- Türkçe konuş. Emoji kullanma.
- Kesin olmadığın teknik özelliği (enerji sınıfı, litre, devir) uydurma; ürün adında yazmıyorsa "kataloğa bakman gerek" de.

ÜRÜN LİSTESİ ALANLARI: k=model kodu, ad=ürün adı, adet=net satılabilir stok, pesin=peşin perakende fiyat (TL), toptan=bayi maliyeti (TL).`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Sadece POST' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: 'Sunucuda ANTHROPIC_API_KEY tanımlı değil. Vercel > Settings > Environment Variables ekleyin.' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const marka = (body && body.marka) || '';
  const soru = ((body && body.soru) || '').toString().trim();
  const gecmis = Array.isArray(body && body.gecmis) ? body.gecmis.slice(-10) : [];
  const urunler = Array.isArray(body && body.urunler) ? body.urunler.slice(0, 1200) : [];
  if (!soru) { res.status(400).json({ error: 'Soru boş geldi.' }); return; }

  const katalog = urunler.map(u =>
    `${u.k}|${(u.ad || '').toString().slice(0, 60)}|${u.adet || 0}|${u.pesin || 0}|${u.toptan || 0}`
  ).join('\n');

  const sistem = `${SEMA}

## STOKTAKİ ÜRÜNLER (marka: ${marka || 'bilinmiyor'})
Biçim: kod|ad|adet|pesin|toptan
${katalog || '(liste boş geldi — stok verisi yüklenmemiş olabilir, kullanıcıya bunu söyle)'}`;

  const messages = gecmis
    .filter(g => g && g.metin)
    .map(g => ({ role: g.rol === 'asistan' ? 'assistant' : 'user', content: String(g.metin).slice(0, 4000) }));
  messages.push({ role: 'user', content: soru.slice(0, 4000) });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1500,
        system: sistem,
        messages
      })
    });
    const data = await r.json();
    if (!r.ok || data.error) { res.status(502).json({ error: (data.error && data.error.message) || ('Anthropic API hatası (' + r.status + ')') }); return; }
    const cevap = (data.content && data.content[0] && data.content[0].text) || '';
    res.status(200).json({ cevap });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + (e && e.message) });
  }
};
