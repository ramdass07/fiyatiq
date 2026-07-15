// Vercel Serverless Function — Kampanya Sihirbazı beyni (Claude Opus)
// API anahtarı SUNUCUDA gizli: process.env.ANTHROPIC_API_KEY (Vercel > Settings > Environment Variables)
// İstek: POST { marka: "bosch"|"siemens", donem: "2026-07-01", metin: "<PDF/Excel'den çıkarılan ham metin>" }
// Yanıt: { kampanyalar: [ {ad, marka, kategoriler, match_type, secili_modeller, musteri_indirimi, hakedis, kota, bitis_tarihi, kurallar} ] }

const SEMA = `Çıktı SADECE geçerli JSON olacak, başka hiçbir metin/açıklama yok. Şu biçimde bir nesne döndür:
{"kampanyalar":[{
  "ad": "kampanyanın kısa adı",
  "kategoriler": ["BUZDOLABI","CAMASIR"],            // aşağıdaki sözlükten; boş olabilir
  "match_type": "any2",                                 // aşağıdaki türlerden biri
  "secili_modeller": ["HBF514BB0T"],                  // metinde geçen ürün kodları; yoksa []
  "musteri_indirimi": 5000,                             // müşteriye TL indirim (sayı; yoksa 0)
  "hakedis": 4000,                                       // bayiye iade/hakediş TL (sayı; metinde yoksa 0)
  "kota": 4000,                                          // varsa; yoksa 0
  "bitis_tarihi": "2026-07-15",                        // YYYY-MM-DD; bulamazsan null
  "kurallar": "birleşme/koşul cümlesini metinden AYNEN al"
}]}

KATEGORI SÖZLÜĞÜ (sadece bunları kullan): BUZDOLABI, DERINDONDURUCU, CAMASIR, KURUTMA, BULASIK, KLIMA, FIRIN, OCAK, DAVLUMBAZ, MIKRODALGA, SUPURGE, KEA, ANKASTRE.

MATCH_TYPE anlamları:
- "any2": belirtilen kategori havuzundan EN AZ 2 FARKLI kategoriden ürün (ör. "2'li beyaz eşya"). kategoriler = havuz.
- "all": belirtilen kategorilerin HEPSİ sepette olmalı (ör. Fırın+Ocak+Davlumbaz ankastre seti).
- "all+any": ilk kategori kesin, kalanlardan en az biri.
- "xl+xxl": XL/XXL buzdolabı kampanyası (secili_modeller = XL/XXL model listesi).
- "model_list": sadece secili_modeller listesindeki ürünler.
- "tumu": koşulsuz.

KURALLAR: "diğer bundle kampanyalarla birleştirilemez", "tekil kampanyalarla birleştirilebilir", "hiçbir ankastre kampanya birleştirilemez" gibi BİRLEŞME cümlelerini metinden aynen çıkar. Bu alan çok önemli — atlanmamalı.

Aynı belgede birden çok kampanya olabilir; her birini ayrı nesne yap. Emin olamadığın sayısal alanı 0, tarihi null bırak; uydurma.`;

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
Aşağıda bir BSH (Bosch/Siemens) kampanya belgesinin (broşür PDF, uygulama yazısı ve/veya Excel) ham metni var. İçindeki TÜM kampanyaları yukarıdaki şemaya göre çıkar. Her kampanyanın "marka" alanını "${marka}" yap.

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
    // JSON'u ayıkla (bazen ```json ... ``` sarmalıyla gelir)
    const m = txt.match(/\{[\s\S]*\}/);
    let parsed = null;
    try { parsed = JSON.parse(m ? m[0] : txt); } catch (e) { res.status(502).json({ error: 'Model JSON döndürmedi', ham: txt.slice(0, 1500) }); return; }
    const list = Array.isArray(parsed) ? parsed : (parsed.kampanyalar || []);
    // normalize + marka'yı zorla
    const out = list.map(k => ({
      ad: (k.ad || '').toString().trim(),
      marka: marka || (k.marka || '').toString().toLowerCase(),
      kategoriler: Array.isArray(k.kategoriler) ? k.kategoriler : (k.kategoriler ? String(k.kategoriler).split(/[\/,]/).map(s => s.trim()).filter(Boolean) : []),
      match_type: (k.match_type || 'all').toString().trim(),
      secili_modeller: Array.isArray(k.secili_modeller) ? k.secili_modeller.map(s => String(s).trim().toUpperCase()).filter(Boolean) : (k.secili_modeller ? String(k.secili_modeller).split(/[,\n]/).map(s => s.trim().toUpperCase()).filter(Boolean) : []),
      musteri_indirimi: +k.musteri_indirimi || 0,
      hakedis: +k.hakedis || 0,
      kota: +k.kota || 0,
      bitis_tarihi: k.bitis_tarihi || null,
      kurallar: (k.kurallar || '').toString().trim()
    })).filter(k => k.ad);
    res.status(200).json({ kampanyalar: out, adet: out.length });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + (e && e.message) });
  }
};
