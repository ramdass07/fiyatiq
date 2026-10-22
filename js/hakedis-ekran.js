/* FiyatIQ — HAKEDİŞ MUTABAKATI ekranı (Faz 1A, yalnız admin). Hesap: js/hakedis-core.js (FiyatIQHakedis).
   Veritabanı: hakedis_* tabloları + fq_hakedis_yukle / fq_hakedis_yukleme_durum (migration 20261021190000).
   Fiyat/kampanya/stok motoruna DOKUNMAZ. Excel çıktıları renksiz (SheetJS). */
'use strict';
const fqHkm={msg:null,onay:null,marka:'bosch',hazir:[],yuklemeler:[],paketler:[],ekOranlar:[],subeler:[],ayar:{},itirazlar:[],bshFaturalar:[],sonuc:null,mesgul:false,filtre:'',arama:'',sekme:'dosya'};
const HKM_TUR_AD={TANIM:'Kampanya tanım dosyası',DIVA_KAMPANYA:'Diva kampanya raporu',DIVA_FATURA:'Diva fatura raporu (şube)',BSH_DETAY:'BSH hakediş detayı',FIYAT_FARK:'Fiyat fark dosyası',TANINMADI:'Tanınmadı'};
const HKM_TUR_DB={DIVA_KAMPANYA:'diva_kampanya',DIVA_FATURA:'diva_fatura',BSH_DETAY:'bsh_detay',FIYAT_FARK:'fiyat_fark'};
const HKM_TUR_SECENEK=['TEKİL','FIRSAT','AİLE','KEA','BUNDLE','HARİÇ','BİLİNMİYOR'];
function hkmYetkili(){ return typeof profil!=='undefined'&&profil&&profil.rol==='admin'; }
function hkmPara(n){ return n===null||n===undefined||Number.isNaN(+n)?'—':Number(n).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function hkmMsg(t,kotu){ fqHkm.msg=t?{t,kotu:!!kotu}:null; const m=document.getElementById('hkmMsg'); if(m){ m.textContent=t||''; m.className='msg'+(kotu?' bad':''); } }
// v11.23: tarayıcının confirm() penceresi yerine panel içi onay (Claude uygulamasının tarayıcısı confirm göstermiyor)
function hkmOnay(metin,evet='Evet, devam'){
  return new Promise(coz=>{ const p=document.getElementById('hkmPanel'); if(!p){ coz(false); return; }
    const eski=document.getElementById('hkmOnay'); if(eski){ eski.remove(); if(fqHkm.onay)fqHkm.onay(false); }
    const d=document.createElement('div'); d.id='hkmOnay'; d.setAttribute('role','alertdialog'); d.setAttribute('aria-modal','true');
    d.innerHTML=`<div class="hkm-onay-kutu"><p>${esc(metin).replace(/\n/g,'<br>')}</p><div class="row" style="justify-content:flex-end"><button class="ghost" data-c="0">Vazgeç</button><button data-c="1">${esc(evet)}</button></div></div>`;
    const bitir=c=>{ d.remove(); fqHkm.onay=null; coz(c); };
    fqHkm.onay=bitir; d.addEventListener('click',e=>{ const b=e.target.closest('button[data-c]'); if(b)bitir(b.dataset.c==='1'); else if(e.target===d)bitir(false); });
    d.addEventListener('keydown',e=>{ if(e.key==='Escape')bitir(false); });
    p.appendChild(d); const ok=d.querySelector('button[data-c="1"]'); if(ok)ok.focus(); });
}
async function hkmSha256(buf){ const h=await crypto.subtle.digest('SHA-256',buf); return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join(''); }

// ------------------------------------------------------------------ panel
function hkmStil(){ if(document.getElementById('hkmStil'))return; const s=document.createElement('style'); s.id='hkmStil'; s.textContent=`
#hkmPanel{position:fixed;inset:0;z-index:300;background:var(--bg);overflow:auto;padding:16px}
#hkmPanel .hkm-ust{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
#hkmPanel .hkm-sekme button.on{background:linear-gradient(180deg,var(--brand),var(--brand2));color:var(--brandink)}
#hkmPanel table{font-size:12px}#hkmPanel td,#hkmPanel th{padding:5px 7px;text-align:left;white-space:nowrap}#hkmPanel td.num,#hkmPanel th.num{text-align:right}
#hkmPanel .hkm-kart{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:10px 0}
#hkmPanel .hkm-kart>div{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--panel)}
#hkmPanel .hkm-kart b{display:block;font-size:20px}#hkmPanel .hkm-kaydir{overflow:auto;max-height:60vh;border:1px solid var(--line);border-radius:10px}
#hkmPanel .hkm-uyari{border-left:4px solid var(--warn);background:color-mix(in srgb,var(--warn) 12%,transparent);padding:8px 12px;border-radius:8px;margin:8px 0;font-size:13px}
#hkmPanel input.hkm-h,#hkmPanel select.hkm-h{padding:3px 5px;font-size:12px;max-width:150px}
#hkmOnay{position:fixed;inset:0;z-index:310;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
#hkmOnay .hkm-onay-kutu{background:var(--panel);color:var(--txt);border:1px solid var(--line);border-radius:14px;padding:16px 18px;max-width:520px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)}
#hkmOnay p{margin:0 0 14px;font-size:14px;line-height:1.5}`; document.head.appendChild(s); }
async function hkmAc(){
  if(!hkmYetkili()){ alert('Hakediş mutabakatı şimdilik yalnız yönetici hesabına açık.'); return; }
  hkmStil(); let p=document.getElementById('hkmPanel');
  if(!p){ p=document.createElement('div'); p.id='hkmPanel'; p.setAttribute('role','dialog'); p.setAttribute('aria-label','Hakediş mutabakatı'); document.body.appendChild(p); }
  p.style.display='block'; hkmCiz(); await hkmTanimYukle(); hkmCiz();
}
function hkmKapat(){ const p=document.getElementById('hkmPanel'); if(p)p.style.display='none'; }
function hkmSekme(s){ fqHkm.sekme=s; fqHkm.msg=null; hkmCiz(); }
function hkmCiz(){
  const p=document.getElementById('hkmPanel'); if(!p)return; const S=fqHkm.sekme;
  const btn=(k,ad)=>`<button class="ghost sm${S===k?' on':''}" onclick="hkmSekme('${k}')">${ad}</button>`;
  p.innerHTML=`<div class="hkm-ust"><h2 style="margin:0">🧾 Hakediş Mutabakatı · BSH</h2>
    <select id="hkmMarka" onchange="fqHkm.marka=this.value;fqHkm.sonuc=null;hkmTanimYukle().then(hkmCiz)"><option value="bosch"${fqHkm.marka==='bosch'?' selected':''}>Bosch</option><option value="siemens" disabled>Siemens (Faz 3)</option></select>
    <span class="hkm-sekme">${btn('dosya','1 · Dosyalar')}${btn('tanim','2 · Kampanya tanımları')}${btn('sonuc','3 · Sonuç')}${btn('itiraz','4 · İtiraz ve ileri teslim')}</span>
    <div class="grow"></div><span id="hkmMsg" class="msg${fqHkm.msg&&fqHkm.msg.kotu?' bad':''}">${esc(fqHkm.msg?fqHkm.msg.t:'')}</span><button class="ghost sm" onclick="hkmKapat()">✕ Kapat</button></div>
    <div id="hkmGovde">${S==='dosya'?hkmDosyaHTML():S==='tanim'?hkmTanimHTML():S==='sonuc'?hkmSonucHTML():hkmItirazHTML()}</div>`;
}

// ------------------------------------------------------------------ veritabanı
async function hkmTumu(sorgu){ const out=[]; for(let a=0;;a+=1000){ const {data,error}=await sorgu().range(a,a+999); if(error)throw error; out.push(...(data||[])); if(!data||data.length<1000)break; } return out; }
async function hkmTanimYukle(){
  try{ const mk=fqHkm.marka;
    const [y,pk,eo,sb_,ay,it,bf]=await Promise.all([
      hkmTumu(()=>sb.from('hakedis_yukleme').select('id,tur,marka,dosya_adi,sube_kodu,kapsam_bas,kapsam_bit,donemler,satir_sayisi,aktif,pasif_nedeni,created_at').eq('marka',mk).order('created_at')),
      hkmTumu(()=>sb.from('hakedis_paket').select('*').eq('marka',mk).order('paket_adi')),
      hkmTumu(()=>sb.from('hakedis_oran_ek').select('*').eq('marka',mk).order('gecerlilik_bas')),
      hkmTumu(()=>sb.from('hakedis_sube').select('*').eq('marka',mk).order('oncelik')),
      hkmTumu(()=>sb.from('hakedis_ayar').select('anahtar,deger').eq('marka',mk).order('anahtar')),
      hkmTumu(()=>sb.from('hakedis_itiraz').select('*').eq('marka',mk).order('gonderim_tarihi')),
      hkmTumu(()=>sb.from('hakedis_bsh_fatura').select('*').eq('marka',mk).order('fatura_no'))]);
    Object.assign(fqHkm,{yuklemeler:y,paketler:pk,ekOranlar:eo,subeler:sb_,ayar:Object.fromEntries(ay.map(r=>[r.anahtar,r.deger])),itirazlar:it,bshFaturalar:bf});
  }catch(e){ hkmMsg('Veriler okunamadı: '+(e.message||e),true); }
}

// ------------------------------------------------------------------ 1 · DOSYALAR
function hkmDosyaHTML(){
  const H=FiyatIQHakedis, akt=fqHkm.yuklemeler.filter(y=>y.aktif);
  const hazir=fqHkm.hazir.map((h,i)=>`<tr><td>${esc(h.dosyaAdi)}</td><td>${esc(HKM_TUR_AD[h.tur]||h.tur)}</td><td class="num">${h.satirlar?h.satirlar.length:0}</td><td>${esc(H.tMetin(h.kapsam?.bas))} – ${esc(H.tMetin(h.kapsam?.bit))}</td><td>${esc(h.kapsam?.sube_kodu||'')}</td><td>${esc(h.durum||'')}</td><td><button class="ghost sm" onclick="fqHkm.hazir.splice(${i},1);hkmCiz()">✕</button></td></tr>`).join('');
  const eksik=hkmEksikSubeler();
  return `<div class="card"><h3 style="margin-top:0">Dosya bırak</h3>
    <p class="mut" style="font-size:13px">Diva kampanya raporu, Diva fatura raporları (<b>her şube ayrı</b>), fiyat fark dosyaları, BSH hakediş detayı. Tür, dosya adından değil başlıklardan tanınır. Aynı dosya ikinci kez yüklenmez; aynı kapsamı içine alan yeni rapor eskisini pasifleştirir (silmez).</p>
    <input id="hkmDosya" type="file" multiple accept=".xlsx,.xls,.xlsm" onchange="hkmDosyaSec(this.files)">
    ${fqHkm.hazir.length?`<div class="hkm-kaydir" style="margin-top:10px"><table><thead><tr><th>Dosya</th><th>Tür</th><th class="num">Satır</th><th>Kapsam</th><th>Şube</th><th>Durum</th><th></th></tr></thead><tbody>${hazir}</tbody></table></div>
    <div class="row" style="margin-top:8px"><button id="hkmKaydetBtn" onclick="hkmKaydet()" ${fqHkm.mesgul?'disabled':''}>✓ Seçilen dosyaları kaydet</button></div>`:''}</div>
    ${eksik.length?`<div class="hkm-uyari">⚠ Diva fatura raporu eksik şube(ler): <b>${eksik.map(esc).join(', ')}</b>. İleri teslimlerin gerçek faturası bu şubelerde aranamaz.</div>`:''}
    <div class="card"><h3 style="margin-top:0">Kayıtlı dosyalar <span class="badge">${akt.length} aktif</span></h3>
    <div class="hkm-kaydir"><table><thead><tr><th>Durum</th><th>Tür</th><th>Dosya</th><th>Şube</th><th>Kapsam</th><th class="num">Satır</th><th>Yüklendi</th><th></th></tr></thead><tbody>
    ${fqHkm.yuklemeler.slice().reverse().map(y=>`<tr style="${y.aktif?'':'opacity:.55'}"><td>${y.aktif?'aktif':'pasif'+(y.pasif_nedeni?' — '+esc(y.pasif_nedeni):'')}</td><td>${esc(y.tur)}</td><td>${esc(y.dosya_adi)}</td><td>${esc(y.sube_kodu||'')}</td><td>${esc(H.tMetin(y.kapsam_bas))} – ${esc(H.tMetin(y.kapsam_bit))}</td><td class="num">${y.satir_sayisi}</td><td>${esc(String(y.created_at||'').slice(0,16).replace('T',' '))}</td><td><button class="ghost sm" onclick="hkmYuklemeDurum('${y.id}',${!y.aktif})">${y.aktif?'Pasifleştir':'Etkinleştir'}</button></td></tr>`).join('')||'<tr><td colspan="8" class="mut">Henüz dosya yok.</td></tr>'}
    </tbody></table></div></div>`;
}
function hkmEksikSubeler(){
  const fat=new Set(fqHkm.yuklemeler.filter(y=>y.aktif&&y.tur==='diva_fatura').map(y=>String(y.sube_kodu||'').trim()));
  const diva=new Set(); for(const h of fqHkm.hazir) if(h.tur==='DIVA_KAMPANYA') for(const s of h.satirlar) if(s.veri['Şube Kodu'])diva.add(String(s.veri['Şube Kodu']).trim());
  for(const k of fqHkm.subelerDiva||[]) diva.add(k);
  return [...diva].filter(k=>k&&!fat.has(k)).sort();
}
// Dosyayı oku → tür → veritabanına gidecek satırlar + kapsam
async function hkmDosyaHazirla(dosyaAdi,buf){
  const H=FiyatIQHakedis, wb=XLSX.read(buf,{type:'array',raw:true,cellDates:false});
  const sayfalar=wb.SheetNames.map(ad=>({ad,aoa:XLSX.utils.sheet_to_json(wb.Sheets[ad],{header:1,raw:true,defval:null,blankrows:true})}));
  const adlar=sayfalar.map(s=>H.norm(s.ad));
  if(adlar.includes('PAKETLER')&&(adlar.includes('AYARLAR')||adlar.includes('EK ORANLAR')))
    return {dosyaAdi,tur:'TANIM',hash:null,kapsam:{},satirlar:[],durum:'Bu kampanya tanım dosyası — 2 · Kampanya tanımları sekmesindeki “içe al” düğmesiyle yükle'};
  const tur=H.dosyaTuru(sayfalar), hash=await hkmSha256(buf), kapsam={}; let satirlar=[];
  const tarihler=[];
  if(tur==='DIVA_KAMPANYA'||tur==='DIVA_FATURA'){
    const t=H.tabloOku(sayfalar[0].aoa);
    satirlar=t.satirlar.map(r=>{ const {__sira,...veri}=r; const tr=H.tarih(r['Fatura Tarihi']); if(tr)tarihler.push(tr);
      return {sira:__sira,sayfa:sayfalar[0].ad,fatura_no:H.fno(r['Fatura No']),urun_kodu:H.kod(r['Ürün Kodu']),tarih:tr,veri}; });
    if(tur==='DIVA_FATURA'){ const sk=[...new Set(t.satirlar.map(r=>H.pyStr(r['Şube Kodu']).trim()).filter(x=>x&&x!=='nan'))];
      kapsam.sube_kodu=sk.length===1?sk[0]:sk.join(','); if(sk.length>1)kapsam.uyari='Dosyada birden fazla şube var — şube şube çekilmeli'; }
  } else if(tur==='BSH_DETAY'){
    const don=new Set();
    for(const s of sayfalar){ const t=H.tabloOku(s.aoa,H.kolonTemizle);
      for(const r of t.satirlar){ const {__sira,...veri}=r; const tr=H.tarih(r['Fatura Tarihi']); if(tr)tarihler.push(tr);
        for(const [k,v] of Object.entries(r)) if(/^(Hak Ediş Dönemi|Kampanya \d+ Hak Ediş Dönemi)/.test(k)&&Number.isFinite(+v)&&v!==null)don.add(Math.trunc(+v));
        satirlar.push({sira:__sira,sayfa:s.ad,fatura_no:H.fno(r['Fatura No']),urun_kodu:H.kod(r['Ürün Kodu']),tarih:tr,veri}); } }
    kapsam.donemler=[...don].sort();
  } else if(tur==='FIYAT_FARK'){
    const o=H.fiyatFarkOku({dosyaAdi,sayfalar}); satirlar=o.map((x,i)=>({sira:i+1,sayfa:x.KAYNAK.split(' › ')[1]||null,urun_kodu:x.KOD,tarih:x['BAŞLANGIÇ'],veri:x}));
    o.forEach(x=>tarihler.push(x['BAŞLANGIÇ'])); kapsam.donemler=[...new Set(o.map(x=>x.AY))].sort();
  }
  tarihler.sort(); if(tarihler.length){ kapsam.bas=tarihler[0]; kapsam.bit=tarihler[tarihler.length-1]; }
  const durum=tur==='TANINMADI'?'Tanınmadı — yüklenmeyecek':!satirlar.length?'Satır bulunamadı':kapsam.uyari||'hazır';
  return {dosyaAdi,tur,hash,kapsam,satirlar,durum,sayfalar};
}
async function hkmDosyaSec(files){
  if(!files||!files.length)return; hkmMsg('Dosyalar okunuyor…');
  for(const f of files){ try{ if(/primli/i.test(String(f.name).normalize('NFKD').replace(/[̀-ͯ]/g,''))){ fqHkm.hazir.push({dosyaAdi:f.name,tur:'TANINMADI',durum:'Primli listesi — bu modüle alınmaz',satirlar:[]}); continue; }
      fqHkm.hazir.push(await hkmDosyaHazirla(f.name,await f.arrayBuffer())); }
    catch(e){ fqHkm.hazir.push({dosyaAdi:f.name,tur:'TANINMADI',durum:'Okunamadı: '+(e.message||e),satirlar:[]}); } }
  hkmMsg(''); hkmCiz();
}
async function hkmKaydet(){
  if(fqHkm.mesgul)return; const liste=fqHkm.hazir.filter(h=>HKM_TUR_DB[h.tur]&&h.satirlar.length&&!/^Tanınmadı|^Satır bulunamadı/.test(h.durum));
  if(!liste.length){ hkmMsg('Kaydedilecek tanınmış dosya yok.',true); return; }
  fqHkm.mesgul=true; let n=0,ayni=0,pas=0;
  try{ for(const h of liste){ hkmMsg(`${h.dosyaAdi} kaydediliyor…`);
      const {data,error}=await sb.rpc('fq_hakedis_yukle',{p_tur:HKM_TUR_DB[h.tur],p_marka:fqHkm.marka,p_dosya_adi:h.dosyaAdi,p_hash:h.hash,p_kapsam:h.kapsam,p_satirlar:h.satirlar});
      if(error)throw new Error(`${h.dosyaAdi}: ${error.message}`);
      if(data&&data.durum==='ayni_dosya'){ ayni++; h.durum='Bu dosya zaten kayıtlı'; } else { n++; pas+=(data&&data.pasiflesen)||0; h.durum='kaydedildi'; } }
    fqHkm.hazir=fqHkm.hazir.filter(h=>h.durum!=='kaydedildi'&&h.durum!=='Bu dosya zaten kayıtlı'); fqHkm.sonuc=null;
    await hkmTanimYukle(); hkmCiz(); hkmMsg(`${n} dosya kaydedildi${ayni?`, ${ayni} dosya zaten kayıtlıydı`:''}${pas?`, ${pas} eski yükleme pasifleşti`:''}.`);
  }catch(e){ hkmCiz(); hkmMsg('Kayıt yarıda kaldı: '+(e.message||e)+' — kaydedilenler korunur, kalanları tekrar kaydedebilirsin.',true); }
  finally{ fqHkm.mesgul=false; const b=document.getElementById('hkmKaydetBtn'); if(b)b.disabled=false; }
}
async function hkmYuklemeDurum(id,aktif){
  const {error}=await sb.rpc('fq_hakedis_yukleme_durum',{p_id:id,p_aktif:aktif});
  if(error){ hkmMsg(error.message,true); return; } fqHkm.sonuc=null; await hkmTanimYukle(); hkmCiz();
}

// ------------------------------------------------------------------ 2 · KAMPANYA TANIMLARI
function hkmPaketCekirdek(p){ return {'PAKET ADI':p.paket_adi,'TÜR':p.tur,'ORAN SAYFASI':p.oran_sayfasi,'BUNDLE HAKEDİŞ (KDV DAHİL)':p.bundle_hakedis_kdv_dahil,'SET ÜRÜN SAYISI':p.set_urun_sayisi,
  'KAMPANYA BAŞLANGIÇ':p.kampanya_bas,'KAMPANYA BİTİŞ':p.kampanya_bit,'HAKEDİŞ SON TARİHİ':p.hakedis_son,'KAYNAK / NOT':p.kaynak_not,'DURUM':p.durum,'FATURA+ÜRÜN BAŞINA ADET LİMİTİ':p.adet_limiti}; }
function hkmPaketDb(r){ const H=FiyatIQHakedis, s=v=>v===null||v===undefined||v===''?null:v, n=v=>s(v)===null||!Number.isFinite(+v)?null:+v;
  const tur=String(r['TÜR']||'BİLİNMİYOR').trim().toUpperCase().replace('TEKIL','TEKİL').replace('HARIC','HARİÇ').replace('AILE','AİLE');
  const os_=s(r['ORAN SAYFASI'])?String(r['ORAN SAYFASI']).trim().toUpperCase().replace('AILE','AİLE'):null;
  return {marka:fqHkm.marka,paket_adi:String(r['PAKET ADI']).trim(),paket_norm:H.norm(r['PAKET ADI']),kampanya_ayi:H.kampanyaAyi(r['PAKET ADI'],null),
    tur:HKM_TUR_SECENEK.includes(tur)?tur:'BİLİNMİYOR',oran_sayfasi:['ANA','FIRSAT','AİLE'].includes(os_)?os_:null,bundle_hakedis_kdv_dahil:n(r['BUNDLE HAKEDİŞ (KDV DAHİL)']),
    set_urun_sayisi:n(r['SET ÜRÜN SAYISI']),kampanya_bas:H.tarih(r['KAMPANYA BAŞLANGIÇ']),kampanya_bit:H.tarih(r['KAMPANYA BİTİŞ']),hakedis_son:H.tarih(r['HAKEDİŞ SON TARİHİ']),
    kaynak_not:s(r['KAYNAK / NOT']),durum:String(r.DURUM||'').trim().toUpperCase()==='ONAYLI'?'ONAYLI':'KONTROL ET',adet_limiti:n(r['FATURA+ÜRÜN BAŞINA ADET LİMİTİ'])}; }
function hkmTanimHTML(){
  const H=FiyatIQHakedis, P=fqHkm.paketler, yeni=fqHkm.sonuc?fqHkm.sonuc.yeniPaketler:[];
  const sec=(id,alan,deger,ops)=>`<select class="hkm-h" onchange="hkmPaketAlan('${id}','${alan}',this.value)">${ops.map(o=>`<option${o===(deger??'')?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
  const inp=(id,alan,deger,tip='text',w=90)=>`<input class="hkm-h" type="${tip}" style="width:${w}px" value="${esc(deger??'')}" onchange="hkmPaketAlan('${id}','${alan}',this.value)">`;
  return `<div class="card"><h3 style="margin-top:0">Kampanya (paket) tanımları <span class="badge">${P.length}</span></h3>
    <p class="mut" style="font-size:13px">Paket adı Diva'daki ve BSH'deki kampanya adıyla aynıdır. Bundle hakediş tutarı uygulama yazısından (KDV dahil) girilir. <b>KONTROL ET</b> satırlarını gözden geçirip ONAYLI yap.</p>
    <div class="row"><button type="button" class="sm" onclick="document.getElementById('hkmTanimDosya').click()">📂 KAMPANYA_TANIMLARI.xlsx içe al</button><input id="hkmTanimDosya" type="file" accept=".xlsx" style="display:none" onchange="hkmTanimIceAl(this.files[0]);this.value=''">
    ${yeni.length?`<button class="sm" onclick="hkmYeniPaketEkle()">+ Diva'da çıkan ${yeni.length} yeni paketi ekle</button>`:''}</div>
    <div class="hkm-kaydir" style="margin-top:8px"><table><thead><tr><th>Paket adı</th><th>Tür</th><th>Oran sayfası</th><th class="num">Bundle (KDV dahil)</th><th>Set ürün</th><th>Başlangıç</th><th>Bitiş</th><th>Hakediş son</th><th>Adet limiti</th><th>Durum</th><th>Not</th></tr></thead><tbody>
    ${P.map(p=>`<tr><td title="${esc(p.paket_adi)}">${esc(p.paket_adi)}</td><td>${sec(p.id,'tur',p.tur,HKM_TUR_SECENEK)}</td><td>${sec(p.id,'oran_sayfasi',p.oran_sayfasi||'',['','ANA','FIRSAT','AİLE'])}</td>
      <td>${inp(p.id,'bundle_hakedis_kdv_dahil',p.bundle_hakedis_kdv_dahil,'number',90)}</td><td>${inp(p.id,'set_urun_sayisi',p.set_urun_sayisi,'number',55)}</td>
      <td>${inp(p.id,'kampanya_bas',p.kampanya_bas,'date',130)}</td><td>${inp(p.id,'kampanya_bit',p.kampanya_bit,'date',130)}</td><td>${inp(p.id,'hakedis_son',p.hakedis_son,'date',130)}</td>
      <td>${inp(p.id,'adet_limiti',p.adet_limiti,'number',55)}</td><td>${sec(p.id,'durum',p.durum,['ONAYLI','KONTROL ET'])}</td><td class="mut" title="${esc(p.kaynak_not||'')}">${esc(String(p.kaynak_not||'').slice(0,40))}</td></tr>`).join('')||'<tr><td colspan="11" class="mut">Tanım yok — KAMPANYA_TANIMLARI.xlsx içe al.</td></tr>'}
    </tbody></table></div></div>
    <div class="card"><h3 style="margin-top:0">Elle eklenen oranlar (mail) <span class="badge">${fqHkm.ekOranlar.length}</span></h3>
    <div class="hkm-kaydir"><table><thead><tr><th>Ürün</th><th>Sayfa</th><th class="num">Birim fark (KDV hariç)</th><th>Geçerlilik</th><th>Kaynak</th></tr></thead><tbody>
    ${fqHkm.ekOranlar.map(o=>`<tr><td>${esc(o.urun_kodu)}</td><td>${esc(o.oran_sayfasi)}</td><td class="num">${hkmPara(o.birim_fark_kdv_haric)}</td><td>${esc(H.tMetin(o.gecerlilik_bas))}</td><td>${esc(o.kaynak||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="mut">Yok.</td></tr>'}
    </tbody></table></div></div>
    <div class="card"><h3 style="margin-top:0">Şube → mağaza eşlemesi <span class="badge">${fqHkm.subeler.length}</span></h3>
    <p class="mut" style="font-size:13px">Diva şube kodu ya da şube adındaki bir parça → rapordaki mağaza adı. Üstteki satır önce denenir.</p>
    <div class="row"><input id="hkmYeniAnahtar" class="hkm-h" placeholder="Anahtar (ör. şube kodu)" style="max-width:190px"><input id="hkmYeniMagaza" class="hkm-h" placeholder="Mağaza adı" style="max-width:170px"><input id="hkmYeniSira" class="hkm-h" type="number" placeholder="Sıra" style="max-width:70px" title="Küçük sıra önce denenir; boşsa en sona eklenir"><button type="button" class="sm" onclick="hkmSubeEkle()">+ Ekle</button><button class="ghost sm" onclick="hkmSubeOner()">Diva'dan öner</button></div>
    <div class="hkm-kaydir" style="margin-top:6px"><table><thead><tr><th>Sıra</th><th>Anahtar (kod/ad parçası)</th><th>Mağaza</th><th></th></tr></thead><tbody>
    ${fqHkm.subeler.map(s=>`<tr><td>${s.oncelik}</td><td>${esc(s.anahtar)}</td><td><input class="hkm-h" value="${esc(s.magaza)}" onchange="hkmSubeAlan('${s.id}',this.value)"></td><td><button class="ghost sm" onclick="hkmSubeSil('${s.id}')">✕</button></td></tr>`).join('')||'<tr><td colspan="4" class="mut">Yok.</td></tr>'}
    </tbody></table></div></div>
    <div class="card"><h3 style="margin-top:0">Ayarlar</h3><div class="row"><div class="fld"><label>Milat (YYYYAA)</label><input class="hkm-h" value="${esc(fqHkm.ayar['MİLAT']||'202609')}" onchange="hkmAyar('MİLAT',this.value)"></div></div></div>`;
}
async function hkmPaketAlan(id,alan,deger){
  const v=deger===''?null:(['bundle_hakedis_kdv_dahil','set_urun_sayisi','adet_limiti'].includes(alan)?+deger:deger);
  const ek=alan==='durum'&&v==='ONAYLI'?{onay_tarihi:new Date().toISOString(),onaylayan:typeof authUid!=='undefined'?authUid:null}:{};
  const {error}=await sb.from('hakedis_paket').update({[alan]:v,...ek,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){ hkmMsg(error.message,true); return; } const p=fqHkm.paketler.find(x=>x.id===id); if(p)Object.assign(p,{[alan]:v},ek); fqHkm.sonuc=null; hkmMsg('Kaydedildi.');
}
async function hkmTanimIceAl(file){
  if(!file)return; const H=FiyatIQHakedis;
  try{ const wb=XLSX.read(await file.arrayBuffer(),{type:'array',raw:true,cellDates:false});
    const sayfa=ad=>wb.SheetNames.includes(ad)?H.tabloOku(XLSX.utils.sheet_to_json(wb.Sheets[ad],{header:1,raw:true,defval:null})).satirlar:[];
    const paket=sayfa('PAKETLER').filter(r=>r['PAKET ADI']).map(hkmPaketDb);
    const ek=sayfa('EK_ORANLAR').filter(r=>r['ÜRÜN KODU']&&H.tarih(r['GEÇERLİLİK BAŞLANGIÇ'])).map(r=>({marka:fqHkm.marka,urun_kodu:H.kod(r['ÜRÜN KODU']),oran_sayfasi:String(r['ORAN SAYFASI']||'ANA').trim().toUpperCase().replace('AILE','AİLE'),
      birim_fark_kdv_haric:+r['BİRİM FİYAT FARKI (KDV HARİÇ)'],gecerlilik_bas:H.tarih(r['GEÇERLİLİK BAŞLANGIÇ']),kaynak:r.KAYNAK||null}));
    const bf=sayfa('BSH_FATURALAR').filter(r=>r['FATURA NO']).map(r=>({marka:fqHkm.marka,fatura_no:H.fno(r['FATURA NO']),fatura_tarihi:H.tarih(r['FATURA TARİHİ']),tur:r['TÜR']||null,
      tutar_kdv_haric:H.sayi(r['TUTAR (KDV HARİÇ)']),hakedis_donemi:r['HAKEDİŞ DÖNEMİ (YYYYAA)']?Math.trunc(+r['HAKEDİŞ DÖNEMİ (YYYYAA)']):null,not_:r.NOT||null}));
    const ay=sayfa('AYARLAR').filter(r=>r.AYAR&&['MİLAT','EŞLEŞME GÜN ARALIĞI'].includes(String(r.AYAR).trim())).map(r=>({marka:fqHkm.marka,anahtar:String(r.AYAR).trim(),deger:String(r['DEĞER'])}));
    if(!await hkmOnay(`İçe aktarılacak: ${paket.length} paket, ${ek.length} elle oran, ${bf.length} BSH faturası, ${ay.length} ayar.\nAynı adlı paketlerin tanımı güncellenir. Devam edilsin mi?`,'İçe al'))return;
    for(const [t,rows,on] of [['hakedis_paket',paket,'isletme_id,marka,paket_norm'],['hakedis_oran_ek',ek,'isletme_id,marka,urun_kodu,oran_sayfasi,gecerlilik_bas'],['hakedis_bsh_fatura',bf,'isletme_id,marka,fatura_no'],['hakedis_ayar',ay,'isletme_id,marka,anahtar']])
      if(rows.length){ const {error}=await sb.from(t).upsert(rows,{onConflict:on}); if(error)throw new Error(t+': '+error.message); }
    fqHkm.sonuc=null; await hkmTanimYukle(); hkmCiz(); hkmMsg(`${paket.length} paket içe alındı.`);
  }catch(e){ hkmMsg('İçe alma başarısız: '+(e.message||e),true); }
}
async function hkmYeniPaketEkle(){
  const yeni=(fqHkm.sonuc?.yeniPaketler||[]).map(hkmPaketDb); if(!yeni.length)return;
  const {error}=await sb.from('hakedis_paket').upsert(yeni,{onConflict:'isletme_id,marka,paket_norm',ignoreDuplicates:true});
  if(error){ hkmMsg(error.message,true); return; } fqHkm.sonuc=null; await hkmTanimYukle(); hkmCiz(); hkmMsg(`${yeni.length} paket KONTROL ET olarak eklendi — türünü ve tutarını gir.`);
}
async function hkmSubeOner(){
  const ciftler=fqHkm.sonuc?[...new Map(fqHkm.sonuc.d.map(r=>[String(r['Şube Kodu']??'')+'|'+String(r['Şube Adı']??''),r])).keys()]:[];
  if(!ciftler.length){ hkmMsg('Önce 3 · Sonuç sekmesinde hesapla; şubeler Diva raporundan önerilir.',true); return; }
  const var_=new Set(fqHkm.subeler.map(s=>FiyatIQHakedis.norm(s.anahtar))); let sira=Math.max(0,...fqHkm.subeler.map(s=>s.oncelik||0)); const rows=[];
  for(const c of ciftler){ const [kod_,ad]=c.split('|'); for(const a of [kod_,ad]) if(a&&!var_.has(FiyatIQHakedis.norm(a))){ var_.add(FiyatIQHakedis.norm(a)); rows.push({marka:fqHkm.marka,anahtar:a,magaza:ad||kod_,oncelik:sira+=10}); } }
  if(!rows.length){ hkmMsg('Önerilecek yeni şube yok.'); return; }
  const {error}=await sb.from('hakedis_sube').insert(rows); if(error){ hkmMsg(error.message,true); return; }
  await hkmTanimYukle(); hkmCiz(); hkmMsg(`${rows.length} anahtar eklendi — mağaza adlarını kısalt (ör. rapordaki kısa ad).`);
}
async function hkmSubeEkle(){
  const v=id=>String(document.getElementById(id)?.value||'').trim(), anahtar=v('hkmYeniAnahtar'), magaza=v('hkmYeniMagaza'), sira=v('hkmYeniSira');
  if(!anahtar||!magaza){ hkmMsg('Anahtar ve mağaza adı ikisi de gerekli.',true); return; }
  if(fqHkm.subeler.some(s=>FiyatIQHakedis.norm(s.anahtar)===FiyatIQHakedis.norm(anahtar))){ hkmMsg(`"${anahtar}" zaten eşlemede var.`,true); return; }
  const oncelik=sira&&Number.isFinite(+sira)?Math.trunc(+sira):Math.max(0,...fqHkm.subeler.map(s=>s.oncelik||0))+10;
  const {error}=await sb.from('hakedis_sube').insert({marka:fqHkm.marka,anahtar,magaza,oncelik});
  if(error){ hkmMsg(error.message,true); return; } fqHkm.sonuc=null; await hkmTanimYukle(); hkmCiz(); hkmMsg(`"${anahtar}" → ${magaza} eklendi.`);
}
async function hkmSubeAlan(id,magaza){ const {error}=await sb.from('hakedis_sube').update({magaza}).eq('id',id); if(error)hkmMsg(error.message,true); else{ const s=fqHkm.subeler.find(x=>x.id===id); if(s)s.magaza=magaza; fqHkm.sonuc=null; } }
async function hkmSubeSil(id){ if(!await hkmOnay('Bu şube eşlemesi silinsin mi?','Sil'))return; const {error}=await sb.from('hakedis_sube').delete().eq('id',id); if(error)hkmMsg(error.message,true); else{ await hkmTanimYukle(); hkmCiz(); } }
async function hkmAyar(anahtar,deger){ const {error}=await sb.from('hakedis_ayar').upsert({marka:fqHkm.marka,anahtar,deger},{onConflict:'isletme_id,marka,anahtar'}); if(error)hkmMsg(error.message,true); else{ fqHkm.ayar[anahtar]=deger; fqHkm.sonuc=null; } }

// ------------------------------------------------------------------ 3 · HESAP ve SONUÇ
async function hkmHesapla(){
  if(fqHkm.mesgul)return; fqHkm.mesgul=true; hkmMsg('Kayıtlı satırlar okunuyor…');
  try{
    const H=FiyatIQHakedis, akt=fqHkm.yuklemeler.filter(y=>y.aktif).sort((a,b)=>String(a.kapsam_bas||'').localeCompare(String(b.kapsam_bas||''))||String(a.created_at).localeCompare(String(b.created_at)));
    const g={divaKampanya:[],divaFatura:[],bshDetay:[],oranlar:[]};
    for(const y of akt){
      const rows=await hkmTumu(()=>sb.from('hakedis_satir').select('sira,sayfa,veri').eq('yukleme_id',y.id).order('sira'));
      if(y.tur==='diva_kampanya')g.divaKampanya.push({dosyaAdi:y.dosya_adi,satirlar:rows.map(r=>({...r.veri,__sira:r.sira}))});
      else if(y.tur==='diva_fatura')g.divaFatura.push({dosyaAdi:y.dosya_adi,satirlar:rows.map(r=>({...r.veri,__sira:r.sira}))});
      else if(y.tur==='bsh_detay'){ const sy=new Map(); for(const r of rows){ if(!sy.has(r.sayfa))sy.set(r.sayfa,[]); sy.get(r.sayfa).push({...r.veri,__sira:r.sira}); }
        g.bshDetay.push({dosyaAdi:y.dosya_adi,sayfalar:[...sy].map(([ad,satirlar])=>({ad,satirlar}))}); }
      else if(y.tur==='fiyat_fark')g.oranlar.push(...rows.map(r=>r.veri)); }
    if(!g.divaKampanya.length)throw new Error('Diva kampanya raporu yüklenmemiş.');
    const bugun=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date());
    fqHkm.sonuc=H.hesapla({marka:fqHkm.marka.toUpperCase(),milat:Math.trunc(+(fqHkm.ayar['MİLAT']||202609)),bugun,...g,
      paketler:fqHkm.paketler.map(hkmPaketCekirdek),
      ekOranlar:fqHkm.ekOranlar.map(o=>({'ÜRÜN KODU':o.urun_kodu,'ORAN SAYFASI':o.oran_sayfasi,'BİRİM FİYAT FARKI (KDV HARİÇ)':o.birim_fark_kdv_haric,'GEÇERLİLİK BAŞLANGIÇ':o.gecerlilik_bas,KAYNAK:o.kaynak})),
      subeler:fqHkm.subeler,eskiItirazlar:fqHkm.itirazlar.map(i=>({'FATURA NO':i.fatura_no,'ÜRÜN':i.urun_kodu,KAMPANYA:i.kampanya_adi,'TARİH':i.gonderim_tarihi,DOSYA:i.form_adi||''}))});
    fqHkm.sonuc.hesapZamani=new Date(); fqHkm.subelerDiva=[...new Set(fqHkm.sonuc.d.map(r=>String(r['Şube Kodu']??'').trim()).filter(x=>x))];
    hkmMsg(`Hesaplandı: ${fqHkm.sonuc.kontrol.length} satır.`);
  }catch(e){ hkmMsg('Hesaplanamadı: '+(e.message||e),true); }
  finally{ fqHkm.mesgul=false; hkmCiz(); }
}
const HKM_KOVA=[['','Hepsi'],['A','İtiraz / kontrol'],['B','Sarkan'],['C','Tamam'],['D','Kontrol dışı']];
function hkmKova(s){ return /^(ÖDENMEDİ|EKSİK|FAZLA)/.test(s)?'A':/^(SARKAN|BSH DETAYI)/.test(s)?'B':/^(TAM|HAKEDİŞ YOK|ÖDENDİ)/.test(s)?'C':'D'; }
function hkmSonucHTML(){
  const S=fqHkm.sonuc;
  const ust=`<div class="row"><button onclick="hkmHesapla()" ${fqHkm.mesgul?'disabled':''}>▶ Hesapla</button>${S?`<button class="ghost" onclick="hkmRaporIndir()">📥 Kontrol raporu (Excel)</button><span class="mut" style="font-size:12px">Hesap: ${esc(S.hesapZamani?S.hesapZamani.toLocaleString('tr-TR'):'')} · tutarlar KDV hariç</span>`:''}</div>`;
  if(!S)return `<div class="card">${ust}<p class="mut">Aktif dosyalar ve tanımlarla hesaplanır. Hiçbir şey veritabanına yazılmaz.</p></div>`;
  const T=S.ozet.toplam, faturasiz=S.ileri.filter(r=>!r.FATURALI), it=S.kayip.filter(k=>k.DURUM==='İTİRAZ');
  const u=S.uyarilar, uy=[u.bshYok?'BSH hakediş detayı yok — ödeme karşılaştırılamadı.':'',u.yeniPaket?`${u.yeniPaket} yeni paket tanımsız (2 · Kampanya tanımları).`:'',u.oranYok?`${u.oranYok} satırda oran yok.`:'',u.tanimsiz?`${u.tanimsiz} satır tanımsız pakette.`:'',u.eksikSet?`${u.eksikSet} satırda eksik bundle seti.`:'',u.tarihDisi?`${u.tarihDisi} satır kampanya tarihleri dışında faturalanmış.`:''].filter(Boolean);
  const satirlar=S.kontrol.filter(r=>(!fqHkm.filtre||hkmKova(r['SONUÇ'])===fqHkm.filtre)&&(!fqHkm.arama||[r['FATURA NO'],r['ÜRÜN'],r.PAKET,r['MÜŞTERİ'],r['ŞUBE']].join(' ').toLocaleUpperCase('tr-TR').includes(fqHkm.arama.toLocaleUpperCase('tr-TR'))));
  return `<div class="card">${ust}
    <div class="hkm-kart"><div>Beklenen<b>${hkmPara(T.beklenen)}</b></div><div>BSH ödenen<b>${hkmPara(T.odenen)}</b></div><div>Açık (beklenen − ödenen)<b>${hkmPara(T.acik)}</b></div>
    <div>↳ Sarkan<b>${hkmPara(T.sarkan)}</b></div><div>↳ Ödenmedi — itiraz<b>${hkmPara(T.itiraz)}</b></div><div>İtiraz formuna girecek<b>${it.length} kalem</b></div>
    <div>Faturasız ileri teslim<b>${faturasiz.length} · ${hkmPara(faturasiz.reduce((a,r)=>a+(r['BEKLENEN (KDV HARİÇ)']||0),0))}</b></div></div>
    ${uy.map(x=>`<div class="hkm-uyari">⚠ ${esc(x)}</div>`).join('')}
    <div class="hkm-kaydir" style="max-height:none"><table><thead><tr><th>Kampanya ayı / tür</th><th class="num">Satır</th><th class="num">Beklenen</th><th class="num">BSH ödenen</th><th class="num">Açık</th><th class="num">Sarkan</th><th class="num">İtiraz</th></tr></thead><tbody>
    ${S.ozet.kirilim.concat([{etiket:'TOPLAM',...T}]).map(k=>`<tr${k.etiket==='TOPLAM'?' style="font-weight:700"':''}><td>${esc(k.etiket)}</td><td class="num">${k.satir}</td><td class="num">${hkmPara(k.beklenen)}</td><td class="num">${hkmPara(k.odenen)}</td><td class="num">${hkmPara(k.acik)}</td><td class="num">${hkmPara(k.sarkan)}</td><td class="num">${hkmPara(k.itiraz)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="row"><select onchange="fqHkm.filtre=this.value;hkmCiz()">${HKM_KOVA.map(([k,a])=>`<option value="${k}"${fqHkm.filtre===k?' selected':''}>${a}</option>`).join('')}</select>
    <input placeholder="Fatura no, ürün, müşteri, paket…" value="${esc(fqHkm.arama)}" onchange="fqHkm.arama=this.value;hkmCiz()" style="min-width:260px"><span class="mut">${satirlar.length} satır${satirlar.length>500?' (ilk 500 gösteriliyor; tamamı Excel raporunda)':''}</span></div>
    <div class="hkm-kaydir" style="margin-top:8px"><table><thead><tr><th>Sonuç</th><th>Şube</th><th>Fatura tarihi</th><th>Fatura no</th><th>Ürün</th><th>Paket</th><th>Tür</th><th class="num">Adet</th><th class="num">Beklenen</th><th class="num">BSH ödenen</th><th class="num">Açık</th><th>Uyarı</th></tr></thead><tbody>
    ${satirlar.slice(0,500).map(r=>`<tr><td title="${esc(r['SONUÇ'])}">${esc(String(r['SONUÇ']).slice(0,60))}</td><td>${esc(r['ŞUBE']||'')}</td><td>${esc(FiyatIQHakedis.tMetin(r['FATURA TARİHİ']))}</td><td>${esc(r['FATURA NO'])}</td><td>${esc(r['ÜRÜN'])}</td><td title="${esc(r.PAKET)}">${esc(String(r.PAKET).slice(0,42))}</td><td>${esc(r['TÜR'])}</td><td class="num">${r.ADET}</td><td class="num">${hkmPara(r['TÜR']==='BUNDLE'?r['SET BEKLENEN']:r['BEKLENEN (KDV HARİÇ)'])}</td><td class="num">${hkmPara(r['TÜR']==='BUNDLE'?r['SET ÖDENEN']:r['BSH ÖDENEN'])}</td><td class="num">${hkmPara(r['AÇIK (BEKLENEN − ÖDENEN)'])}</td><td class="mut" title="${esc(r.UYARI)}">${esc(String(r.UYARI||'').slice(0,50))}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

// ------------------------------------------------------------------ 4 · İTİRAZ ve İLERİ TESLİM
function hkmItirazHTML(){
  const S=fqHkm.sonuc; if(!S)return `<div class="card"><p class="mut">Önce 3 · Sonuç sekmesinde hesapla.</p><button onclick="hkmSekme('sonuc');hkmHesapla()">▶ Hesapla</button></div>`;
  const H=FiyatIQHakedis, it=S.kayip.filter(k=>k.DURUM==='İTİRAZ');
  return `<div class="card"><h3 style="margin-top:0">BSH itiraz kalemleri <span class="badge">${S.kayip.length}</span></h3>
    <p class="mut" style="font-size:13px">Göndermeden önce her satış için müşterinin <b>KVKK SMS onayı</b> alınmış olmalı (BSH kuralı). BSH itirazı mail ile kabul etmez; form gönderilir. Formda tutar yoktur.</p>
    <div class="row"><button onclick="hkmFormIndir()" ${it.length?'':'disabled'}>📄 İtiraz formunu indir (${it.length})</button>
    <button class="ghost" onclick="hkmGonderildi()" ${it.length?'':'disabled'}>✓ Formu BSH'ye gönderdim — işaretle</button></div>
    <div class="hkm-kaydir" style="margin-top:8px"><table><thead><tr><th>Durum</th><th>Mağaza</th><th>Fatura no</th><th>Fatura tarihi</th><th>Müşteri</th><th>Ürün</th><th>Kampanya</th><th>Tür</th><th class="num">Tutar</th><th>Kaynak</th></tr></thead><tbody>
    ${S.kayip.map(k=>`<tr><td>${esc(k.DURUM)}</td><td>${esc(k['MAĞAZA'])}</td><td>${esc(k['FATURA NO'])}</td><td>${esc(H.tMetin(k['FATURA TARİHİ']))}</td><td>${esc(k['MÜŞTERİ']||'')}</td><td>${esc(k['ÜRÜN'])}</td><td>${esc(k.KAMPANYA)}</td><td>${esc(k['TÜR'])}</td><td class="num">${hkmPara(k['TUTAR (KDV HARİÇ)'])}</td><td>${esc(k.KAYNAK)}</td></tr>`).join('')||'<tr><td colspan="10" class="mut">İtiraz edilecek kalem yok. (Satış takip sağlamasından gelen kayıplar Faz 1B ile eklenecek.)</td></tr>'}
    </tbody></table></div></div>
    <div class="card"><h3 style="margin-top:0">Gönderilmiş itirazlar <span class="badge">${S.eskiDurum.length}</span></h3><div class="hkm-kaydir"><table><thead><tr><th>Durum</th><th>Fatura no</th><th>Ürün</th><th>Kampanya</th><th>Gönderim</th><th>BSH dönem</th><th class="num">BSH ödediği</th></tr></thead><tbody>
    ${S.eskiDurum.map(e=>`<tr><td>${esc(e.DURUM)}</td><td>${esc(e['FATURA NO'])}</td><td>${esc(e['ÜRÜN'])}</td><td>${esc(e.KAMPANYA)}</td><td>${esc(H.tMetin(e['TARİH']))}</td><td>${esc(e['BSH DÖNEM']||'')}</td><td class="num">${hkmPara(e['BSH ÖDEDİĞİ'])}</td></tr>`).join('')||'<tr><td colspan="7" class="mut">Yok.</td></tr>'}</tbody></table></div></div>
    <div class="card"><h3 style="margin-top:0">İleri teslim <span class="badge">${S.ileri.length}</span></h3>
    <p class="mut" style="font-size:13px">Hakediş son tarihine kadar hemen teslime çevrilip faturalanmalı; faturalananlar faturanın kesildiği ayın BSH hakedişinde gelir.</p>
    <div class="hkm-kaydir"><table><thead><tr><th>Mağaza</th><th>Kampanya ayı</th><th>Diva belge no</th><th>Diva tarihi</th><th>Müşteri</th><th>Ürün</th><th>Kampanya</th><th class="num">Beklenen</th><th>Gerçek fatura</th><th>Son tarih</th><th class="num">Kalan gün</th><th>Durum</th></tr></thead><tbody>
    ${S.ileri.map(x=>{ const kalan=x.FATURALI?'':H.gunFark(x['SON TARİH'],new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date()));
      return `<tr><td>${esc(x['MAĞAZA'])}</td><td>${esc(H.ayMetni(x['KAMPANYA AYI']))}</td><td>${esc(x['FATURA NO'])}</td><td>${esc(H.tMetin(x['FATURA TARİHİ']))}</td><td>${esc(x['MÜŞTERİ']||'')}</td><td>${esc(x['ÜRÜN'])}</td><td title="${esc(x.PAKET)}">${esc(String(x.PAKET).slice(0,40))}</td><td class="num">${hkmPara(x['BEKLENEN (KDV HARİÇ)'])}</td><td>${esc(x['GERÇEK FATURA NO']||'')}</td><td>${esc(H.tMetin(x['SON TARİH']))}</td><td class="num">${kalan}</td><td>${esc((x['RİSK']?'RİSK — '+x['RİSK']+' · ':'')+String(x['SONUÇ']).replace('SARKAN — ',''))}</td></tr>`; }).join('')||'<tr><td colspan="12" class="mut">Yok.</td></tr>'}
    </tbody></table></div></div>`;
}
async function hkmGonderildi(){
  const S=fqHkm.sonuc; if(!S)return; const it=S.kayip.filter(k=>k.DURUM==='İTİRAZ'); if(!it.length)return;
  const H=FiyatIQHakedis, bugun=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date());
  if(!await hkmOnay(`${it.length} itiraz kalemi "BSH'ye gönderildi" olarak işaretlenecek. Bir sonraki hesapta forma tekrar girmezler; BSH dosyalarında ödenip ödenmedikleri izlenir. Devam edilsin mi?`,'Gönderildi olarak işaretle'))return;
  const rows=it.map(k=>({marka:fqHkm.marka,fatura_no:k['FATURA NO'],degisen_fatura_no:k['DEĞİŞEN FATURA NO']||null,urun_kodu:k['ÜRÜN'],kampanya_adi:k.KAMPANYA,kampanya_norm:H.norm(k.KAMPANYA),
    tutar_kdv_haric:k['TUTAR (KDV HARİÇ)'],kaynak:k.KAYNAK,form_adi:fqHkm.sonFormAdi||null,gonderim_tarihi:bugun}));
  const {error}=await sb.from('hakedis_itiraz').upsert(rows,{onConflict:'isletme_id,marka,fatura_no,urun_kodu,kampanya_norm',ignoreDuplicates:true});
  if(error){ hkmMsg(error.message,true); return; } await hkmTanimYukle(); await hkmHesapla(); fqHkm.sekme='itiraz'; hkmCiz(); hkmMsg(`${rows.length} kalem gönderildi olarak işaretlendi.`);
}

// ------------------------------------------------------------------ Excel çıktıları (renksiz)
function hkmSayfa(aoa,tarihKol=[],paraKol=[]){
  const H=FiyatIQHakedis, ws=XLSX.utils.aoa_to_sheet(aoa.map(r=>r.map(v=>v===undefined?null:v)));
  const ref=XLSX.utils.decode_range(ws['!ref']||'A1');
  for(let R=ref.s.r;R<=ref.e.r;R++) for(let C=ref.s.c;C<=ref.e.c;C++){ const a=XLSX.utils.encode_cell({r:R,c:C}), c=ws[a]; if(!c)continue;
    if(tarihKol.includes(C)&&typeof c.v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(c.v)){ c.t='n'; c.v=(Date.parse(c.v)-Date.UTC(1899,11,30))/86400000; c.z='dd.mm.yyyy'; }
    else if(paraKol.includes(C)&&typeof c.v==='number') c.z='#,##0.00'; }
  return ws;
}
function hkmTablo(kolonlar,satirlar){ return [kolonlar].concat(satirlar.map(r=>kolonlar.map(k=>{ const v=r[k]; return typeof v==='boolean'?(v?'EVET':''):v===undefined?null:v; }))); }
function hkmDosyaAdi(tur){ const d=new Date(), p=n=>String(n).padStart(2,'0'); return `${fqHkm.marka.toUpperCase()} ${tur} ${p(d.getDate())}${p(d.getMonth()+1)}${d.getFullYear()}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`; }
function hkmFormIndir(){
  const S=fqHkm.sonuc; if(!S)return; const H=FiyatIQHakedis, it=S.kayip.filter(k=>k.DURUM==='İTİRAZ'); const f=H.itirazFormuAoa(it);
  const ws=hkmSayfa(f.aoa,[10]); ws['!merges']=f.merges.map(m=>XLSX.utils.decode_range(m)); ws['!cols']=f.genislik.map(w=>({wch:w}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
  const ad=hkmDosyaAdi('İTİRAZ TABLOSU'); fqHkm.sonFormAdi=ad; XLSX.writeFile(wb,ad);
}
function hkmRaporIndir(){
  const S=fqHkm.sonuc; if(!S)return; const H=FiyatIQHakedis, wb=XLSX.utils.book_new();
  const T=S.ozet.toplam, oz=[[`${fqHkm.marka.toUpperCase()} HAKEDİŞ KONTROL — ${new Date().toLocaleDateString('tr-TR')} · FiyatIQ`],[],['1) BEKLENEN HAKEDİŞ (Diva kampanya raporundan)'],
    ['Kampanya ayı / tür','Satır','Beklenen (KDV hariç)','BSH ödenen','AÇIK (beklenen − ödenen)','↳ ödenen satırlardaki tutar farkı','↳ sarkan (sonraki hakedişte beklenen)','↳ ödenmedi — itiraz','Hesaplanamayan satır']];
  for(const k of S.ozet.kirilim.concat([{etiket:'TOPLAM',...T}])) oz.push([k.etiket,k.satir,k.beklenen,k.odenen,k.acik,k.tutarFarki,k.sarkan,k.itiraz,k.hesaplanamayan]);
  oz.push([],['2) BSH KARŞILAŞTIRMA SONUCU'],['Sonuç','Satır','Beklenen (KDV hariç)','BSH ödenen','AÇIK (beklenen − ödenen)']);
  for(const kv of S.ozet.sonuclar){ oz.push([kv.kova]); for(const s of kv.satirlar) oz.push(['   '+s.sonuc,s.satir,s.beklenen,s.odenen,s.acik]); }
  const wsO=hkmSayfa(oz,[],[2,3,4,5,6,7]); wsO['!cols']=[{wch:58},{wch:10},{wch:20},{wch:20},{wch:20},{wch:20},{wch:20},{wch:20},{wch:12}]; XLSX.utils.book_append_sheet(wb,wsO,'ÖZET');
  const kk=['SONUÇ','ŞUBE','FATURA TARİHİ','FATURA NO','İLERİ TESLİM','GERÇEK FATURA NO','GERÇEK FATURA TARİHİ','MÜŞTERİ','ÜRÜN','PAKET','TÜR','KAMPANYA AYI','ADET','BİRİM HAKEDİŞ','BEKLENEN (KDV HARİÇ)','BSH ÖDENEN','AÇIK (BEKLENEN − ÖDENEN)','SET BEKLENEN','SET ÖDENEN','BSH DÖNEM','UYARI','ORAN KAYNAĞI','BSH KAMPANYA ADI','BSH TÜR','DİVA DOSYASI'];
  const ekle=(ad,kol,rows,tar,para)=>{ const ws=hkmSayfa(hkmTablo(kol,rows),tar.map(k=>kol.indexOf(k)),para.map(k=>kol.indexOf(k))); ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(rows.length,1),c:kol.length-1}})}; XLSX.utils.book_append_sheet(wb,ws,ad); };
  ekle('HAKEDİŞ KONTROL',kk,S.kontrol,['FATURA TARİHİ','GERÇEK FATURA TARİHİ'],['BİRİM HAKEDİŞ','BEKLENEN (KDV HARİÇ)','BSH ÖDENEN','AÇIK (BEKLENEN − ÖDENEN)','SET BEKLENEN','SET ÖDENEN']);
  ekle('BUNDLE SETLERİ',['FATURA NO','PAKET','ŞUBE','FATURA TARİHİ','MÜŞTERİ','ÜRÜNLER','ÜRÜN SAYISI','BEKLENEN SET HAKEDİŞİ (KDV HARİÇ)','UYARI'],S.setler,['FATURA TARİHİ'],['BEKLENEN SET HAKEDİŞİ (KDV HARİÇ)']);
  ekle("BSH'DE VAR BİZDE YOK",['FATURA NO','ÜRÜN','BSH DEĞİŞEN FATURA NO','BSH KAMPANYA','BSH TÜR','BSH YÖNTEM','BSH HAKEDİŞ','BSH DÖNEM','BSH FATURA TARİHİ','SATIŞ TİPİ','İADE DURUMU','BSH DOSYASI'],S.bshFazla,['BSH FATURA TARİHİ'],['BSH HAKEDİŞ']);
  ekle('İTİRAZ',['DURUM','MAĞAZA','FATURA NO','FATURA TARİHİ','MÜŞTERİ','ÜRÜN','KAMPANYA','TÜR','TUTAR (KDV HARİÇ)','TUTAR KAYNAĞI','KAYNAK','KANIT'],S.kayip,['FATURA TARİHİ'],['TUTAR (KDV HARİÇ)']);
  ekle('İLERİ TESLİM',['MAĞAZA','KAMPANYA AYI','FATURA NO','FATURA TARİHİ','MÜŞTERİ','ÜRÜN','PAKET','TÜR','BEKLENEN (KDV HARİÇ)','GERÇEK FATURA NO','GERÇEK FATURA TARİHİ','SON TARİH','RİSK','SONUÇ'],S.ileri,['FATURA TARİHİ','GERÇEK FATURA TARİHİ','SON TARİH'],['BEKLENEN (KDV HARİÇ)']);
  ekle('ORAN TABLOSU',['AY','TİP','KOD','ORAN','BAŞLANGIÇ','KAYNAK'],S.oranlar.slice().sort((a,b)=>a.AY-b.AY||String(a['TİP']).localeCompare(b['TİP'])||String(a.KOD).localeCompare(b.KOD)||String(a['BAŞLANGIÇ']).localeCompare(b['BAŞLANGIÇ'])),['BAŞLANGIÇ'],['ORAN']);
  XLSX.writeFile(wb,hkmDosyaAdi('HAKEDİŞ KONTROL'));
}
