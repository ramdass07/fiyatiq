/* Teklif ve görüşme geçmişi: yalnızca sunucuda kaydedilmiş olayları gösterir. */
'use strict';
const fqQuoteHistory={id:null,request:0,scope:null,cursor:null,rows:[],more:false,busy:false};
const FQ_HISTORY_FIELDS={teklif_no:'Teklif no',marka:'Marka',musteri_ad:'Müşteri',musteri_tel:'Telefon',personel:'Teklifte yazan satış personeli',magaza:'Teklifte yazan mağaza',teklif_tarihi:'Teklif tarihi',gecerlilik_bitis:'Geçerlilik bitişi',toplam:'Peşin teklif toplamı',taksitli_toplam:'Taksitli teklif toplamı',banka:'Teklif bankası',taksit:'Teklif taksit sayısı',urunler:'Ürünler',durum:'Teklif durumu',takip_notu:'Görüşme notu',takip_sorumlusu:'Takip eden kişi',sonraki_arama:'Sonraki arama',kayip_nedeni:'Kayıp nedeni',gercek_satis_tutari:'Gerçekleşen satış toplamı',satis_odeme_sekli:'Satış ödeme şekli',satis_banka:'Satış bankası',satis_taksit_sayisi:'Satış taksit sayısı',satis_tarihi:'Satış tarihi'};
const FQ_HISTORY_PAYMENTS={nakit:'Nakit',havale:'Havale / EFT',kart:'Kart',karma:'Karma ödeme',diger:'Diğer'};
document.head.insertAdjacentHTML('beforeend',`<style>
 #fqQuoteHistoryDialog{width:min(960px,94vw)}.fq-history-event{border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0}.fq-history-event h3{margin:0 0 8px}.fq-history-event time{font-weight:600}.fq-history-baseline{background:var(--field);padding:10px;border-radius:6px}.fq-history-change{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}.fq-history-change h4{margin:0 0 8px}.fq-history-values{display:grid;grid-template-columns:1fr 1fr;gap:12px}.fq-history-values.single{grid-template-columns:1fr}.fq-history-value{white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;background:var(--field);border-radius:6px}.fq-history-value p{margin:4px 0}.fq-history-value ul{padding-left:20px;margin:4px 0}.fq-history-value li{margin:7px 0}#fqHistoryMore[hidden]{display:none}@media(max-width:600px){.fq-history-values{grid-template-columns:1fr}.fq-history-event{padding:12px}}
 </style>`);
document.body.insertAdjacentHTML('beforeend',`<dialog id="fqQuoteHistoryDialog" class="fq-dialog" aria-labelledby="fqHistoryTitle">
 <div class="sale-heading"><h2 id="fqHistoryTitle">Teklif ve görüşme geçmişi</h2><button type="button" class="ghost" onclick="fqResetQuoteHistory()">Kapat</button></div>
 <p class="mut">En yeni kayıt üsttedir. İşlemi yapan bilgisi kullanılan mağaza / yönetim hesabını gösterir; ortak hesapta işlemi yapan kişiyi kesin olarak belirlemez. Tarih ve saatler Türkiye saatidir.</p>
 <p class="mut">Yalnızca kaydedilmiş değişiklikler görünür. Açık takip penceresindeki kaydedilmemiş notlar bu pencereyi açıp kapatınca korunur.</p>
 <p id="fqHistoryMessage" role="status" aria-live="polite"></p><div id="fqHistoryEvents"></div>
 <div class="fq-actions"><button type="button" class="ghost" id="fqHistoryReload" onclick="fqReloadQuoteHistory()">Yenile</button><button type="button" id="fqHistoryMore" onclick="fqLoadQuoteHistoryMore()" hidden>Daha eski kayıtlar</button></div>
 </dialog>`);

function fqHistoryAllowed(){return !!authUid&&!!profil&&(profil.rol==='admin'||['personel','bayi'].includes(profil.rol)&&['aktif','deneme'].includes(profil.abonelik_durumu));}
function fqHistoryScope(){return {uid:authUid,epoch:fqEpoch,role:profil&&profil.rol,status:profil&&profil.abonelik_durumu,brands:JSON.stringify(profil&&profil.marka_erisimi||[]),brand};}
function fqHistoryScopeCurrent(scope){return !!scope&&fqHistoryAllowed()&&JSON.stringify(scope)===JSON.stringify(fqHistoryScope());}
function fqQuoteHistoryActionsHTML(id){return `<button type="button" class="ghost" data-quote="${esc(id)}" onclick="fqOpenQuoteHistory(this.dataset.quote)">Geçmiş</button>`;}
function fqHistoryDate(value){
 if(typeof value!=='string'||!value)return 'Girilmedi';
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value.split('-').reverse().join('.'):'Tarih okunamadı';}
 const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'}):'Tarih okunamadı';
}
function fqHistoryMoney(value){return (typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺':'Tutar okunamadı';}
function fqHistoryScalar(value){return typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):'Bilgi gösterilemiyor';}
function fqHistoryProducts(value){
 if(!Array.isArray(value))return 'Ürün bilgisi gösterilemiyor';
 if(!value.length)return 'Ürün yok';
 return '<ul>'+value.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))return '<li>Ürün bilgisi gösterilemiyor</li>';
  const product=[row.model,row.ad].filter(v=>typeof v==='string'&&v).map(esc).join(' · ')||'Ürün adı kaydedilmemiş';
  const qty=row.adet===null||row.adet===undefined?'Adet girilmedi':'Adet: '+esc(fqHistoryScalar(row.adet));
  const prices=[['birim_nakit','Peşin birim'],['birim_taksit','Taksitli birim'],['toplam_nakit','Peşin satır toplamı'],['toplam_taksit','Taksitli satır toplamı']].filter(([key])=>row[key]!==null&&row[key]!==undefined).map(([key,label])=>esc(label+': '+fqHistoryMoney(row[key])));
  return `<li><strong>${product}</strong><br>${qty}<br>${prices.length?prices.join(' · '):'Net ürün fiyatı kaydedilmemiş.'}</li>`;
 }).join('')+'</ul>';
}
function fqHistoryValue(key,value){
 if(value===null||value===undefined||value==='')return 'Girilmedi';
 if(key==='urunler')return fqHistoryProducts(value);
 if(['toplam','taksitli_toplam','gercek_satis_tutari'].includes(key))return esc(fqHistoryMoney(value));
 if(['teklif_tarihi','gecerlilik_bitis','sonraki_arama','satis_tarihi'].includes(key))return esc(fqHistoryDate(value));
 if(key==='durum')return esc(typeof value==='string'&&Object.hasOwn(DURUM_AD,value)?DURUM_AD[value]:fqHistoryScalar(value));
 if(key==='satis_odeme_sekli')return esc(typeof value==='string'&&Object.hasOwn(FQ_HISTORY_PAYMENTS,value)?FQ_HISTORY_PAYMENTS[value]:fqHistoryScalar(value));
 return esc(fqHistoryScalar(value));
}
function fqHistoryEventHTML(row){
 const initial=row.islem!=='degisti',title={baslangic:'Geçmiş kaydı başlatıldı',olusturuldu:'Teklif oluşturuldu',degisti:'Teklif güncellendi'}[row.islem];
 const fields=Object.keys(FQ_HISTORY_FIELDS).filter(key=>Object.hasOwn(row.degisiklikler,key)&&row.degisiklikler[key]&&typeof row.degisiklikler[key]==='object'&&Object.hasOwn(row.degisiklikler[key],'once')&&Object.hasOwn(row.degisiklikler[key],'sonra'));
 const changes=fields.map(key=>{const change=row.degisiklikler[key];return `<section class="fq-history-change"><h4>${esc(FQ_HISTORY_FIELDS[key])}</h4><div class="fq-history-values${initial?' single':''}">${initial?'':`<div><span class="mut">Önce</span><div class="fq-history-value">${fqHistoryValue(key,change.once)}</div></div>`}<div><span class="mut">${initial?'Bu anda kayıtlı bilgi':'Sonra'}</span><div class="fq-history-value">${fqHistoryValue(key,change.sonra)}</div></div></div></section>`;}).join('');
 return `<article class="fq-history-event" data-event="${esc(row.id)}"><h3>${esc(title)}</h3><time datetime="${esc(row.olusturuldu_at)}">${esc(fqHistoryDate(row.olusturuldu_at))}</time><p class="mut">Hesap: ${esc(row.islem_yapan||'Hesap bilgisi kaydedilmemiş')}</p>${row.islem==='baslangic'?'<p class="fq-history-baseline">Geçmiş kaydı bu noktada başlatıldı; daha eski değişiklikler saklanmamış. Aşağıdakiler başlangıç anında kayıtlı bilgilerdir.</p>':''}${changes||'<p class="mut">Bu kayıtta gösterilebilen değişiklik bilgisi bulunmuyor.</p>'}</article>`;
}
function fqHistoryResult(data,cursor){
 if(!data||typeof data!=='object'||!Array.isArray(data.rows)||typeof data.has_more!=='boolean'||data.rows.length>30||data.has_more&&!data.rows.length)throw Error('invalid');
 let previous=cursor?BigInt(cursor):null;const ids=new Set(fqQuoteHistory.rows.map(row=>row.id));
 const rows=data.rows.map(row=>{
  if(!row||typeof row!=='object'||typeof row.id!=='string'||!/^\d+$/.test(row.id)||BigInt(row.id)<=0n||!['baslangic','olusturuldu','degisti'].includes(row.islem)||typeof row.olusturuldu_at!=='string'||!Number.isFinite(new Date(row.olusturuldu_at).getTime())||typeof row.islem_yapan!=='string'||!row.degisiklikler||typeof row.degisiklikler!=='object'||Array.isArray(row.degisiklikler))throw Error('invalid');
  const id=BigInt(row.id);if(previous!==null&&id>=previous||ids.has(row.id))throw Error('invalid');previous=id;ids.add(row.id);return row;
 });return {rows,more:data.has_more};
}
function fqHistoryControls(){const busy=fqQuoteHistory.busy;$('fqHistoryReload').disabled=busy;$('fqHistoryMore').disabled=busy;$('fqHistoryMore').hidden=!fqQuoteHistory.more;$('fqHistoryEvents').setAttribute('aria-busy',String(busy));}
function fqResetQuoteHistory(){
 fqQuoteHistory.request++;fqQuoteHistory.id=null;fqQuoteHistory.scope=null;fqQuoteHistory.cursor=null;fqQuoteHistory.rows=[];fqQuoteHistory.more=false;fqQuoteHistory.busy=false;
 $('fqHistoryEvents').replaceChildren();$('fqHistoryMessage').textContent='';fqHistoryControls();if($('fqQuoteHistoryDialog').open)$('fqQuoteHistoryDialog').close();
}
async function fqOpenQuoteHistory(id){
 if(!fqHistoryAllowed()||typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return false;
 fqResetQuoteHistory();fqQuoteHistory.id=id;fqQuoteHistory.scope=fqHistoryScope();$('fqQuoteHistoryDialog').showModal();return fqLoadQuoteHistoryMore(true);
}
async function fqReloadQuoteHistory(){if(fqQuoteHistory.id&&!fqQuoteHistory.busy)return fqOpenQuoteHistory(fqQuoteHistory.id);}
async function fqLoadQuoteHistoryMore(first=false){
 if(!fqQuoteHistory.id||fqQuoteHistory.busy||!$('fqQuoteHistoryDialog').open||!first&&!fqQuoteHistory.more)return false;
 if(!fqHistoryScopeCurrent(fqQuoteHistory.scope)){fqResetQuoteHistory();return false;}
 const id=fqQuoteHistory.id,scope=fqQuoteHistory.scope,cursor=fqQuoteHistory.cursor,request=++fqQuoteHistory.request;
 const current=()=>request===fqQuoteHistory.request&&id===fqQuoteHistory.id&&$('fqQuoteHistoryDialog').open&&fqHistoryScopeCurrent(scope);
 fqQuoteHistory.busy=true;fqHistoryControls();$('fqHistoryMessage').textContent='Geçmiş yükleniyor…';
 try{
  const {data,error}=await sb.rpc('fq_teklif_gecmisi_oku',{p_teklif_id:id,p_before_id:cursor,p_page_size:30});if(!current()){if(request===fqQuoteHistory.request)fqResetQuoteHistory();return false;}if(error)throw Error('load');
  const result=fqHistoryResult(data,cursor);fqQuoteHistory.rows.push(...result.rows);fqQuoteHistory.more=result.more;if(result.rows.length)fqQuoteHistory.cursor=result.rows[result.rows.length-1].id;
  $('fqHistoryEvents').insertAdjacentHTML('beforeend',result.rows.map(fqHistoryEventHTML).join(''));
  $('fqHistoryMessage').textContent=fqQuoteHistory.rows.length?`${fqQuoteHistory.rows.length} geçmiş kaydı gösteriliyor.${result.more?' Daha eski kayıtları yükleyebilirsin.':' Erişilebilir geçmişin sonuna ulaşıldı.'}`:'Geçmiş kaydı bulunamadı veya bu teklife erişimin yok.';return true;
 }catch(error){if(current())$('fqHistoryMessage').textContent='Geçmiş yüklenemedi. Bağlantını ve erişimini kontrol edip tekrar dene.';else if(request===fqQuoteHistory.request)fqResetQuoteHistory();return false;
 }finally{if(current()){fqQuoteHistory.busy=false;fqHistoryControls();}}
}
$('fqQuoteHistoryDialog').addEventListener('cancel',event=>{event.preventDefault();fqResetQuoteHistory();});
$('fqQuoteHistoryDialog').addEventListener('close',()=>{if(!$('fqQuoteHistoryDialog').open)fqResetQuoteHistory();});
