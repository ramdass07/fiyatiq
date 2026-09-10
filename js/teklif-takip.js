/* Quote follow-up: stored on the offer, independent of its historical price snapshot. */
'use strict';
const fqFollowup={record:null,request:0,saving:false,baseline:''};
const FQ_SALE_FIELDS=['gercek_satis_tutari','satis_odeme_sekli','satis_banka','satis_taksit_sayisi','satis_tarihi'];
const FQ_SALE_INPUTS=['fqSaleAmount','fqSalePayment','fqSaleBank','fqSaleInstallments','fqSaleDate'];
const FQ_SALE_PAYMENTS={nakit:'Nakit',havale:'Havale / EFT',kart:'Kart',karma:'Karma ödeme',diger:'Diğer'};
const FQ_FOLLOW_FIELDS='id,bayi_id,teklif_no,musteri_ad,musteri_tel,durum,takip_notu,sonraki_arama,takip_sorumlusu,kayip_nedeni,takip_surumu,takip_guncellendi_at,toplam,satirlar,'+FQ_SALE_FIELDS.join(',');
document.head.insertAdjacentHTML('beforeend',`<style>
 .fq-follow-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.fq-follow-grid label{display:flex;flex-direction:column;gap:6px}.fq-follow-grid input,.fq-follow-grid select,.fq-follow-grid textarea{width:100%}.fq-follow-wide{grid-column:1/-1}.fq-follow-grid textarea{min-height:100px;resize:vertical;background:var(--field);color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:10px;font:inherit}.fq-call-due{color:var(--warn);font-weight:700}
 #fqFollowLossLabel[hidden],#fqSalePanel[hidden],#fqSaleClearingWarning[hidden],#fqSaleCashSuggestion[hidden],#fqSaleInstallmentSuggestion[hidden]{display:none}.fq-sale-panel{border:1px solid var(--line);border-radius:10px;padding:14px}.fq-sale-panel h3{margin-top:0}.fq-sale-panel .fq-actions{margin-bottom:14px}
 @media(max-width:600px){.fq-follow-grid{grid-template-columns:1fr}}
 </style>`);
document.body.insertAdjacentHTML('beforeend',`<dialog id="fqFollowupDialog" class="fq-dialog" aria-labelledby="fqFollowTitle">
 <div class="sale-heading"><h2 id="fqFollowTitle">Müşteri takibi</h2><button class="ghost" onclick="fqCloseFollowup()">Kapat</button></div>
 <p id="fqFollowCustomer"></p><p id="fqFollowMessage" role="status"></p>
 <fieldset id="fqFollowForm" disabled style="border:0;padding:0;margin:0"><div class="fq-follow-grid">
 <label>Teklif durumu<select id="fqFollowStatus" onchange="fqFollowStatusChanged()"><option value="teklif">Bekleyen teklif</option><option value="satildi">Satıldı</option><option value="kaybedildi">Kaybedildi</option></select></label>
 <label>Takip eden kişi<input id="fqFollowAssignee" maxlength="100" placeholder="Ad soyad"></label>
 <label>Sonraki arama · Türkiye saati<input id="fqFollowDate" type="datetime-local" step="60"></label>
 <p class="mut">Satıldı veya Kaybedildi seçildiğinde arama planı kapanır. Satıldı işareti stoktan düşmez; tahsilat kaydı değildir.</p>
 <label class="fq-follow-wide">Görüşme notu<textarea id="fqFollowNote" maxlength="2000" placeholder="Örn. Eşine danışacak, cuma tekrar görüşülecek."></textarea></label>
 <label id="fqFollowLossLabel" class="fq-follow-wide" hidden>Kayıp nedeni<textarea id="fqFollowLoss" maxlength="500" placeholder="Örn. Fiyat yüksek bulundu; başka mağazadan aldı."></textarea></label>
 <section id="fqSalePanel" class="fq-follow-wide fq-sale-panel" hidden aria-labelledby="fqSaleTitle"><h3 id="fqSaleTitle">Gerçekleşen satış</h3>
 <p class="mut">Müşteriyle anlaşılan son satış toplamını kaydet. Bu tutar tahsilat değildir. Alanların tamamını boş bırakarak da Satıldı kaydı yapabilirsin. Bilgi gireceksen tutar, ödeme şekli ve satış tarihini birlikte belirt.</p>
 <div class="fq-actions"><button type="button" class="ghost" id="fqSaleCashSuggestion" onclick="fqUseSaleSuggestion('cash')" hidden>Peşin teklif tutarını kullan</button><button type="button" class="ghost" id="fqSaleInstallmentSuggestion" onclick="fqUseSaleSuggestion('installment')" hidden>Taksitli teklif tutarını kullan</button></div>
 <div class="fq-follow-grid"><label>Anlaşılan satış toplamı · ₺<input id="fqSaleAmount" inputmode="decimal" maxlength="24" placeholder="Örn. 32500,00"></label>
 <label>Ödeme şekli<select id="fqSalePayment"><option value="">Seç</option><option value="nakit">Nakit</option><option value="havale">Havale / EFT</option><option value="kart">Kart</option><option value="karma">Karma ödeme</option><option value="diger">Diğer</option></select></label>
 <label>Satış tarihi<input id="fqSaleDate" type="date"></label><label>Banka · isteğe bağlı<input id="fqSaleBank" maxlength="120" placeholder="Banka adı"></label>
 <label>Taksit sayısı · isteğe bağlı<input id="fqSaleInstallments" type="number" min="1" max="60" step="1" placeholder="Örn. 6"></label></div></section>
 <p id="fqSaleClearingWarning" class="fq-follow-wide fq-call-due" hidden>Durumu Satıldı dışına alıp kaydettiğinde gerçekleşen satış tutarı, ödeme bilgileri ve satış tarihi silinir. Teklif fiyatları korunur.</p>
 </div><p class="mut">Bu notlar mağaza içindir; müşteri çıktısına eklenmez. Takip eden kişi alanı bir erişim yetkisi vermez.</p></fieldset>
 <div class="fq-actions"><button class="ghost" id="fqFollowReload" onclick="fqReloadFollowup()">Yeniden yükle</button><button id="fqFollowSave" onclick="fqSaveFollowup()" disabled>Takibi kaydet</button></div>
 </dialog>`);

function fqTurkeyInput(value){if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=type=>parts.find(x=>x.type===type).value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;}
function fqTurkeyDate(value){if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Geçerli bir arama tarihi ve saati seç.');const date=new Date(value+':00+03:00');if(!Number.isFinite(date.getTime())||fqTurkeyInput(date)!==value)throw Error('Geçerli bir arama tarihi ve saati seç.');return date.toISOString();}
function fqTurkeyTomorrow(now=new Date()){const day=fqTurkeyInput(now).slice(0,10);return new Date(new Date(day+'T00:00:00+03:00').getTime()+86400000).toISOString();}
function fqCallText(t){if(!t.sonraki_arama||t.durum!=='teklif')return '';const date=new Date(t.sonraki_arama);if(!Number.isFinite(date.getTime()))return '';const due=date.getTime()<new Date(fqTurkeyTomorrow()).getTime();return `<p class="${due?'fq-call-due':'mut'}">${due?'Bugün / geciken arama':'Sonraki arama'}: ${esc(date.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'}))} · Türkiye saati</p>`;}
function fqFollowupFilters(q){
 const status=$('fqMyStatus').value,follow=$('fqMyFollow').value;
 if(Object.hasOwn(DURUM_AD,status))q=q.eq('durum',status);
 if(follow){if(!status)q=q.eq('durum','teklif');
  if(follow==='due')q=q.not('sonraki_arama','is',null).lt('sonraki_arama',fqTurkeyTomorrow());
  else if(follow==='planned')q=q.gte('sonraki_arama',fqTurkeyTomorrow());
  else if(follow==='none')q=q.is('sonraki_arama',null);
 }
 return q;
}
function fqFollowupRaw(){return JSON.stringify(['fqFollowStatus','fqFollowAssignee','fqFollowDate','fqFollowNote','fqFollowLoss',...FQ_SALE_INPUTS].map(id=>$(id).value));}
function fqFollowupDirty(){return !!fqFollowup.record&&fqFollowupRaw()!==fqFollowup.baseline;}
function fqSaleHasRecord(record){return !!record&&FQ_SALE_FIELDS.some(key=>record[key]!==null&&record[key]!==undefined&&record[key]!=='');}
function fqSaleHasInput(){return FQ_SALE_INPUTS.some(id=>$(id).value.trim()!=='');}
function fqFollowStatusChanged(){const status=$('fqFollowStatus').value;$('fqFollowLossLabel').hidden=status!=='kaybedildi';$('fqFollowLoss').required=status==='kaybedildi';$('fqFollowDate').disabled=status!=='teklif';$('fqSalePanel').hidden=status!=='satildi';$('fqSaleClearingWarning').hidden=status==='satildi'||!fqSaleHasRecord(fqFollowup.record);}
function fqSaleMoney(value){
 const raw=String(value??'').trim();let clean;
 if(/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw))clean=raw.replace(/\./g,'').replace(',','.');
 else if(/^\d+(?:[.,]\d{1,2})?$/.test(raw))clean=raw.replace(',','.');
 else throw Error('Satış tutarını sıfır veya pozitif, en fazla iki ondalıkla yaz. Örn. 32500,00.');
 const amount=Number(clean);if(!Number.isFinite(amount)||amount>999999999999.99)throw Error('Satış tutarı izin verilen aralığı aşıyor.');return amount;
}
function fqSaleDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))throw Error('Geçerli bir satış tarihi seç.');const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('Geçerli bir satış tarihi seç.');return value;}
function fqSalePayload(status){
 const hasInput=fqSaleHasInput();if(status!=='satildi'&&!hasInput&&!fqSaleHasRecord(fqFollowup.record))return {};
 const empty=Object.fromEntries(FQ_SALE_FIELDS.map(key=>[key,null]));if(status!=='satildi'||!hasInput)return empty;
 const amount=$('fqSaleAmount').value.trim(),payment=$('fqSalePayment').value,date=$('fqSaleDate').value,bank=$('fqSaleBank').value.trim(),parts=$('fqSaleInstallments').value;
 if(amount===''||!payment||!date)throw Error('Satış bilgisi girmek için tutar, ödeme şekli ve satış tarihini birlikte doldur; istersen tüm satış alanlarını boş bırakabilirsin.');
 if(!Object.hasOwn(FQ_SALE_PAYMENTS,payment))throw Error('Geçerli bir ödeme şekli seç.');
 if(bank.length>120)throw Error('Banka adı en fazla 120 karakter olabilir.');
 if(parts!==''&&(!/^\d+$/.test(parts)||Number(parts)<1||Number(parts)>60))throw Error('Taksit sayısı 1 ile 60 arasında tam sayı olmalı.');
 return {gercek_satis_tutari:fqSaleMoney(amount),satis_odeme_sekli:payment,satis_banka:bank||null,satis_taksit_sayisi:parts===''?null:Number(parts),satis_tarihi:fqSaleDate(date)};
}
function fqSaleSuggestions(record){
 const raw=record&&record.satirlar,s=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},h=s.hesap&&typeof s.hesap==='object'?s.hesap:{};
 const valid=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=999999999999.99;
 return {cash:valid(record&&record.toplam)?Number(record.toplam):valid(h.finalNakit)?Math.round(Number(h.finalNakit)):null,installment:valid(h.finalTaksit)&&Number.isInteger(Number(s.taksit))&&Number(s.taksit)>=1&&Number(s.taksit)<=60?Math.round(Number(h.finalTaksit)):null};
}
function fqUseSaleSuggestion(kind){if(!fqFollowup.record||fqFollowup.saving||$('fqFollowForm').disabled||$('fqFollowStatus').value!=='satildi')return;const amount=fqSaleSuggestions(fqFollowup.record)[kind];if(amount===null||amount===undefined)return;$('fqSaleAmount').value=amount.toFixed(2).replace('.',',');}
function fqFillSale(t){
 for(let index=0;index<FQ_SALE_FIELDS.length;index++)$(FQ_SALE_INPUTS[index]).value=t[FQ_SALE_FIELDS[index]]??'';
 const suggested=fqSaleSuggestions(t);$('fqSaleCashSuggestion').hidden=suggested.cash===null;$('fqSaleInstallmentSuggestion').hidden=suggested.installment===null;
}
function fqClearSale(){for(const id of FQ_SALE_INPUTS)$(id).value='';$('fqSaleCashSuggestion').hidden=true;$('fqSaleInstallmentSuggestion').hidden=true;$('fqSalePanel').hidden=true;$('fqSaleClearingWarning').hidden=true;}
function fqFollowPayload(){
 const durum=$('fqFollowStatus').value,note=$('fqFollowNote').value.trim(),person=$('fqFollowAssignee').value.trim(),reason=$('fqFollowLoss').value.trim();
 if(!Object.hasOwn(DURUM_AD,durum))throw Error('Geçerli bir teklif durumu seç.');
 if(note.length>2000||person.length>100||reason.length>500)throw Error('Not veya kişi adı izin verilen uzunluğu aşıyor.');
 if(durum==='kaybedildi'&&!reason)throw Error('Kaybedilen teklif için kayıp nedeni yaz.');
 return {durum,takip_notu:note,takip_sorumlusu:person,sonraki_arama:durum==='teklif'?fqTurkeyDate($('fqFollowDate').value):null,kayip_nedeni:durum==='kaybedildi'?reason:'',...fqSalePayload(durum)};
}
function fqFillFollowup(t,desired){
 fqFollowup.record=t;$('fqFollowCustomer').textContent=[t.musteri_ad||'Müşteri',t.musteri_tel,t.teklif_no].filter(Boolean).join(' · ');
 $('fqFollowStatus').value=t.durum||'teklif';$('fqFollowAssignee').value=t.takip_sorumlusu||'';$('fqFollowDate').value=fqTurkeyInput(t.sonraki_arama);$('fqFollowNote').value=t.takip_notu||'';$('fqFollowLoss').value=t.kayip_nedeni||'';
 fqFillSale(t);
 fqFollowup.baseline=fqFollowupRaw();if(Object.hasOwn(DURUM_AD,desired))$('fqFollowStatus').value=desired;
 fqFollowStatusChanged();$('fqFollowForm').disabled=false;$('fqFollowSave').disabled=false;
 $('fqFollowMessage').textContent=t.takip_guncellendi_at?'Son güncelleme: '+new Date(t.takip_guncellendi_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})+' · Türkiye saati':'';
}
async function fqOpenFollowup(id,desired){
 if(!authUid||fqFollowup.saving)return;
 if(fqFollowupDirty()&&!confirm('Kaydedilmemiş takip değişiklikleri bırakılsın mı?'))return;
 const user=authUid,epoch=fqEpoch,request=++fqFollowup.request,dialog=$('fqFollowupDialog');fqFollowup.record=null;fqFollowup.baseline='';
 const current=()=>request===fqFollowup.request&&epoch===fqEpoch&&user===authUid&&dialog.open;
 $('fqFollowForm').disabled=true;$('fqFollowSave').disabled=true;$('fqFollowCustomer').textContent='';for(const field of ['fqFollowAssignee','fqFollowDate','fqFollowNote','fqFollowLoss'])$(field).value='';fqClearSale();$('fqFollowStatus').value='teklif';fqFollowStatusChanged();$('fqFollowMessage').textContent='Takip bilgileri yükleniyor…';if(!dialog.open)dialog.showModal();
 try{let q=sb.from('teklifler').select(FQ_FOLLOW_FIELDS).eq('id',id);if(!isEditor())q=q.eq('bayi_id',user);
 const {data,error}=await q.single();if(!current())return;if(error||!data)throw Error('missing');fqFillFollowup(data,desired);
 }catch(e){if(current())$('fqFollowMessage').textContent='Takip açılamadı. Bağlantını ve erişimini kontrol edip tekrar aç.';}
}
function fqResetFollowup(){fqFollowup.request++;fqFollowup.record=null;fqFollowup.baseline='';for(const id of ['fqFollowAssignee','fqFollowDate','fqFollowNote','fqFollowLoss'])$(id).value='';fqClearSale();$('fqFollowStatus').value='teklif';$('fqFollowCustomer').textContent='';$('fqFollowMessage').textContent='';$('fqFollowForm').disabled=true;$('fqFollowSave').disabled=true;if($('fqFollowupDialog').open)$('fqFollowupDialog').close();}
function fqCloseFollowup(){if(fqFollowup.saving){alert('Kaydın tamamlanmasını bekle.');return;}if(fqFollowupDirty()&&!confirm('Kaydedilmemiş takip değişiklikleri bırakılsın mı?'))return;fqResetFollowup();}
async function fqReloadFollowup(){if(fqFollowup.record)await fqOpenFollowup(fqFollowup.record.id);}
async function fqSaveFollowup(){
 if(!fqFollowup.record||fqFollowup.saving||!authUid)return;
 const record=fqFollowup.record,user=authUid,epoch=fqEpoch,request=fqFollowup.request;
 const current=()=>user===authUid&&epoch===fqEpoch&&request===fqFollowup.request&&$('fqFollowupDialog').open;
 const msg=$('fqFollowMessage');
 try{const payload=fqFollowPayload();if(payload.durum!=='satildi'&&fqSaleHasRecord(record)&&!confirm('Bu kaydı Satıldı dışına aldığında gerçekleşen satış tutarı, ödeme bilgileri ve satış tarihi silinecek. Kaydedilsin mi?'))return;fqFollowup.saving=true;$('fqFollowSave').disabled=true;$('fqFollowForm').disabled=true;msg.textContent='Takip kaydediliyor…';
 const {data:{user:verified},error:authError}=await sb.auth.getUser();if(!current())return;if(authError||!verified||verified.id!==user)throw Error('session');
 let q=sb.from('teklifler').update(payload).eq('id',record.id).eq('takip_surumu',record.takip_surumu);if(!isEditor())q=q.eq('bayi_id',user);
 const {data,error}=await q.select(FQ_FOLLOW_FIELDS).single();if(!current())return;
 if(error||!data){if(!data&&(!error||error.code==='PGRST116'))throw Error('conflict');throw error;}
 fqFillFollowup(data);msg.textContent='✓ Takip kaydedildi.';
 if($('fqMyQuotes').open)fqLoadMyQuotes();
 if(isEditor())loadTeklifler();
 }catch(e){if(current())msg.textContent=e.message==='conflict'?'Bu kayıt başka bir ekranda değişti veya erişimin değişti. Notunu kopyalayıp Yeniden yükle seçeneğini kullan; değişikliklerin gönderilmedi.':e.message==='session'?'Oturum doğrulanamadı. Notunu koruyup yeniden giriş yap.':e.code?'Takip kaydedilemedi. Yazdıkların bu pencerede duruyor; bağlantını kontrol edip tekrar dene.':e.message;
 }finally{fqFollowup.saving=false;if(current()){$('fqFollowSave').disabled=false;$('fqFollowForm').disabled=false;fqFollowStatusChanged();}}
}
$('fqFollowupDialog').addEventListener('cancel',event=>{event.preventDefault();fqCloseFollowup();});
window.addEventListener('beforeunload',event=>{if(fqFollowupDirty()||fqFollowup.saving){event.preventDefault();event.returnValue='';}});
