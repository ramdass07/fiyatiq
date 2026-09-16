/* FiyatIQ v11.11 — STOK MODÜLÜ (14 Eyl 2026, Burak'ın 2 Eyl bayi geri bildirimi üzerine).
   Satışta düşüm + süreli rezerve + az stok uyarısı.
   İLKE: Sabah stok yüklemesi AYNEN devam eder ve fotoğrafı tazeler; bu modül fotoğraf
   SONRASI gün içi hareketleri (stok_hareket) düşer. Yükleme rezerveleri SİLMEZ.
   SQL altyapısı: supabase/migrations/20260914150000_stok_modulu_v1111.sql
   SQL henüz çalıştırılmadıysa modül SESSİZCE devre dışı kalır (hareket sorgusu hata
   verirse net stok eski davranışla, düzeltmesiz gösterilir). */
'use strict';
const FQ_AZ_STOK=2;                       // net ≤ 2 → "SON X ADET" (Burak, 14 Eyl: global eşik)
const FQ_REZERVE_SAAT=[24,48,72,168];     // seçenekler; varsayılan 48
const fqStokM={satis:{record:null,items:[],busy:false,zorla:false},rez:{row:null,busy:false},panelBusy:false,tabloYok:false};

document.head.insertAdjacentHTML('beforeend',`<style>
 .fq-stok-grid{display:grid;grid-template-columns:1fr auto auto;gap:8px 14px;align-items:center;margin-top:10px}
 .fq-stok-grid .mut{font-size:12px}
 .fq-rez-badge{background:#0ea5e9;color:#03222f}
 .fq-son-badge{background:var(--warn);color:#1a1300}
 #fqStokZorlaRow{display:block;margin-top:6px;color:var(--warn)}
 #fqStokZorlaRow[hidden]{display:none!important}
 #fqRezMsg:empty,#fqStokSatisMsg:empty{display:none}
 .fq-rez-table td,.fq-rez-table th{font-size:12.5px}
 </style>`);
document.body.insertAdjacentHTML('beforeend',`
 <dialog id="fqStokSatisDialog" class="fq-dialog" aria-labelledby="fqStokSatisTitle" style="max-width:640px">
  <div class="sale-heading"><h2 id="fqStokSatisTitle">Stoktan düş</h2><button class="ghost" onclick="fqStokSatisKapat()">Kapat</button></div>
  <p class="mut">Satıldı işaretlenen teklifin ürünleri seçtiğin depodan düşülür. Sabah stok yüklemesi bu düşümleri silmez; dosya zaten gerçek sayımı getirdiği için düşümler yalnız dosya tarihinden sonraki satışlar için sayılır.</p>
  <div id="fqStokSatisList" class="fq-stok-grid"></div>
  <p id="fqStokSatisMsg" role="status" style="margin-top:10px"></p>
  <label id="fqStokZorlaRow" hidden><input type="checkbox" id="fqStokZorla"> Kayıtlar eski olabilir — yetersiz görünse de <b>yine de düş</b> (eksiye iner)</label>
  <div class="fq-actions"><button class="ghost" onclick="fqStokSatisKapat()">Stok düşmeden kapat</button><button id="fqStokSatisOnay" onclick="fqStokSatisOnayla()">✓ Stoktan düş</button></div>
 </dialog>
 <dialog id="fqRezerveDialog" class="fq-dialog" aria-labelledby="fqRezTitle" style="max-width:520px">
  <div class="sale-heading"><h2 id="fqRezTitle">🔒 Rezerve koy</h2><button class="ghost" onclick="$('fqRezerveDialog').close()">Kapat</button></div>
  <p id="fqRezUrun"></p>
  <div class="fq-follow-grid">
   <label>Depo<select id="fqRezDepo"></select></label>
   <label>Adet<input id="fqRezAdet" type="number" min="1" max="99" step="1" value="1"></label>
   <label>Süre<select id="fqRezSure">${FQ_REZERVE_SAAT.map(h=>`<option value="${h}"${h===48?' selected':''}>${h===168?'7 gün':h+' saat'}</option>`).join('')}</select></label>
   <label class="fq-follow-wide">Not · isteğe bağlı<input id="fqRezNot" maxlength="200" placeholder="Örn. Ayşe Hanım, kapora aldı, cuma teslim"></label>
  </div>
  <p class="mut" style="margin-top:8px">Süre dolunca rezerve kendiliğinden serbest kalır; Rezerveler panelinden uzatabilir veya kaldırabilirsin.</p>
  <p id="fqRezMsg" role="status"></p>
  <div class="fq-actions"><button class="ghost" onclick="$('fqRezerveDialog').close()">Vazgeç</button><button id="fqRezOnay" onclick="fqRezerveOnayla()">✓ Rezerve koy</button></div>
 </dialog>
 <dialog id="fqRezervePanel" class="fq-dialog" aria-labelledby="fqRezPanelTitle">
  <div class="sale-heading"><h2 id="fqRezPanelTitle">🔒 Aktif rezerveler</h2><button class="ghost" onclick="$('fqRezervePanel').close()">Kapat</button></div>
  <p class="mut">Bu mağaza havuzunun süresi dolmamış rezerveleri. Süresi dolan kendiliğinden düşer ve burada görünmez.</p>
  <p id="fqRezPanelMsg" role="status"></p><div id="fqRezPanelList"></div>
 </dialog>`);

/* ---------- hareket okuma ve net düzeltmesi ---------- */
async function fqStokHareket(kod,mk){
  if(fqStokM.tabloYok)return null;                 // SQL kurulmadı — bir kez öğren, sormayı bırak
  try{
    const {data,error}=await sb.from('stok_hareket')
      .select('id,depo,tip,adet,rezerve_bitis,created_at')
      .eq('bayi_id',stokSahibi()).eq('marka',mk).eq('model_kodu',(kod||'').toUpperCase()).eq('aktif',true);
    if(error){ if((error.code==='42P01')||/stok_hareket/.test(error.message||''))fqStokM.tabloYok=true; return null; }
    return data||[];
  }catch(e){ return null; }
}
// Depo başına {satis, rezerve}: satış düşümü o deponun EN YENİ stok_tarihi'nden itibaren sayılır
// (aynı gün dahil — mükerrer satışı önlemek için temkinli taraf seçildi; sapma ertesi sabah
// dosyayla kendini düzeltir). Fotoğrafı olmayan depoda tüm satışlar sayılır.
function fqHareketOzet(rows,freshness){
  const out={mars:{satis:0,rezerve:0},horoz:{satis:0,rezerve:0},kadikoy:{satis:0,rezerve:0},toplamSatis:0,toplamRezerve:0};
  if(!Array.isArray(rows))return out;
  const now=Date.now(),snap={};
  ((freshness&&freshness.depots)||[]).forEach(d=>{
    const ds=(d.dates||[]).filter(x=>x.kind!=='ayrilmis'&&typeof x.value==='string'&&x.value).map(x=>x.value).sort();
    snap[d.key]=ds.length?ds[ds.length-1]:null;
  });
  for(const h of rows){
    const d=out[h.depo]; if(!d||!Number.isFinite(+h.adet))continue;
    if(h.tip==='rezerve'){ const t=Date.parse(h.rezerve_bitis||''); if(Number.isFinite(t)&&t>now){ d.rezerve+=+h.adet; out.toplamRezerve+=+h.adet; } }
    else if(h.tip==='satis'){ const s=snap[h.depo]; if(!s||String(h.created_at||'').slice(0,10)>=s){ d.satis+=+h.adet; out.toplamSatis+=+h.adet; } }
  }
  return out;
}
// refetch / stokSorgula sonrası tek noktadan düzeltme
async function fqStokDuzelt(r,kod,mk){
  r.rezerveAdet=0;r.satisDusum=0;r.depoHareket=null;
  const rows=await fqStokHareket(kod,mk);
  if(rows===null)return false;                      // altyapı yok/erişilemedi → dokunma
  const hz=fqHareketOzet(rows,r.stockFreshness);
  r.depoHareket=hz;r.rezerveAdet=hz.toplamRezerve;r.satisDusum=hz.toplamSatis;
  if(r.netStok!=null)r.netStok=r.netStok-hz.toplamSatis-hz.toplamRezerve;
  return true;
}
function fqStokRozet(r){
  if(!r||!r.kod)return '';
  let h='';
  if(+r.rezerveAdet>0)h+=` <span class="prim-badge fq-rez-badge" title="Süresi dolmamış rezerve — 🔒 Rezerveler panelinden yönetilir" style="cursor:pointer" onclick="fqRezervePanelAc()">🔒 ${r.rezerveAdet} REZERVE</span>`;
  if(r.netStok!=null&&r.netStok>0&&r.netStok<=FQ_AZ_STOK)h+=` <span class="prim-badge fq-son-badge" title="Net satılabilir stok eşiğin altında — mükerrer satış riski">⚠ SON ${r.netStok} ADET</span>`;
  return h;
}

/* ---------- depo seçenekleri (net'leriyle) ---------- */
function fqDepoAd(k){ return k==='mars'?'Mars':k==='horoz'?'Horoz':(typeof depoAdi==='function'?depoAdi():'Mağaza'); }
async function fqDepoNetleri(kod,mk){
  const [stRes,hrows]=await Promise.all([
    sb.from('stok').select('depo,tip,adet,stok_tarihi').eq('model_kodu',(kod||'').toUpperCase()).eq('marka',mk).eq('bayi_id',stokSahibi()),
    fqStokHareket(kod,mk)
  ]);
  if(stRes.error)throw new Error('Stok sorgulanamadı'+(stRes.error.message?' — '+stRes.error.message:'')+'.');
  const fresh=stockFreshnessFromRows(Array.isArray(stRes.data)?stRes.data:[]);
  if(!fresh)throw new Error('Stok kayıtları doğrulanamadı.');
  const hz=fqHareketOzet(hrows||[],fresh);
  return ['mars','horoz','kadikoy'].map(k=>{
    const d=(fresh.depots||[]).find(x=>x.key===k)||{mevcut:0,ayrilmis:0};
    return {depo:k,ad:fqDepoAd(k),net:(d.mevcut-d.ayrilmis)-(hz[k].satis+hz[k].rezerve)};
  });
}
function fqDepoSelectHTML(id,netler,disabled){
  const enCok=netler.reduce((a,b)=>b.net>a.net?b:a,netler[0]);
  return `<select id="${id}"${disabled?' disabled':''}>${netler.map(n=>`<option value="${n.depo}"${n.depo===enCok.depo?' selected':''}>${esc(n.ad)} (net ${n.net})</option>`).join('')}</select>`;
}

/* ---------- SİPARİŞ FORMU = SATIŞ (15 Eyl, Burak kararı) ----------
   Sipariş formu alınınca teklif kendiliğinden SATILDI olur ve stok düşüm penceresi açılır.
   Pencere "Stok düşmeden kapat" ile kapatılırsa düşüm yapılmaz ama Satıldı kalır —
   gerekirse Müşteri takibi ekranından durum geri alınır (düşümler de otomatik geri gelir). */
async function fqSiparisHook(teklifId){
  try{
    if(!teklifId||fqStokM.tabloYok||!authUid)return;
    let q=sb.from('teklifler').select('id,bayi_id,marka,durum,satirlar,takip_surumu').eq('id',teklifId);
    if(!isEditor())q=q.eq('bayi_id',authUid);
    const {data,error}=await q.single(); if(error||!data)return;
    if(data.durum!=='satildi'){
      let u=sb.from('teklifler').update({durum:'satildi',sonraki_arama:null}).eq('id',teklifId).eq('takip_surumu',data.takip_surumu);
      if(!isEditor())u=u.eq('bayi_id',authUid);
      const r=await u.select('id').single();
      if(r.error||!r.data)return;           // başka ekranda değişti — sessizce vazgeç, çakışma yaratma
      if($('fqMyQuotes').open&&typeof fqLoadMyQuotes==='function')fqLoadMyQuotes();
    }
    fqStokSatisAc({...data,durum:'satildi'},'Sipariş formu alındı — teklif Satıldı olarak işaretlendi.');
  }catch(e){}
}

/* ---------- SATIŞTA DÜŞÜM (Satıldı işaretinden sonra) ---------- */
function fqStokTakipHook(prev,data){
  try{
    if(fqStokM.tabloYok)return;
    const once=(prev&&prev.durum)||'teklif';
    if(data.durum==='satildi')fqStokSatisAc(data);
    else if(once==='satildi'&&data.durum!=='satildi')fqStokSatisGeriAl(data);
  }catch(e){}
}
async function fqStokSatisAc(record,kaynakNot){
  const s=record.satirlar&&typeof record.satirlar==='object'&&!Array.isArray(record.satirlar)?record.satirlar:{};
  const items=(Array.isArray(s.items)?s.items:[]).filter(x=>x&&x.model).map(x=>({model:String(x.model).toUpperCase(),ad:x.ad||'',adet:Math.max(1,Math.round(+x.adet||1))}));
  if(!items.length)return;
  // Marka: takip kaydından; eksikse (eski kayıt/eksik alan) panelde seçili marka — asla boş gitmez
  // (15 Eyl dersi: markasız stok sorgusu enum hatasıyla "Stok sorgulanamadı" veriyordu).
  const mk=String(record.marka||brand||'').toLowerCase();
  if(mk!=='bosch'&&mk!=='siemens')return;
  fqStokM.satis={record,items,mk,busy:false,zorla:false};
  const list=$('fqStokSatisList'),msg=$('fqStokSatisMsg');
  list.innerHTML='<span class="mut">Depo stokları sorgulanıyor…</span>';msg.textContent=kaynakNot||'';
  $('fqStokZorlaRow').hidden=true;$('fqStokZorla').checked=false;$('fqStokSatisOnay').disabled=true;
  const d=$('fqStokSatisDialog');if(!d.open)d.showModal();
  try{
    const netler=await Promise.all(items.map(x=>fqDepoNetleri(x.model,mk)));
    if(!d.open)return;
    list.innerHTML='<b>Ürün</b><b>Adet</b><b>Depo</b>'+items.map((x,i)=>
      `<span><b>${esc(x.model)}</b><br><span class="mut">${esc(x.ad)}</span></span><span>×${x.adet}</span><span>${fqDepoSelectHTML('fqStokDepo'+i,netler[i])}</span>`).join('');
    $('fqStokSatisOnay').disabled=false;
  }catch(e){ list.innerHTML='';msg.textContent=(kaynakNot?kaynakNot+' ':'')+'Depo stokları okunamadı: '+e.message; }
}
function fqStokSatisKapat(){ if(fqStokM.satis.busy)return; $('fqStokSatisDialog').close(); }
async function fqStokSatisOnayla(){
  const st=fqStokM.satis; if(!st.record||st.busy)return;
  st.busy=true;const msg=$('fqStokSatisMsg'),btn=$('fqStokSatisOnay');btn.disabled=true;msg.textContent='Düşülüyor…';
  try{
    const satirlar=st.items.map((x,i)=>({model_kodu:x.model,marka:st.mk,depo:($('fqStokDepo'+i)||{}).value||'mars',adet:x.adet}));
    const zorla=!$('fqStokZorlaRow').hidden&&$('fqStokZorla').checked;
    const {data,error}=await sb.rpc('fq_stok_satis_kaydet',{p_teklif_id:st.record.id,p_satirlar:satirlar,p_zorla:zorla});
    if(error){
      if(/YETERSIZ_STOK/.test(error.message||'')){
        let detay='';try{ const m=error.message.match(/\[.*\]/s); if(m)detay=JSON.parse(m[0]).map(e=>`${e.model_kodu} · ${fqDepoAd(e.depo)}: net ${e.net}, istenen ${e.istenen}`).join(' — '); }catch(e2){}
        msg.textContent='⚠ Yetersiz stok: '+(detay||'seçilen depoda yeterli net stok görünmüyor.')+' Başka depo seç ya da "yine de düş" işaretle.';
        $('fqStokZorlaRow').hidden=false;btn.disabled=false;st.busy=false;return;
      }
      throw error;
    }
    msg.textContent='✓ '+st.items.reduce((a,x)=>a+x.adet,0)+' adet stoktan düşüldü.'+(zorla?' (yetersiz kayda rağmen zorlandı)':'');
    setTimeout(()=>{ if($('fqStokSatisDialog').open)$('fqStokSatisDialog').close(); },1600);
    quoteRows.forEach(r=>{ if(r.kod&&st.items.some(x=>x.model===String(r.kod).toUpperCase()))refetch(r); });
  }catch(e){ msg.textContent='Düşüm yapılamadı: '+(e.message||e)+' (stok modülü SQL dosyası çalıştırıldı mı?)';btn.disabled=false; }
  finally{ st.busy=false; }
}
async function fqStokSatisGeriAl(record){
  try{
    const {data,error}=await sb.rpc('fq_stok_satis_geri_al',{p_teklif_id:record.id});
    if(!error&&data>0){ const m=$('fqFollowMessage'); if(m)m.textContent='✓ Takip kaydedildi. Bu teklifin '+data+' stok düşümü geri alındı.'; }
  }catch(e){}
}

/* ---------- REZERVE ---------- */
async function fqRezerveDialog(i){
  const r=quoteRows[i]; if(!r||!r.kod)return;
  fqStokM.rez={row:r,busy:false};
  $('fqRezUrun').innerHTML=`<b>${esc(r.kod)}</b> ${esc(r.ad||'')}`;
  $('fqRezAdet').value='1';$('fqRezNot').value='';$('fqRezMsg').textContent='';
  $('fqRezDepo').innerHTML='<option>—</option>';$('fqRezOnay').disabled=true;
  const d=$('fqRezerveDialog');if(!d.open)d.showModal();
  try{
    const netler=await fqDepoNetleri(r.kod,brand);
    if(!d.open)return;
    $('fqRezDepo').outerHTML=fqDepoSelectHTML('fqRezDepo',netler);
    $('fqRezOnay').disabled=false;
  }catch(e){ $('fqRezMsg').textContent='Depo stokları okunamadı: '+e.message; }
}
async function fqRezerveOnayla(){
  const st=fqStokM.rez; if(!st.row||st.busy)return;
  const adet=Math.round(+$('fqRezAdet').value||0);
  if(adet<1||adet>99){ $('fqRezMsg').textContent='Adet 1-99 arası olmalı.';return; }
  st.busy=true;$('fqRezOnay').disabled=true;$('fqRezMsg').textContent='Rezerve konuyor…';
  try{
    const {error}=await sb.rpc('fq_rezerve_koy',{p_model_kodu:String(st.row.kod).toUpperCase(),p_marka:brand,
      p_depo:$('fqRezDepo').value,p_adet:adet,p_saat:+$('fqRezSure').value||48,p_not:$('fqRezNot').value.trim()||null});
    if(error){
      $('fqRezMsg').textContent=/YETERSIZ_STOK/.test(error.message||'')?'⚠ Bu depoda yeterli net stok yok — başka depo seç.':'Rezerve konamadı: '+error.message+' (stok modülü SQL dosyası çalıştırıldı mı?)';
      $('fqRezOnay').disabled=false;st.busy=false;return;
    }
    $('fqRezMsg').textContent='✓ Rezerve kondu. Süre dolunca kendiliğinden serbest kalır.';
    const kod=st.row.kod;setTimeout(()=>{ if($('fqRezerveDialog').open)$('fqRezerveDialog').close(); },1400);
    quoteRows.forEach(r=>{ if(r.kod===kod)refetch(r); });
  }catch(e){ $('fqRezMsg').textContent='Rezerve konamadı: '+(e.message||e);$('fqRezOnay').disabled=false; }
  finally{ st.busy=false; }
}
async function fqRezervePanelAc(){
  const d=$('fqRezervePanel'),msg=$('fqRezPanelMsg'),list=$('fqRezPanelList');
  if(!d.open)d.showModal();
  msg.textContent='Yükleniyor…';list.innerHTML='';
  try{
    const {data,error}=await sb.rpc('fq_rezerve_listesi',{p_marka:brand});
    if(error)throw error;
    msg.textContent='';
    if(!data||!data.length){ list.innerHTML='<p class="mut">Aktif rezerve yok.</p>';return; }
    list.innerHTML=`<table class="fq-rez-table"><thead><tr><th>Ürün</th><th>Depo</th><th class="num">Adet</th><th>Kalan</th><th>Koyan</th><th>Not</th><th></th></tr></thead><tbody>`+
      data.map(x=>{ const saat=Math.floor(x.kalan_dakika/60),dk=x.kalan_dakika%60;
        return `<tr><td><b>${esc(x.model_kodu)}</b></td><td>${esc(fqDepoAd(x.depo))}</td><td class="num">${x.adet}</td>
        <td${x.kalan_dakika<=180?' style="color:var(--warn);font-weight:700"':''}>${saat>0?saat+' sa ':''}${dk} dk</td>
        <td style="font-size:12px">${esc(x.ekleyen_ad||'—')}</td><td style="font-size:12px">${esc(x.notu||'—')}</td>
        <td style="white-space:nowrap"><button class="ghost sm" title="48 saat uzat" onclick="fqRezerveUzat(${x.id})">+48s</button> <button class="ghost sm" title="Rezerveyi kaldır — adet satılabilir olur" onclick="fqRezerveKaldir(${x.id})">✕ Kaldır</button></td></tr>`; }).join('')+'</tbody></table>';
  }catch(e){ msg.textContent='Rezerveler okunamadı: '+(e.message||e)+' (stok modülü SQL dosyası çalıştırıldı mı?)'; }
}
async function fqRezerveKaldir(id){
  if(fqStokM.panelBusy)return; fqStokM.panelBusy=true;
  try{ const {error}=await sb.rpc('fq_rezerve_kaldir',{p_id:id}); if(error)throw error; await fqRezervePanelAc(); quoteRows.forEach(r=>{ if(r.kod)refetch(r); }); }
  catch(e){ $('fqRezPanelMsg').textContent='Kaldırılamadı: '+(e.message||e); }
  finally{ fqStokM.panelBusy=false; }
}
async function fqRezerveUzat(id){
  if(fqStokM.panelBusy)return; fqStokM.panelBusy=true;
  try{ const {error}=await sb.rpc('fq_rezerve_uzat',{p_id:id,p_saat:48}); if(error)throw error; await fqRezervePanelAc(); }
  catch(e){ $('fqRezPanelMsg').textContent='Uzatılamadı: '+(e.message||e); }
  finally{ fqStokM.panelBusy=false; }
}
$('fqStokSatisDialog').addEventListener('cancel',e=>{ if(fqStokM.satis.busy)e.preventDefault(); });
