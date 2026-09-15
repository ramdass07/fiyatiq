const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

const ILERI=new Date(Date.now()+3600e3).toISOString();   // 1 saat sonra (aktif rezerve)
const GECMIS=new Date(Date.now()-3600e3).toISOString();  // 1 saat önce (süresi dolmuş)
const fresh=rows=>`stockFreshnessFromRows(${JSON.stringify(rows)})`;
const ozet=(h,hareket,stok)=>JSON.parse(h.run(`JSON.stringify(fqHareketOzet(${JSON.stringify(hareket)},${fresh(stok)}))`));

test('fqHareketOzet: satış düşümü fotoğraf tarihinden itibaren sayılır, eskisi dosyada erimiştir',async t=>{
 const h=harness(t);
 const stok=[{depo:'mars',tip:'mevcut',adet:5,stok_tarihi:'2026-09-14'}];
 const hareket=[
  {depo:'mars',tip:'satis',adet:1,created_at:'2026-09-14T10:00:00Z'},  // fotoğraf günü → sayılır
  {depo:'mars',tip:'satis',adet:2,created_at:'2026-09-13T10:00:00Z'},  // fotoğraftan önce → dosyada erimiş, sayılmaz
  {depo:'horoz',tip:'satis',adet:3,created_at:'2026-09-01T10:00:00Z'}  // horoz fotoğrafı yok → hepsi sayılır
 ];
 const o=ozet(h,hareket,stok);
 assert.equal(o.mars.satis,1);assert.equal(o.horoz.satis,3);assert.equal(o.toplamSatis,4);
});

test('fqHareketOzet: süresi dolan rezerve kendiliğinden serbest kalır',async t=>{
 const h=harness(t);
 const hareket=[
  {depo:'kadikoy',tip:'rezerve',adet:2,rezerve_bitis:ILERI,created_at:'2026-09-14T09:00:00Z'},
  {depo:'kadikoy',tip:'rezerve',adet:5,rezerve_bitis:GECMIS,created_at:'2026-09-10T09:00:00Z'}
 ];
 const o=ozet(h,hareket,[]);
 assert.equal(o.kadikoy.rezerve,2);assert.equal(o.toplamRezerve,2);
});

test('fqStokRozet: SON X ADET yalnız 1-2 nette, rezerve rozeti aktif rezervede çıkar',async t=>{
 const h=harness(t);
 const rozet=r=>h.run(`fqStokRozet(${JSON.stringify(r)})`);
 assert.match(rozet({kod:'X',netStok:2,rezerveAdet:0}),/SON 2 ADET/);
 assert.match(rozet({kod:'X',netStok:1,rezerveAdet:0}),/SON 1 ADET/);
 assert.doesNotMatch(rozet({kod:'X',netStok:3,rezerveAdet:0}),/SON/);
 assert.doesNotMatch(rozet({kod:'X',netStok:0,rezerveAdet:0}),/SON/); // 0 için mevcut KAYITLARDA STOK YOK uyarısı var
 assert.match(rozet({kod:'X',netStok:5,rezerveAdet:2}),/2 REZERVE/);
 assert.equal(rozet({kod:'',netStok:1,rezerveAdet:1}),'');
});

test('Satıldı kaydından sonra stok düşüm penceresi teklif ürünleriyle açılır',async t=>{
 const h=harness(t);
 h.respond({data:[{depo:'mars',tip:'mevcut',adet:4,stok_tarihi:'2026-09-14'}],error:null});
 await h.run(`fqStokTakipHook({durum:'teklif'},{id:'q1',durum:'satildi',marka:'bosch',satirlar:{items:[{model:'WGB244A0TR',ad:'Çamaşır',adet:2}]}})`);
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.equal(h.run("$('fqStokSatisDialog').open"),true);
 assert.match(h.run("$('fqStokSatisList').innerHTML"),/WGB244A0TR/);
 assert.match(h.run("$('fqStokSatisList').innerHTML"),/×2/);
});

test('Satıldı geri alınınca bu teklifin düşümleri RPC ile serbest bırakılır',async t=>{
 const h=harness(t);
 h.run("sb.rpc=(name,args)=>{window.__rpc={name,args};return Promise.resolve({data:2,error:null});};window.__rpc=null;");
 await h.run(`fqStokTakipHook({durum:'satildi'},{id:'q9',durum:'kaybedildi',marka:'bosch',satirlar:{items:[]}})`);
 await new Promise(r=>setImmediate(r));
 const rpc=JSON.parse(h.run('JSON.stringify(window.__rpc)'));
 assert.equal(rpc.name,'fq_stok_satis_geri_al');assert.equal(rpc.args.p_teklif_id,'q9');
});

test('SQL kurulu değilse modül sessizce devre dışı: net stok düzeltilmez, hata yüzeye çıkmaz',async t=>{
 const h=harness(t);
 h.respond({data:null,error:{code:'42P01',message:'relation "stok_hareket" does not exist'}});
 const sonuc=JSON.parse(await h.run("(async()=>{const r={kod:'X',netStok:7,stockFreshness:{depots:[]}};const ok=await fqStokDuzelt(r,'X','bosch');return JSON.stringify({ok,net:r.netStok,rez:r.rezerveAdet});})()"));
 assert.equal(sonuc.ok,false);assert.equal(sonuc.net,7);assert.equal(sonuc.rez,0);
 assert.equal(h.run('fqStokM.tabloYok'),true); // bir kez öğrenir, her üründe tekrar sormaz
});
