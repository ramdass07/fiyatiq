// Vercel Serverless Function — Kampanya Sihirbazı beyni (Claude Opus) — v2
// v2: mail metni desteği — kampanya durumu (devam/bitti), hariç modeller ve FİYAT FARKI tablosu da çıkarılır.
// API anahtarı SUNUCUDA gizli: process.env.ANTHROPIC_API_KEY (Vercel > Settings > Environment Variables)
// İstek: POST { marka: "bosch"|"siemens", donem: "2026-07-01", metin: "<PDF/Excel/mail'den çıkarılan ham metin>" }

const SEMA = `Çıktı SADECE geçerli JSON olacak, başka hiçbir metin/açıklama yok. Şu biçimde bir nesne döndür:
{"kampanyalar":[{
  "ad": "kampanyanın kısa adı",
  "kategoriler": ["BUZDOLABI","CAMASIR"],            // aşağıdaki sözlükten; boş olabilir
  "match_type": "any2",                                 // aşağıdaki türlerden biri
  "secili_modeller": ["HBF514BB0T"],                  // kampanyaya DAHİL ürün kodları; yoksa []
  "haric_modeller": ["KG76NVWE0N"],                   // kampanyadan HARİÇ tutulan kodlar (ör. "XL/XXL dahil değildir" deniyor ve o modeller metinde listeliyse); yoksa []
  "durum": "devam",                                     // "devam" | "bitti" | "yeni". Metin kampanyanın BİTTİĞİNİ söylüyorsa "bitti".
  "musteri_indirimi": 5000,                             // müşteriye TL indirim (sayı; yoksa 0)
  "hakedis": 4000,                                       // bayiye iade/hakediş TL (sayı; metinde yoksa 0)
  "kota": 4000,                                          // varsa; yoksa 0
  "bitis_tarihi": "2026-07-15",                        // YYYY-MM-DD; bulamazsan null
  "kurallar": "birleşme/koşul cümlesini metinden AYNEN al"
}],
"fiyat_farklari":[{
  "model_kodu": "KG76NVWE0N",
  "yeni_perakende": 60140,                              // yeni Tavsiye Edilen Perakende Peşin fiyat (KDV dahil); yoksa 0
  "fark": 16480.14                                       // Birim Fiyat Farkı / BİP tutarı (metindeki değeri AYNEN, KDV çevirisi YAPMA); yoksa 0
}]}

KATEGORI SÖZLÜĞÜ (sadece bunları kullan): BUZDOLABI, DERINDONDURUCU, CAMASIR, KURUTMA, BULASIK, KLIMA, FIRIN, OCAK, DAVLUMBAZ, MIKRODALGA, SUPURGE, KEA, ANKASTRE.

MATCH_TYPE anlamları:
- "any2": belirtilen kategori havuzundan EN AZ 2 FARKLI kategoriden ürün (ör. "2'li beyaz eşya"). kategoriler = havuz.
- "all": belirtilen kategorilerin HEPSİ sepette olmalı (ör. Fırın+Ocak+Davlumbaz ankastre seti).
- "all+any": ilk kategori kesin, kalanlardan en az biri.
- "xl+xxl": XL/XXL buzdolabı kampanyası (secili_modeller = XL/XXL model listesi).
- "model_list": sadece secili_modeller listesindeki ürünler.
- "tumu": koşulsuz.

ÖNEMLİ KURALLAR:
- Belge bir MAİL metni olabilir: "X kampanyası bitirilmiştir" → o kampanyayı durum:"bitti" ile listele.
- "2'li kampanyaya XL/XXL dahil olmayacaktır" gibi ifadelerde, metinde XL/XXL model kodları listeliyse bunları o kampanyanın haric_modeller alanına yaz.
- Fiyat farkı / BİP / birim fark tabloları varsa HER modeli fiyat_farklari listesine yaz. Sayıları metindeki gibi al, KDV ekleme/çıkarma YAPMA.
- KURALLAR: "diğer bundle kampanyalarla birleştirilemez", "tekil kampanyalarla birleştirilebilir" gibi BİRLEŞME cümlelerini metinden aynen çıkar. Bu alan çok önemli — atlanmamalı.
- Aynı belgede birden çok kampanya olabilir; her birini ayrı nesne yap. Emin olamadığın sayısal alanı 0, tarihi null bırak; uydurma.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Sadece POST' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: 'Sunucuda ANTHROPIC_API_KEY tanımlı değil. Vercel > Settings > Environment Variables ekleyin.' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const marka = (body && body.marka) || '';
  const metin = (body && body.metin) || '';
  if (!metin || metin.length < 20) { res.status(400).json({ error: 'Belge metni boş/çok kısa geldi.' }); return; }

  const kullanici = `Marka: ${marka || 'bilinmiyor'}
Aşağıda bir BSH (Bosch/Siemens) kampanya belgesinin (broşür PDF, uygulama yazısı, Excel ve/veya MAİL metni) ham metni var. İçindeki TÜM kampanyaları ve varsa FİYAT FARKI tablolarını yukarıdaki şemaya göre çıkar. Her kampanyanın "marka" alanını "${marka}" yap.

===== BELGE METNİ =====
${metin.slice(0, 120000)}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        system: SEMA,
        messages: [{ role: 'user', content: kullanici }]
      })
    });
    const data = await r.json();
    if (!r.ok || data.error) { res.status(502).json({ error: (data.error && data.error.message) || ('Anthropic API hatası (' + r.status + ')') }); return; }
    let txt = (data.content && data.content[0] && data.content[0].text) || '';
    const m = txt.match(/\{[\s\S]*\}/);
    let parsed = null;
    try { parsed = JSON.parse(m ? m[0] : txt); } catch (e) { res.status(502).json({ error: 'Model JSON döndürmedi', ham: txt.slice(0, 1500) }); return; }
    const list = Array.isArray(parsed) ? parsed : (parsed.kampanyalar || []);
    const toArr = v => Array.isArray(v) ? v : (v ? String(v).split(/[,\n]/).map(s => s.trim()).filter(Boolean) : []);
    const out = list.map(k => ({
      ad: (k.ad || '').toString().trim(),
      marka: marka || (k.marka || '').toString().toLowerCase(),
      kategoriler: toArr(k.kategoriler).map(s => String(s).trim()).filter(Boolean),
      match_type: (k.match_type || 'all').toString().trim(),
      secili_modeller: toArr(k.secili_modeller).map(s => String(s).trim().toUpperCase()).filter(Boolean),
      haric_modeller: toArr(k.haric_modeller).map(s => String(s).trim().toUpperCase()).filter(Boolean),
      durum: (['devam','bitti','yeni'].includes((k.durum || '').toString().trim()) ? k.durum.toString().trim() : 'yeni'),
      musteri_indirimi: +k.musteri_indirimi || 0,
      hakedis: +k.hakedis || 0,
      kota: +k.kota || 0,
      bitis_tarihi: k.bitis_tarihi || null,
      kurallar: (k.kurallar || '').toString().trim()
    })).filter(k => k.ad);
    const farklar = (Array.isArray(parsed.fiyat_farklari) ? parsed.fiyat_farklari : []).map(f => ({
      model_kodu: (f.model_kodu || '').toString().trim().toUpperCase(),
      yeni_perakende: +f.yeni_perakende || 0,
      fark: +f.fark || 0
    })).filter(f => f.model_kodu);
    res.status(200).json({ kampanyalar: out, fiyat_farklari: farklar, adet: out.length });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + (e && e.message) });
  }
};