/* Quote validity is informational. It never prevents saving, sharing or selling. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FiyatIQValidity=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function date(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||+value.slice(0,4)<1)return null;
 const parsed=new Date(value+'T12:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:null;
}
function today(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=type=>parts.find(p=>p.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
function label(value){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,180):'';}
function sources(rows=[],quickMap={},campaigns=[],appliedIds=[]){
 const result=[],seen=new Set();
 const add=(type,id,name,end)=>{const key=type+':'+String(id);if(seen.has(key))return;seen.add(key);result.push({type,label:label(name),until:date(end)});};
 const used=new Set(appliedIds);
 for(const campaign of campaigns)if(campaign&&used.has(campaign.id))add('bundle',campaign.id,campaign.ad,campaign.bitis_tarihi||campaign.bitis);
 for(const row of rows){
  if(!row||!row.kod||row.ad==='— bulunamadı —')continue;
  const code=String(row.kod).toUpperCase(),quick=quickMap[code],pair=row.ikiliBilgi;
  const manualCash=row.isET&&+row.manuelFiyat>0,manualInstallment=row.isET&&+row.manuelTaksit>0;
  if(manualCash)continue;
  const paired=Math.min(+row.ikiliAdet||0,+row.adet||1);
  const quickSource=()=>add('quick',code,code+' özel fiyat',quick&&quick.bitis);
  const pairSource=()=>add('pair',pair&&pair.id||code,'İkili kampanya',pair&&pair.bitis);
  // Follow calcParts: manual cash wins, then selected cash, pair price, model price.
  const cash=row.nakitSecili&&(+row.ikiliNakit>0||quick&&+quick.nakit>0);
  if(cash){if(paired>0&&+row.ikiliNakit>0)pairSource();else quickSource();}
  else if(!manualInstallment){if(paired>0&&+row.ikiliTaksit>0)pairSource();else if(+row.kampFiyat>0)quickSource();}
  // Any unmatched quantity retains the model's normal price instead of the pair price.
  if(paired>0&&paired<(+row.adet||1)&&!manualInstallment&&(row.nakitSecili&&quick&&+quick.nakit>0||+row.kampFiyat>0))quickSource();
 }
 return result;
}
function snapshot(requested,limits=[]){
 const clean=limits.filter(x=>x&&['bundle','quick','pair'].includes(x.type)).map(x=>({type:x.type,label:label(x.label),until:date(x.until)}));
 const ends=clean.map(x=>x.until).filter(Boolean).sort(),requestedUntil=date(requested),campaignUntil=ends[0]||null;
 return {version:1,requested_until:requestedUntil,valid_until:requestedUntil&&(campaignUntil&&campaignUntil<requestedUntil?campaignUntil:requestedUntil),campaign_until:campaignUntil,unknown_campaign_end:clean.some(x=>!x.until),limits:clean};
}
function read(value){
 if(!value||typeof value!=='object'||value.version!==1)return null;
 return {version:1,requested_until:date(value.requested_until),valid_until:date(value.valid_until),campaign_until:date(value.campaign_until),unknown_campaign_end:value.unknown_campaign_end===true};
}
function displayDate(value){const d=date(value);return d?d.split('-').reverse().join('.'):'Belirtilmedi';}
function text(value,day=today()){
 const saved=read(value);if(!saved)return 'Bu eski teklifte geçerlilik tarihi kaydedilmemiş. Güncel fiyatı teyit edin.';
 if(!saved.valid_until)return 'Teklif geçerlilik tarihi belirtilmedi. Güncel fiyatı teyit edin.';
 let result='Teklif son geçerlilik: '+displayDate(saved.valid_until)+', gün sonu (Türkiye saati).';
 if(saved.valid_until<day)result+=' Bu teklifin süresi doldu; güncel fiyatı teyit edin.';
 if(saved.unknown_campaign_end)result+=' Uygulanan kampanyanın bitiş tarihi kayıtlı değil; bu süre kampanya teyidine bağlıdır.';
 return result;
}
function escape(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function html(value,day=today()){return '<p class="fq-validity-copy">'+escape(text(value,day))+'</p>';}
return {date,today,sources,snapshot,read,displayDate,text,html};
});

function fqValidityValue(){const input=document.getElementById('fqValidUntil');return input?FiyatIQValidity.date(input.value):FiyatIQValidity.today();}
function fqValiditySnapshot(){
 const rows=quoteRows.filter(r=>r.kod&&r.ad!=='— bulunamadı —'),selected=aktifKampanyalar.filter(k=>secilenKampanya.has(k.id));
 let used=[];try{used=hesaplaHakedis(selected,rows.filter(r=>r.isET?+r.etToptan>0:+r.toptan>0)).dokum.map(d=>d.kampanyaId);}catch(e){}
 return FiyatIQValidity.snapshot(fqValidityValue(),FiyatIQValidity.sources(rows,kampFiyatMap,selected,used));
}
function fqValidityText(value){return FiyatIQValidity.text(arguments.length?value:fqValiditySnapshot());}
function fqValidityHTML(value){return FiyatIQValidity.html(arguments.length?value:fqValiditySnapshot());}
function fqValidityRefresh(){
 const output=document.getElementById('fqValidityStatus');if(!output)return;
 const state=fqValiditySnapshot(),warnings=[];
 if(!state.requested_until)warnings.push('Geçerlilik tarihi seçilmedi.');
 if(state.campaign_until&&state.requested_until>state.campaign_until)warnings.push('Seçtiğin tarih kampanya bitişini aşıyor; teklif üzerinde '+FiyatIQValidity.displayDate(state.valid_until)+' kullanılacak.');
 if(state.valid_until&&state.valid_until<FiyatIQValidity.today())warnings.push('Teklifin süresi doldu. Güncel fiyat ve kampanyayı teyit et; işleme devam edebilirsin.');
 if(state.unknown_campaign_end)warnings.push('Uygulanan kampanyanın bitiş tarihi kayıtlı değil. Fiyatı teyit et.');
 output.textContent=warnings.join(' ')||'Teklif üzerinde '+FiyatIQValidity.displayDate(state.valid_until)+' gün sonu yazacak · Türkiye saati.';
 output.className=warnings.length?'msg warn':'mut';
}
function fqValidityReset(){const input=document.getElementById('fqValidUntil');if(input)input.value=FiyatIQValidity.today();fqValidityRefresh();}
function fqValidityRestore(d,options={}){
 const input=document.getElementById('fqValidUntil');if(!input)return;
 input.value=options.copy?FiyatIQValidity.today():Object.hasOwn(d||{},'validity_requested')?(FiyatIQValidity.date(d.validity_requested)||''):FiyatIQValidity.today();
 fqValidityRefresh();
}
function fqValidityMount(){
 if(document.getElementById('fqValidUntil'))return;
 const anchor=document.getElementById('fqReviewBox');if(!anchor)return;
 const block=document.createElement('div');block.id='fqValidity';block.style.cssText='margin:10px 0;display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px';
 const label=document.createElement('label');label.htmlFor='fqValidUntil';label.textContent='Teklif geçerlilik tarihi';label.style.cssText='display:flex;align-items:center;gap:8px';
 const input=document.createElement('input');input.id='fqValidUntil';input.type='date';input.setAttribute('aria-describedby','fqValidityStatus');input.value=FiyatIQValidity.today();
 input.addEventListener('input',()=>{fqValidityRefresh();if(typeof fqDraftSchedule==='function')fqDraftSchedule();});label.appendChild(input);
 const status=document.createElement('p');status.id='fqValidityStatus';status.setAttribute('role','status');status.style.cssText='margin:0;font-size:12px;flex:1;min-width:200px';block.append(label,status);anchor.after(block);
}
if(typeof document!=='undefined')fqValidityMount();
