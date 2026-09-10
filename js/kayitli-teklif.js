/* Historical customer outputs use saved prices only. They never touch the active basket. */
'use strict';
const fqSavedOutput={request:0,pending:null,windows:new Set()};
const FQ_SAVED_OUTPUT_FIELDS='id,bayi_id,teklif_no,created_at,musteri_ad,musteri_tel,marka,toplam,satirlar';

function fqSavedQuoteSnapshot(record){
 const invalid=()=>{throw Error('snapshot');};
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
 if(!object(record))invalid();
 const clean=value=>value===null||value===undefined?'':typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim():invalid();
 const money=value=>{if(value===null||value===undefined||value==='')return null;if(!['number','string'].includes(typeof value)||typeof value==='string'&&!/^\d+(?:\.\d+)?$/.test(value))invalid();const number=Number(value);if(!Number.isFinite(number)||number<0||number>Number.MAX_SAFE_INTEGER/100)invalid();return number;};
 const s=object(record.satirlar)?record.satirlar:{},h=object(s.hesap)?s.hesap:{};
 const savedNo=clean(s.no),columnNo=clean(record.teklif_no);
 if(savedNo&&columnNo&&savedNo!==columnNo)invalid();
 const cashColumn=money(record.toplam),cashCalculation=money(h.finalNakit),installmentCalculation=money(h.finalTaksit);
 if(cashColumn!==null&&cashCalculation!==null&&Math.abs(cashColumn-Math.round(cashCalculation))>0.005)invalid();
 const cash=cashCalculation===null?cashColumn:Math.round(cashCalculation);
 if(cash===null||cash<=0)invalid();
 const installments=money(s.taksit),bank=clean(s.banka),commission=money(h.komis);
 if(installments!==null&&(!Number.isInteger(installments)||installments>120))invalid();
 const hasInstallments=installments>1&&(!!bank||commission>0);
 const installment=installmentCalculation===null?null:Math.round(installmentCalculation);
 if(hasInstallments&&(installment===null||installment<=0))invalid();
 const modern=Object.hasOwn(s,'net_items');
 const source=modern?s.net_items:Array.isArray(record.satirlar)?record.satirlar:s.items;
 if(source!==undefined&&!Array.isArray(source)||modern&&(!source||!source.length))invalid();
 const rows=(source||[]).map(row=>{
  if(!object(row))invalid();const model=clean(row.model||row.kod),name=clean(row.ad),quantity=money(row.adet);
  if(!model||quantity===null||!Number.isInteger(quantity)||quantity<1)invalid();
  const cashLine=modern?money(row.net_nakit):null,installmentLine=modern?money(row.net_taksit):null;
  if(modern&&(cashLine===null||hasInstallments&&installmentLine===null))invalid();
  return {model,name,quantity,cash:cashLine,installment:installmentLine};
 });
 if(modern){
  if(cashCalculation===null||Math.abs(rows.reduce((sum,row)=>sum+row.cash,0)-cash)>0.005)invalid();
  if(hasInstallments&&Math.abs(rows.reduce((sum,row)=>sum+row.installment,0)-installment)>0.005)invalid();
 }
 const created=typeof record.created_at==='string'?new Date(record.created_at):null;
 const date=created&&Number.isFinite(created.getTime())?created.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'})+' · Türkiye saati':'Kaydedilmemiş';
 const showInstallment=hasInstallments||!modern&&installment!==null&&installment!==cash;
 // Return an explicit allowlist: never pass costs, profit, notes, tax ID or addresses to an output.
 return {number:savedNo||columnNo||'Kaydedilmemiş',date,customer:clean(record.musteri_ad),phone:clean(record.musteri_tel),store:clean(s.magaza),salesperson:clean(s.personel),brand:clean(record.marka),rows,cash,installment:showInstallment?installment:null,installments:hasInstallments?installments:null,bank:showInstallment?bank:'',modern,validityText:FiyatIQValidity.text(s.gecerlilik)};
}

function fqSavedQuoteMoney(value){return Number(value).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2})+' ₺';}
function fqSavedQuoteMessage(snapshot){
 const s=snapshot,lines=['*FİYAT TEKLİFİ*','Teklif No: '+s.number,'Teklif tarihi: '+s.date];
 if(s.store)lines.push('Mağaza: '+s.store);if(s.customer)lines.push('Müşteri: '+s.customer);
 lines.push('');
 s.rows.forEach((r,i)=>{lines.push(`${i+1}. ${r.model}${r.name?' - '+r.name:''} × ${r.quantity}`);if(s.modern){lines.push('   Peşin satır toplamı: '+fqSavedQuoteMoney(r.cash));if(s.installment!==null)lines.push('   Taksitli satır toplamı: '+fqSavedQuoteMoney(r.installment));}});
 if(!s.rows.length)lines.push('Ürün bilgisi bu eski teklife kaydedilmemiş.');
 if(!s.modern)lines.push('Bu eski teklifte indirim sonrası ürün fiyatları ayrı ayrı kaydedilmemiş; kayıtlı teklif toplamı aşağıdadır.');
 lines.push('','*PEŞİN TOPLAM:* '+fqSavedQuoteMoney(s.cash));
 if(s.installment!==null){lines.push('*TAKSİTLİ TOPLAM:* '+fqSavedQuoteMoney(s.installment));lines.push(s.installments?(s.bank||'Banka kaydedilmemiş')+' · '+s.installments+' taksit':'Banka ve taksit sayısı kaydedilmemiş.');}
 if(s.salesperson)lines.push('Satış personeli: '+s.salesperson);
 lines.push('',s.validityText,'','Fiyatlarımıza KDV dahildir.');return lines.join('\n');
}
function fqSavedQuoteHTML(snapshot){
 const s=snapshot,e=esc,m=fqSavedQuoteMoney;
 const rows=s.rows.map(r=>`<tr><td><b>${e(r.model)}</b>${r.name?'<br>'+e(r.name):''}</td><td class="num">${r.quantity}</td>${s.modern?`<td class="num">${e(m(r.cash))}</td>${s.installment!==null?`<td class="num">${e(m(r.installment))}</td>`:''}`:''}</tr>`).join('');
 const field=(title,value)=>value?`<p><b>${e(title)}:</b> ${e(value)}</p>`:'';
 return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fiyat teklifi · ${e(s.number)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:28px auto;padding:0 24px;max-width:950px}h1{font-size:24px}p{line-height:1.5;margin:5px 0}table{border-collapse:collapse;width:100%;margin:22px 0}td,th{border-bottom:1px solid #cbd5e1;padding:10px 6px;text-align:left}.num{text-align:right;white-space:nowrap}.totals{padding:14px;background:#f1f5f9}.validity{margin:18px 0}.note{font-size:12px;color:#475569}button{padding:10px 20px;margin:12px 0;cursor:pointer}@media print{body{margin:0;max-width:none}button{display:none}thead{display:table-header-group}tr{break-inside:avoid}.totals{break-inside:avoid}}</style></head><body><button id="fqSavedPrintButton" type="button">Yazdır / PDF kaydet</button><h1>FİYAT TEKLİFİ</h1>${field('Teklif No',s.number)}${field('Teklif tarihi',s.date)}${field('Mağaza',s.store)}${field('Müşteri',s.customer)}${field('Telefon',s.phone)}<table><thead><tr><th>Ürün</th><th class="num">Adet</th>${s.modern?`<th class="num">Peşin satır toplamı</th>${s.installment!==null?'<th class="num">Taksitli satır toplamı</th>':''}`:''}</tr></thead><tbody>${rows||'<tr><td>Ürün bilgisi bu eski teklife kaydedilmemiş.</td><td></td></tr>'}</tbody></table>${!s.modern?'<p class="note">Bu eski teklifte indirim sonrası ürün fiyatları ayrı ayrı kaydedilmemiş; kayıtlı teklif toplamı aşağıdadır.</p>':''}<div class="totals">${field('Peşin toplam',m(s.cash))}${s.installment!==null?field('Taksitli toplam',m(s.installment))+field('Ödeme seçeneği',s.installments?(s.bank||'Banka kaydedilmemiş')+' · '+s.installments+' taksit':'Banka ve taksit sayısı kaydedilmemiş.'):''}</div>${field('Satış personeli',s.salesperson)}<p class="validity">${e(s.validityText)}</p><p class="note">Fiyatlarımıza KDV dahildir.</p></body></html>`;
}
function fqSavedQuoteActionsHTML(id){return `<div class="fq-actions"><button class="ghost" data-quote="${esc(id)}" onclick="fqPrintSavedQuote(this.dataset.quote)">Kayıtlı teklifi yazdır</button><button class="ghost" data-quote="${esc(id)}" onclick="fqShareSavedQuote(this.dataset.quote)">Kayıtlı teklifi WhatsApp’ta aç</button></div>`;}
function fqCloseSavedOutput(popup){if(!popup)return;try{popup.close();}catch(e){}fqSavedOutput.windows.delete(popup);if(fqSavedOutput.pending===popup)fqSavedOutput.pending=null;}
function fqResetSavedOutputs(){fqSavedOutput.request++;for(const popup of fqSavedOutput.windows)fqCloseSavedOutput(popup);fqSavedOutput.pending=null;}
async function fqOpenSavedOutput(id,kind){
 if(!authUid||typeof id!=='string'||!id)return false;
 if(fqSavedOutput.pending)fqCloseSavedOutput(fqSavedOutput.pending);
 const request=++fqSavedOutput.request,user=authUid,epoch=fqEpoch,editor=isEditor();
 const popup=window.open('','_blank');if(!popup){alert('Açılır pencere engellendi. Bu site için açılır pencerelere izin verip tekrar dene.');return false;}
 fqSavedOutput.windows.add(popup);fqSavedOutput.pending=popup;
 const current=()=>request===fqSavedOutput.request&&user===authUid&&epoch===fqEpoch&&editor===isEditor()&&!popup.closed;
 try{
  popup.opener=null;popup.document.body.textContent='Kayıtlı teklif hazırlanıyor…';
  let query=sb.from('teklifler').select(FQ_SAVED_OUTPUT_FIELDS).eq('id',id);if(!editor)query=query.eq('bayi_id',user);
  const {data,error}=await query.single();
  if(!current()){fqCloseSavedOutput(popup);return false;}
  if(error||!data||data.id!==id||!editor&&data.bayi_id!==user)throw Error('access');
  const snapshot=fqSavedQuoteSnapshot(data);
  if(kind==='print'){
   popup.document.open();popup.document.write(fqSavedQuoteHTML(snapshot));popup.document.close();
   const button=popup.document.getElementById('fqSavedPrintButton');if(button)button.addEventListener('click',()=>popup.print());
   popup.focus();popup.print();
  }else{
   let phone=snapshot.phone.replace(/[^\d+]/g,'');if(phone.startsWith('+'))phone=phone.slice(1);if(/^0\d{10}$/.test(phone))phone='90'+phone.slice(1);else if(/^\d{10}$/.test(phone))phone='90'+phone;
   const recipient=/^[1-9]\d{7,14}$/.test(phone)?'phone='+encodeURIComponent(phone)+'&':'';
   popup.location.href='https://api.whatsapp.com/send?'+recipient+'text='+encodeURIComponent(fqSavedQuoteMessage(snapshot));
  }
  if(fqSavedOutput.pending===popup)fqSavedOutput.pending=null;return true;
 }catch(e){const report=current();fqCloseSavedOutput(popup);if(report)alert(e.message==='snapshot'?'Kayıtlı fiyat bilgileri eksik veya tutarsız olduğu için çıktı hazırlanamadı. Teklifi İncele düğmesiyle kontrol et.':'Kayıtlı teklif açılamadı. Bağlantını ve bu teklife erişimini kontrol edip tekrar dene.');return false;}
}
function fqPrintSavedQuote(id){return fqOpenSavedOutput(id,'print');}
function fqShareSavedQuote(id){return fqOpenSavedOutput(id,'share');}
