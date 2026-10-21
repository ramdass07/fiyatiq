const {test}=require('node:test'),assert=require('node:assert/strict');
const H=require('../js/hakedis-core.js');
const FX=require('./fixtures/hakedis-sentetik.json');
// Hakediş mutabakatı çekirdeği — UYDURMA veriyle Python referansına (hakedis_kontrol.py) birebir uyum.
// Gerçek Eylül/Ekim 2026 dosyalarıyla golden test repo DIŞINDA koşar (müşteri verisi içerdiği için).

const MAGAZA_ANAHTAR=[["TSTSUBE2","TEST SUBE IKI"],["TSTMRKZ","TEST MERKEZ"]];
function calistir(){
  const g={divaKampanya:[],divaFatura:[],bshDetay:[],oranlar:[]}, ad=f=>FX.dosyalar.find(x=>x.dosyaAdi===f);
  for(const liste of Object.values(FX.dosyaSirasi)) for(const f of liste){ const s=ad(f).sayfalar, t=H.dosyaTuru(s);
    if(t==='DIVA_KAMPANYA')g.divaKampanya.push({dosyaAdi:f,satirlar:H.tabloOku(s[0].aoa).satirlar});
    else if(t==='DIVA_FATURA')g.divaFatura.push({dosyaAdi:f,satirlar:H.tabloOku(s[0].aoa).satirlar});
    else if(t==='BSH_DETAY')g.bshDetay.push({dosyaAdi:f,sayfalar:s.map(x=>({ad:x.ad,satirlar:H.tabloOku(x.aoa,H.kolonTemizle).satirlar}))});
    else if(t==='FIYAT_FARK')g.oranlar.push(...H.fiyatFarkOku({dosyaAdi:f,sayfalar:s})); }
  const sayfa=n=>H.tabloOku(FX.tanimlar.find(x=>x.ad===n).aoa).satirlar;
  return H.hesapla({marka:'BOSCH',milat:202609,bugun:'2026-10-21',...g,paketler:sayfa('PAKETLER'),ekOranlar:sayfa('EK_ORANLAR'),
    subeler:MAGAZA_ANAHTAR.map(([anahtar,magaza],i)=>({anahtar,magaza,oncelik:i})),eskiItirazlar:[]});
}
const sonuc=calistir(), B=FX.beklenen;
function ayni(a,b,ad){ const bosMu=v=>v===null||v===undefined||v==='';
  if(bosMu(a)&&bosMu(b))return; if(typeof a==='number'||typeof b==='number')return assert.ok(Math.abs(+a-+b)<=0.006,`${ad}: ${a} ≠ ${b}`);
  if(typeof a==='boolean'||typeof b==='boolean')return assert.equal(!!a,!!b,ad); assert.equal(String(a),String(b),ad); }

test('file types are recognised from their headers, not their names',()=>{
  for(const [tur,liste] of Object.entries(FX.dosyaSirasi)) for(const f of liste) assert.equal(H.dosyaTuru(FX.dosyalar.find(x=>x.dosyaAdi===f).sayfalar),tur,f);
});
test('price-difference table keeps every dated version and skips the TÜMÜ sheet',()=>{
  assert.deepEqual(sonuc.oranlar.map(o=>[o.AY,o['TİP'],o.KOD,H.pyRound(o.ORAN,2),o['BAŞLANGIÇ']].join('|')).sort(),B.oranlar);
  assert.ok(!sonuc.oranlar.some(o=>o.ORAN===9999),'TÜMÜ sayfası okunmamalı');
});
test('expected entitlement per Diva row matches Python (rate by invoice date, bundle split, KEA limit, milat, excluded)',()=>{
  assert.equal(sonuc.d.length,B.d.length,'başka marka satırı ve mükerrer satır elenir');
  B.d.forEach((p,i)=>{ for(const k of Object.keys(p)) ayni(sonuc.d[i][k],p[k],`d[${i}] ${p['FATURA NO']} ${k}`); });
});
test('BSH comparison matches Python row by row (TAM, EKSİK, ÖDENMEDİ, SARKAN, değişen fatura no, name similarity)',()=>{
  assert.equal(sonuc.kontrol.length,B.kontrol.length);
  B.kontrol.forEach((p,i)=>{ for(const k of Object.keys(p)) ayni(sonuc.kontrol[i][k],p[k],`kontrol[${i}] ${p['FATURA NO']} ${k}`); });
  const s=sonuc.kontrol.map(r=>r['SONUÇ']);
  for(const beklenen of ['TAM','EKSİK ÖDENDİ','ÖDENMEDİ — EYLÜL 2026 HAKEDİŞİNDE YOK','SARKAN — EKİM 2026 HAKEDİŞİ HENÜZ GELMEDİ','MİLAT ÖNCESİ — BSH ÖDEDİ','KAPSAM DIŞI'])
    assert.ok(s.includes(beklenen),beklenen);
});
test('a forward-delivery document is matched to its real invoice and is never an objection item',()=>{
  const r=sonuc.kontrol.find(x=>x['FATURA NO']==='9100000006'); assert.equal(r['GERÇEK FATURA NO'],'9100000020'); assert.equal(r['SONUÇ'],'TAM');
  const f=sonuc.kontrol.find(x=>x['FATURA NO']==='9100000007'); assert.match(f['SONUÇ'],/^SARKAN — İLERİ TESLİM, FATURA RAPORUNDA 20\.10\.2026/);
  assert.ok(!sonuc.kayip.some(k=>k['FATURA NO']==='9100000007'));
});
test('bundle is compared on the whole set because BSH does not split it equally',()=>{
  const set=sonuc.kontrol.filter(x=>x['FATURA NO']==='9100000004');
  assert.deepEqual(set.map(x=>x['SONUÇ']),['TAM','TAM']); assert.equal(set[1]['AÇIK (BEKLENEN − ÖDENEN)'],0);
  assert.ok(sonuc.d.filter(x=>x['FATURA NO']==='9100000005').every(x=>x.UYARI.includes('EKSİK SET')));
});
test('objection items, unmatched BSH rows, forward deliveries and new packages match Python',()=>{
  assert.equal(sonuc.kayip.length,B.kayip.length);
  B.kayip.forEach((p,i)=>{ for(const k of Object.keys(p)) ayni(sonuc.kayip[i][k],p[k],`kayıp[${i}] ${k}`); });
  assert.deepEqual(sonuc.bshFazla.map(b=>b['FATURA NO']).sort(),B.bsh_fazla.map(b=>b['FATURA NO']).sort());
  assert.equal(sonuc.ileri.length,B.ileri.length);
  B.ileri.forEach((p,i)=>{ for(const k of Object.keys(p)) ayni(sonuc.ileri[i][k],p[k],`ileri[${i}] ${k}`); });
  assert.deepEqual(sonuc.yeniPaketler.map(p=>p['PAKET ADI']),B.yeni_paketler);
  assert.deepEqual(Object.fromEntries(sonuc.kapsam),B.kapsam);
  assert.deepEqual(Object.fromEntries([...sonuc.bayi].map(([k,v])=>[k,v])),B.bayi_kodlari);
});
test('a refund on the invoice report is flagged on the campaign row',()=>{
  assert.match(sonuc.d.find(x=>x['FATURA NO']==='9100000014').UYARI,/İADE var/);
});
test('Python-compatible helpers: banker-style round, difflib ratio, Turkish normalisation, Excel serial dates',()=>{
  for(const [x,y] of FX.python.round2) assert.equal(H.pyRound(x,2),y,`round(${x})`);
  for(const [a,b,r] of FX.python.difflib) assert.ok(Math.abs(H.oranBenzerlik(a,b)-r)<1e-12,`${a} ~ ${b}`);
  assert.equal(H.norm('Şehre Dönüş — İçecek ılık'),'SEHRE DONUS ICECEK ILIK');
  assert.equal(H.tarih(46295),'2026-09-30'); assert.equal(H.tarih(46295.99),'2026-09-30'); assert.equal(H.tarih('03.09.2026'),'2026-09-03');
  assert.equal(H.tarih('31.02.2026'),null); assert.equal(H.fno(9100000920),'9100000920'); assert.equal(H.fno('9100000920.0'),'9100000920');
  assert.equal(H.kampanyaAyi('Eylül-Tekil Soğutucu Kampanyası-202609',null),202609); assert.equal(H.kampanyaAyi('Blender -202609-02',null),202609);
});
test('the BSH objection form keeps the 20-column template, merged headers and no amount column',()=>{
  const f=H.itirazFormuAoa(sonuc.kayip.filter(k=>k.DURUM==='İTİRAZ'));
  assert.equal(f.aoa[1].length,20); assert.deepEqual(f.aoa[1],H.FORM_BASLIK); assert.deepEqual(f.merges,['O1:P1','Q1:T1']);
  const satir=f.aoa[2]; assert.deepEqual(satir.slice(0,3),['TRBM','TM1','000TRRBM13']); assert.equal(satir[13],'Kampanya Adı Yansımamış');
  assert.equal(typeof satir[6],'number','fatura no sayı olarak yazılır');
  assert.ok(!f.aoa.flat().some(v=>typeof v==='number'&&v===1234.5),'formda tutar yok');
});
