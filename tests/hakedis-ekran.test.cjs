const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const {harness}=require('./harness.cjs');
const H=require('../js/hakedis-core.js');
const FX=require('./fixtures/hakedis-sentetik.json');
// v11.22 Hakediş mutabakatı ekranı (yalnız admin). UYDURMA veri; veritabanı bellekte taklit edilir.

const root=path.join(__dirname,'..');
// --- SheetJS taklidi: read(), dosya adını taşıyan tampondan fixture sayfalarını döndürür
function xlsxTaklit(){
  const indirilen=[];
  const enc=({r,c})=>{ let s='',n=c+1; while(n){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s+(r+1); };
  const dec=a=>{ const m=String(a).match(/^([A-Z]+)(\d+)$/); let c=0; for(const ch of m[1])c=c*26+ch.charCodeAt(0)-64; return {r:+m[2]-1,c:c-1}; };
  return {indirilen,lib:{
    read(buf){ const ad=Buffer.from(buf).toString('utf8'), f=FX.dosyalar.find(x=>x.dosyaAdi===ad)||{sayfalar:FX.tanimlar}; const Sheets={};
      for(const s of f.sayfalar)Sheets[s.ad]={__aoa:s.aoa}; return {SheetNames:f.sayfalar.map(s=>s.ad),Sheets}; },
    writeFile(wb,ad){ indirilen.push({wb,ad}); },
    utils:{ sheet_to_json:ws=>ws.__aoa.map(r=>r.slice()), encode_cell:enc, decode_range:s=>{ const [a,b]=String(s).split(':'); return {s:dec(a),e:dec(b||a)}; },
      encode_range:x=>enc(x.s)+':'+enc(x.e), book_new:()=>({SheetNames:[],Sheets:{}}), book_append_sheet:(wb,ws,ad)=>{ wb.SheetNames.push(ad); wb.Sheets[ad]=ws; },
      aoa_to_sheet(aoa){ const ws={}; let mc=0; aoa.forEach((r,R)=>{ mc=Math.max(mc,r.length); r.forEach((v,C)=>{ if(v===null||v===undefined)return; ws[enc({r:R,c:C})]={v,t:typeof v==='number'?'n':'s'}; }); });
        ws['!ref']=enc({r:0,c:0})+':'+enc({r:Math.max(aoa.length-1,0),c:Math.max(mc-1,0)}); return ws; } }}};
}
// --- Supabase taklidi: tablolar bellekte, eq/order/range uygulanır, rpc fq_hakedis_yukle'yi taklit eder
function dbTaklit(){
  const T={hakedis_yukleme:[],hakedis_satir:[],hakedis_paket:[],hakedis_oran_ek:[],hakedis_sube:[],hakedis_ayar:[],hakedis_bsh_fatura:[],hakedis_itiraz:[]}, log=[]; let id=0;
  const yeniId=()=>'00000000-0000-4000-8000-'+String(++id).padStart(12,'0');
  function from(t){ const f=[]; let ord=null, rng=null, op='select', yuk=null, ops={};
    const q={select(){return q;},eq(k,v){f.push([k,v]);return q;},order(k){ord=k;return q;},range(a,b){rng=[a,b];return q;},
      update(v){op='update';yuk=v;return q;},upsert(v,o){op='upsert';yuk=v;ops=o||{};return q;},insert(v){op='insert';yuk=v;return q;},delete(){op='delete';return q;},
      then(ok,no){ return Promise.resolve(calis()).then(ok,no); }};
    function calis(){ log.push({t,op,yuk,ops,f:f.slice()}); const uy=r=>f.every(([k,v])=>r[k]===v);
      if(op==='select'){ let r=T[t].filter(uy); if(ord)r=r.slice().sort((a,b)=>a[ord]<b[ord]?-1:a[ord]>b[ord]?1:0); if(rng)r=r.slice(rng[0],rng[1]+1); return {data:JSON.parse(JSON.stringify(r)),error:null}; }
      if(op==='update'){ T[t].filter(uy).forEach(r=>Object.assign(r,yuk)); return {data:null,error:null}; }
      if(op==='delete'){ T[t]=T[t].filter(r=>!uy(r)); return {data:null,error:null}; }
      const anah=(ops.onConflict||'').split(',').filter(k=>k&&k!=='isletme_id');
      for(const r of [].concat(yuk)){ const var_=anah.length&&T[t].find(x=>anah.every(k=>x[k]===r[k]));
        if(var_){ if(!ops.ignoreDuplicates)Object.assign(var_,r); } else T[t].push({id:yeniId(),...JSON.parse(JSON.stringify(r))}); }
      return {data:null,error:null}; }
    return q; }
  async function rpc(ad,p){ log.push({rpc:ad,p});
    if(ad==='fq_hakedis_yukle'){ if(T.hakedis_yukleme.some(y=>y.dosya_hash===p.p_hash))return {data:{durum:'ayni_dosya'},error:null};
      const y={id:yeniId(),tur:p.p_tur,marka:p.p_marka,dosya_adi:p.p_dosya_adi,dosya_hash:p.p_hash,sube_kodu:p.p_kapsam.sube_kodu||null,kapsam_bas:p.p_kapsam.bas||null,kapsam_bit:p.p_kapsam.bit||null,
        donemler:p.p_kapsam.donemler||[],satir_sayisi:p.p_satirlar.length,aktif:true,created_at:new Date(Date.UTC(2026,9,21,8,0,id)).toISOString()};
      T.hakedis_yukleme.push(y); for(const s of JSON.parse(JSON.stringify(p.p_satirlar)))T.hakedis_satir.push({yukleme_id:y.id,...s});
      return {data:{durum:'yuklendi',yukleme_id:y.id,satir:p.p_satirlar.length,pasiflesen:0},error:null}; }
    if(ad==='fq_hakedis_yukleme_durum'){ const y=T.hakedis_yukleme.find(x=>x.id===p.p_id); y.aktif=p.p_aktif; y.pasif_nedeni=p.p_aktif?null:'elle'; return {data:true,error:null}; }
    return {data:null,error:{message:'yok'}}; }
  return {T,log,sb:{from,rpc}};
}
function kur(t,rol='admin'){
  const h=harness(t), x=xlsxTaklit(), db=dbTaklit();
  if(!h.w.crypto||!h.w.crypto.subtle)Object.defineProperty(h.w,'crypto',{value:webcrypto,configurable:true});
  h.w.XLSX=x.lib; h.w.__db=db.sb; h.w.TextEncoder=TextEncoder;
  h.run(fs.readFileSync(path.join(root,'js/hakedis-core.js'),'utf8'));
  h.run(fs.readFileSync(path.join(root,'js/hakedis-ekran.js'),'utf8'));
  h.run(`sb=__db;profil.rol='${rol}';`);
  h.w.confirm=()=>{ throw new Error('confirm() kullanılmamalı — panel içi onay olmalı'); };
  const dosya=ad=>new TextEncoder().encode(ad).buffer;
  return {...h,x,db,dosya};
}
// panel içi onay penceresini bekleyip seçer (v11.23: confirm() yok)
async function onayla(k,ifade,secim='1'){
  const p=k.run(ifade); let d=null;
  for(let i=0;i<200&&!(d=k.w.document.getElementById('hkmOnay'));i++) await new Promise(r=>setImmediate(r));
  assert.ok(d,'panel içi onay penceresi açılmalı'); const metin=d.textContent; d.querySelector(`button[data-c="${secim}"]`).click(); await p; return metin;
}
const tumDosyalar=()=>Object.values(FX.dosyaSirasi).flat();

test('the Hakediş card is in Yönetim, hidden by default and shown only to the admin',async t=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/<div class="card" id="hakedisCard" style="display:none;/);
  assert.match(html,/const hk=\$\("hakedisCard"\); if\(hk\) hk\.style\.display=profil\.rol==="admin"\?"":"none";/);
  assert.ok(html.indexOf('js/hakedis-core.js')<html.indexOf('js/hakedis-ekran.js'));
  const k=kur(t,'personel'); let uyari=''; k.w.alert=m=>{uyari=m;};
  await k.run('hkmAc()'); assert.match(uyari,/yalnız yönetici/); assert.equal(k.w.document.getElementById('hkmPanel'),null);
  assert.equal(k.db.log.length,0,'yetkisiz kullanıcı için veritabanı okunmaz');
});

test('dropped files are recognised, hashed and sent once; a re-upload of the same file is reported, not duplicated',async t=>{
  const k=kur(t); await k.run('hkmAc()');
  for(const ad of tumDosyalar()) k.run('fqHkm.hazir').push(await k.run(`hkmDosyaHazirla(${JSON.stringify(ad)},new TextEncoder().encode(${JSON.stringify(ad)}).buffer)`));
  const hazir=k.run('fqHkm.hazir');
  assert.deepEqual([...hazir].map(h=>h.tur),tumDosyalar().map(ad=>Object.entries(FX.dosyaSirasi).find(([,l])=>l.includes(ad))[0]));
  assert.ok(hazir.every(h=>/^[0-9a-f]{64}$/.test(h.hash)));
  const sube=[...hazir].filter(h=>h.tur==='DIVA_FATURA').map(h=>h.kapsam.sube_kodu).sort(); assert.deepEqual(sube,['TSTMRKZ','TSTSUBE2']);
  const bsh=hazir.find(h=>h.tur==='BSH_DETAY'); assert.ok(bsh.kapsam.donemler.length>0); assert.ok(bsh.satirlar.every(s=>s.sayfa&&s.sira>0));
  const kamp=hazir.find(h=>h.tur==='DIVA_KAMPANYA'); assert.ok(kamp.kapsam.bas<=kamp.kapsam.bit); assert.ok(!('__sira' in kamp.satirlar[0].veri));
  await k.run('hkmKaydet()');
  const rpc=k.db.log.filter(l=>l.rpc==='fq_hakedis_yukle'); assert.equal(rpc.length,tumDosyalar().length);
  assert.ok(rpc.every(r=>r.p.p_marka==='bosch'&&['diva_kampanya','diva_fatura','bsh_detay','fiyat_fark'].includes(r.p.p_tur)));
  assert.equal(k.run('fqHkm.hazir.length'),0); assert.equal(k.run('fqHkm.yuklemeler.length'),tumDosyalar().length);
  const ad=tumDosyalar()[0]; k.run('fqHkm.hazir').push(await k.run(`hkmDosyaHazirla(${JSON.stringify(ad)},new TextEncoder().encode(${JSON.stringify(ad)}).buffer)`));
  await k.run('hkmKaydet()');
  assert.equal(k.db.T.hakedis_yukleme.length,tumDosyalar().length,'aynı dosya ikinci kez kaydedilmez');
  assert.match(k.w.document.getElementById('hkmMsg').textContent,/1 dosya zaten kayıtlıydı/);
});

async function yukleVeTanimla(k){
  await k.run('hkmAc()');
  for(const ad of tumDosyalar()) k.run('fqHkm.hazir').push(await k.run(`hkmDosyaHazirla(${JSON.stringify(ad)},new TextEncoder().encode(${JSON.stringify(ad)}).buffer)`));
  await k.run('hkmKaydet()');
  await onayla(k,`hkmTanimIceAl({arrayBuffer:async()=>new TextEncoder().encode('KAMPANYA_TANIMLARI.xlsx').buffer})`);
  k.db.T.hakedis_sube.push({id:'s1',marka:'bosch',anahtar:'TSTSUBE2',magaza:'TEST SUBE IKI',oncelik:0},{id:'s2',marka:'bosch',anahtar:'TSTMRKZ',magaza:'TEST MERKEZ',oncelik:1});
  await k.run('hkmTanimYukle()');
}

test('definitions import maps KAMPANYA_TANIMLARI sheets to the definition tables',async t=>{
  const k=kur(t); await yukleVeTanimla(k);
  const pk=H.tabloOku(FX.tanimlar.find(x=>x.ad==='PAKETLER').aoa).satirlar.filter(r=>r['PAKET ADI']);
  assert.equal(k.db.T.hakedis_paket.length,pk.length);
  const p=k.db.T.hakedis_paket.find(x=>x.paket_adi==='Eylül-Tekil Soğutucu Kampanyası-202609');
  assert.deepEqual([p.tur,p.oran_sayfasi,p.kampanya_bas,p.kampanya_bit,p.hakedis_son,p.durum,p.kampanya_ayi],['TEKİL','ANA','2026-09-03','2026-10-02','2026-11-30','ONAYLI',202609]);
  assert.equal(p.paket_norm,H.norm(p.paket_adi));
  const up=k.db.log.filter(l=>l.op==='upsert'&&l.t==='hakedis_paket'); assert.equal(up[0].ops.onConflict,'isletme_id,marka,paket_norm');
});

test('the result calculated from stored rows equals the core calculation on the original files',async t=>{
  const k=kur(t); await yukleVeTanimla(k);
  await k.run('hkmHesapla()');
  const S=k.run('fqHkm.sonuc'); assert.ok(S,k.w.document.getElementById('hkmMsg').textContent);
  const B=FX.beklenen;
  assert.equal(S.d.length,B.d.length); assert.equal(S.kontrol.length,B.kontrol.length);
  B.kontrol.forEach((p,i)=>{ for(const kk of ['FATURA NO','ÜRÜN','SONUÇ','BEKLENEN (KDV HARİÇ)','BSH ÖDENEN','AÇIK (BEKLENEN − ÖDENEN)','ŞUBE']){
    const a=S.kontrol[i][kk], b=p[kk]; if((a===null||a===undefined||a==='')&&(b===null||b===undefined||b===''))continue;
    if(typeof b==='number')assert.ok(Math.abs(a-b)<=0.006,`${i} ${kk}`); else assert.equal(String(a),String(b),`${i} ${kk}`); } });
  assert.equal(S.kayip.length,B.kayip.length); assert.equal(S.ileri.length,B.ileri.length);
  assert.ok(!k.db.log.some(l=>['update','upsert','insert','delete'].includes(l.op)&&l.t!=='hakedis_paket'&&l.t!=='hakedis_oran_ek'&&l.t!=='hakedis_bsh_fatura'&&l.t!=='hakedis_ayar'),'hesapla veritabanına yazmaz');
  const yazmaOnce=k.db.log.length; await k.run('hkmHesapla()'); assert.ok(k.db.log.slice(yazmaOnce).every(l=>l.op==='select'),'hesap yalnız okur');
  k.run("fqHkm.sekme='sonuc';hkmCiz()"); const html=k.w.document.getElementById('hkmGovde').innerHTML;
  assert.match(html,/Beklenen/); assert.match(html,/TOPLAM/);
  k.run("fqHkm.filtre='A';hkmCiz()"); const satir=k.w.document.querySelectorAll('#hkmGovde table')[1].querySelectorAll('tbody tr').length;
  assert.equal(satir,S.kontrol.filter(r=>/^(ÖDENMEDİ|EKSİK|FAZLA)/.test(r['SONUÇ'])).length);
});

test('a deactivated upload drops out of the calculation',async t=>{
  const k=kur(t); await yukleVeTanimla(k);
  const y=k.db.T.hakedis_yukleme.find(x=>x.tur==='bsh_detay'); await k.run(`hkmYuklemeDurum('${y.id}',false)`);
  await k.run('hkmHesapla()'); const S=k.run('fqHkm.sonuc');
  assert.equal(S.uyarilar.bshYok,true); assert.ok(!S.kontrol.some(r=>r['SONUÇ']==='TAM'));
});

test('objection form and control report are written without colour, form has merges and dd.mm.yyyy dates',async t=>{
  const k=kur(t); await yukleVeTanimla(k); await k.run('hkmHesapla()');
  const S=k.run('fqHkm.sonuc'), it=S.kayip.filter(x=>x.DURUM==='İTİRAZ'); assert.ok(it.length>0,'sentetik veride itiraz kalemi olmalı');
  k.run('hkmFormIndir()'); const f=k.x.indirilen.at(-1);
  assert.match(f.ad,/^BOSCH İTİRAZ TABLOSU \d{8}_\d{4}\.xlsx$/); const ws=f.wb.Sheets.Sheet1;
  assert.deepEqual([...ws['!merges']].map(m=>k.w.XLSX.utils.encode_range(m)),['O1:P1','Q1:T1']);
  assert.equal(ws.K3.t,'n'); assert.equal(ws.K3.z,'dd.mm.yyyy'); assert.equal(H.tarih(ws.K3.v),it[0]['DİVA TARİHİ']);
  k.run('hkmRaporIndir()'); const r=k.x.indirilen.at(-1);
  assert.deepEqual(r.wb.SheetNames,['ÖZET','HAKEDİŞ KONTROL','BUNDLE SETLERİ',"BSH'DE VAR BİZDE YOK",'İTİRAZ','İLERİ TESLİM','ORAN TABLOSU']);
  for(const ad of r.wb.SheetNames) for(const [a,c] of Object.entries(r.wb.Sheets[ad])) if(!a.startsWith('!')) assert.ok(!('s' in c),`${ad}!${a} renk/stil taşımaz`);
  assert.equal(Object.keys(r.wb.Sheets['HAKEDİŞ KONTROL']).filter(a=>/^A\d+$/.test(a)).length-1,S.kontrol.length);
});

test('marking the form as sent stores each objection once and removes it from the next form',async t=>{
  const k=kur(t); await yukleVeTanimla(k); await k.run('hkmHesapla()');
  const n=k.run("fqHkm.sonuc.kayip.filter(x=>x.DURUM==='İTİRAZ').length");
  await onayla(k,'hkmGonderildi()'); assert.equal(k.db.T.hakedis_itiraz.length,n);
  const i=k.db.T.hakedis_itiraz[0]; assert.equal(i.kampanya_norm,H.norm(i.kampanya_adi)); assert.match(i.gonderim_tarihi,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(k.run("fqHkm.sonuc.kayip.filter(x=>x.DURUM==='İTİRAZ').length"),0,'gönderilen kalem forma tekrar girmez');
  await k.run('hkmGonderildi()'); assert.equal(k.db.T.hakedis_itiraz.length,n,'ikinci işaretleme kopya üretmez');
});

test('v11.23: confirmations are shown inside the panel; cancelling writes nothing',async t=>{
  const k=kur(t); await k.run('hkmAc()');
  const metin=await onayla(k,`hkmTanimIceAl({arrayBuffer:async()=>new TextEncoder().encode('KAMPANYA_TANIMLARI.xlsx').buffer})`,'0');
  assert.match(metin,/İçe aktarılacak: \d+ paket/); assert.equal(k.db.T.hakedis_paket.length,0,'vazgeçince yazılmaz');
  assert.equal(k.w.document.getElementById('hkmOnay'),null,'pencere kapanır');
  k.db.T.hakedis_sube.push({id:'s9',marka:'bosch',anahtar:'X',magaza:'Y',oncelik:10}); await k.run('hkmTanimYukle()');
  await onayla(k,"hkmSubeSil('s9')",'0'); assert.equal(k.db.T.hakedis_sube.length,1);
  await onayla(k,"hkmSubeSil('s9')",'1'); assert.equal(k.db.T.hakedis_sube.length,0);
});

test('v11.23: the import control is a real button and a definitions file dropped on Dosyalar is redirected, not saved',async t=>{
  const k=kur(t); await k.run('hkmAc()'); k.run("hkmSekme('tanim')");
  const b=[...k.w.document.querySelectorAll('#hkmGovde button')].find(x=>/KAMPANYA_TANIMLARI\.xlsx içe al/.test(x.textContent));
  assert.ok(b,'içe al bir <button>'); assert.ok(k.w.document.getElementById('hkmTanimDosya'));
  k.run("hkmSekme('dosya')");
  const h=await k.run(`hkmDosyaHazirla('KAMPANYA_TANIMLARI.xlsx',new TextEncoder().encode('KAMPANYA_TANIMLARI.xlsx').buffer)`);
  assert.equal(h.tur,'TANIM'); assert.match(h.durum,/2 · Kampanya tanımları/);
  k.run('fqHkm.hazir').push(h); k.run('hkmCiz()'); await k.run('hkmKaydet()');
  assert.equal(k.db.log.filter(l=>l.rpc==='fq_hakedis_yukle').length,0,'tanım dosyası rapor olarak kaydedilmez');
});

test('v11.23: the save button is usable again after a save, and the result message stays on screen',async t=>{
  const k=kur(t); await k.run('hkmAc()'); const ad=tumDosyalar()[0];
  k.run('fqHkm.hazir').push(await k.run(`hkmDosyaHazirla(${JSON.stringify(ad)},new TextEncoder().encode(${JSON.stringify(ad)}).buffer)`)); k.run('hkmCiz()');
  await k.run('hkmKaydet()'); assert.match(k.w.document.getElementById('hkmMsg').textContent,/1 dosya kaydedildi/);
  const ad2=tumDosyalar()[1]; k.run('fqHkm.hazir').push(await k.run(`hkmDosyaHazirla(${JSON.stringify(ad2)},new TextEncoder().encode(${JSON.stringify(ad2)}).buffer)`));
  const b=k.w.document.getElementById('hkmKaydetBtn'); if(b) assert.equal(b.disabled,false);
  k.run('hkmCiz()'); assert.equal(k.w.document.getElementById('hkmKaydetBtn').disabled,false,'ikinci kayıt için düğme açık');
  assert.match(k.w.document.getElementById('hkmMsg').textContent,/1 dosya kaydedildi/,'yeniden çizimde mesaj kaybolmaz');
});

test('v11.23: a branch mapping row can be added from the panel, at the end or at a given order; duplicates are refused',async t=>{
  const k=kur(t); await k.run('hkmAc()'); k.db.T.hakedis_sube.push({id:'s1',marka:'bosch',anahtar:'TSTMRKZ',magaza:'TEST MERKEZ',oncelik:30}); await k.run('hkmTanimYukle()'); k.run("hkmSekme('tanim')");
  const d=k.w.document, yaz=(id,v)=>{ d.getElementById(id).value=v; };
  yaz('hkmYeniAnahtar','TSTSUBE2'); yaz('hkmYeniMagaza','TEST SUBE IKI'); await k.run('hkmSubeEkle()');
  const e=k.db.T.hakedis_sube.find(s=>s.anahtar==='TSTSUBE2'); assert.equal(e.magaza,'TEST SUBE IKI'); assert.equal(e.oncelik,40); assert.equal(e.marka,'bosch');
  yaz('hkmYeniAnahtar','TSTSUBE3'); yaz('hkmYeniMagaza','X'); yaz('hkmYeniSira','5'); await k.run('hkmSubeEkle()');
  assert.equal(k.db.T.hakedis_sube.find(s=>s.anahtar==='TSTSUBE3').oncelik,5);
  yaz('hkmYeniAnahtar','tstmrkz'); yaz('hkmYeniMagaza','Y'); await k.run('hkmSubeEkle()');
  assert.equal(k.db.T.hakedis_sube.length,3,'aynı anahtar ikinci kez eklenmez'); assert.match(d.getElementById('hkmMsg').textContent,/zaten eşlemede var/);
  yaz('hkmYeniAnahtar',''); yaz('hkmYeniMagaza',''); await k.run('hkmSubeEkle()'); assert.equal(k.db.T.hakedis_sube.length,3);
});
