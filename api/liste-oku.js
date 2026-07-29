// Vercel Serverless Function — AI Liste Okuyucu (Claude)
// Görevi: "Akıllı Tara"nın çözemediği DAĞINIK fiyat listelerini yapay zekâya okutmak.
// API anahtarı SUNUCUDA gizli: process.env.ANTHROPIC_API_KEY (Vercel > Settings > Environment Variables)
// İstek : POST { marka:"bosch"|"siemens", metin:"<Excel/PDF'ten çıkarılan ham metin>" }
// Cevap : { satirlar:[{model_kodu, toptan, perakende, bip}], not:"...", adet:N }

const SEMA = `Sen bir BSH (Bosch/Siemens) beyaz eşya fiyat listesi okuyucususun.
Sana ham, dağınık bir fiyat listesi metni verilecek (Excel ya da PDF'ten çıkarılmış, sütunlar "|" ile ayrılmış olabilir).
Görevin: her ürün satırından MODEL KODU ve fiyatları çıkarmak.

Çıktı SADECE geçerli JSON olacak, başka hiçbir metin/açıklama/markdown yok:
{"satirlar":[{"model_kodu":"KGN56XWE0N","toptan":42350.5,"perakende":58990,"bip":6120}],
 "not":"hangi sütunu neye eşledin, tek cümle"}

SÜTUN EŞLEME KURALLARI:
- "toptan": bayi alış / toptan / net fiyat / iskontolu fiyat / "5 AY (150 GÜN) GERİ DÖNÜŞLÜ FİYAT" gibi vadeli bayi fiyatları.
  Birden çok vade sütunu varsa (5 ay / 3 ay / 1 ay / opsiyonlu) EN UZUN VADELİ olanı (ör. 5 AY / 150 GÜN) al.
- "perakende": tavsiye edilen perakende satış fiyatı / TESF / peşin perakende / müşteri fiyatı (KDV dahil).
- "bip": BİP / birim iade primi / birim fiyat farkı / fark tutarı sütunu.
- Bir sütun yoksa o alanı 0 yaz. UYDURMA. Emin değilsen 0.

ÖNEMLİ:
- model_kodu: en az 5 karakter, harf+rakam karışık (ör. KGN56XWE0N, VB558C0S0, EO6C2PO92O, ASI12AW30). Başındaki/sonundaki boşluğu at, BÜYÜK HARFE çevir.
- Başlık satırları, boş satırlar, "TOPLAM", dipnot, KDV açıklaması, kategori başlığı gibi satırları ATLA.
- Sayılarda Türk formatı olabilir: "42.350,50" → 42350.50 ; "1.234" → 1234. Nokta binlik, virgül ondalık.
- Yüzde, adet, sıra no, hacim, koli içi gibi sütunları fiyat sanma. Fiyatlar genelde 1000'den büyüktür.
- Aynı model birden çok kez geçiyorsa bir kez yaz (en dolu satırı seç).
- Hiç ürün bulamazsan {"satirlar":[],"not":"neden bulunamadı"} döndür.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Sadece POST' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: 'Sunucuda ANTHROPIC_API_KEY tanımlı değil. Vercel > Settings > Environment Variables ekleyin.' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const marka = (body && body.marka) || '';
  const metin = (body && body.metin) || '';
  if (!metin || metin.length < 20) { res.status(400).json({ error: 'Liste metni boş/çok kısa geldi.' }); return; }

  const kullanici = `Marka: ${marka || 'bilinmiyor'}

===== HAM LİSTE METNİ =====
${metin.slice(0, 150000)}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 16000,
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

    const num = v => {
      if (v == null || v === '') return 0;
      if (typeof v === 'number') return isFinite(v) ? v : 0;
      let s = String(v).replace(/[^\d.,-]/g, '');
      if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
      else if (s.indexOf(',') > -1) s = s.replace(',', '.');
      const n = parseFloat(s);
      return isFinite(n) ? n : 0;
    };
    const seen = {};
    const out = (Array.isArray(parsed.satirlar) ? parsed.satirlar : []).map(s => ({
      model_kodu: String(s.model_kodu || '').trim().toUpperCase(),
      toptan: num(s.toptan),
      perakende: num(s.perakende),
      bip: num(s.bip)
    })).filter(s => {
      if (s.model_kodu.length < 5) return false;
      if (!/\d/.test(s.model_kodu) || !/[A-Z]/.test(s.model_kodu)) return false;
      if (s.toptan <= 0 && s.perakende <= 0 && s.bip <= 0) return false;
      if (seen[s.model_kodu]) return false;
      seen[s.model_kodu] = 1;
      return true;
    });
    res.status(200).json({ satirlar: out, not: (parsed.not || '').toString().slice(0, 300), adet: out.length });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + (e && e.message) });
  }
};
