/* Customer presentation: build a separate allowlist of public offer fields. */
'use strict';

function fqCustomerViewElement(tag,text,className){
 const el=document.createElement(tag);if(text!=null)el.textContent=String(text);if(className)el.className=className;return el;
}
function fqCustomerViewDialog(){
 let dialog=$('fqCustomerView');if(dialog)return dialog;
 const style=document.createElement('style');style.textContent=`
 #fqCustomerView{box-sizing:border-box;position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:#f5f7fb;color:#17243b;font:16px/1.5 system-ui,sans-serif;overflow:auto}
 #fqCustomerView::backdrop{background:#f5f7fb}
 #fqCustomerView .fq-cv-page{box-sizing:border-box;max-width:1180px;margin:auto;padding:32px}
 #fqCustomerView .fq-cv-header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:30px}
 #fqCustomerView h1{font-size:clamp(24px,4vw,36px);line-height:1.2;color:#17243b;margin:0}
 #fqCustomerView .fq-cv-brand{color:#42648b;font-weight:700;letter-spacing:.06em;margin:0 0 10px}
 #fqCustomerView .fq-cv-close{flex-shrink:0;border:1px solid #8293ab;background:#fff;color:#17243b;border-radius:10px;padding:10px 16px;font:inherit;cursor:pointer}
 #fqCustomerView :focus-visible{outline:3px solid #2074c5;outline-offset:4px}
 #fqCustomerView .fq-cv-table-wrap{overflow:auto;border:1px solid #d6dfec;border-radius:14px;background:#fff}
 #fqCustomerView table{width:100%;border-collapse:collapse;margin:0;font-size:16px}
 #fqCustomerView th,#fqCustomerView td{background:transparent;color:#17243b;text-align:left;vertical-align:top;padding:18px;border:0;border-bottom:1px solid #e2e8f1;white-space:normal}
 #fqCustomerView th{background:#eaf0f8;font-size:13px;font-weight:700}
 #fqCustomerView td.fq-cv-number,#fqCustomerView th.fq-cv-number{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
 #fqCustomerView tbody tr:last-child td{border-bottom:0}
 #fqCustomerView .fq-cv-model{font-size:17px;font-weight:750;overflow-wrap:anywhere}
 #fqCustomerView .fq-cv-product{color:#52637a;font-size:14px;margin-top:5px;overflow-wrap:anywhere}
 #fqCustomerView .fq-cv-totals{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:18px;margin-top:24px}
 #fqCustomerView .fq-cv-total{box-sizing:border-box;min-width:240px;flex:1;background:#fff;border:1px solid #d6dfec;border-radius:14px;padding:24px}
 #fqCustomerView .fq-cv-total-label{color:#52637a;font-size:16px}
 #fqCustomerView .fq-cv-total-amount{color:#123f6f;font-size:clamp(28px,5vw,44px);font-weight:800;line-height:1.2;margin-top:8px;font-variant-numeric:tabular-nums}
 #fqCustomerView .fq-cv-payment{color:#52637a;margin-top:12px;overflow-wrap:anywhere}
 @media(max-width:620px){#fqCustomerView .fq-cv-page{padding:18px 12px}#fqCustomerView .fq-cv-header{align-items:flex-start;gap:12px}#fqCustomerView .fq-cv-close{font-size:14px;padding:8px 10px}#fqCustomerView th,#fqCustomerView td{padding:12px 8px}#fqCustomerView .fq-cv-model{font-size:14px}#fqCustomerView .fq-cv-product{font-size:12px}#fqCustomerView table{font-size:14px}#fqCustomerView .fq-cv-total{padding:18px;min-width:0;flex-basis:100%}}
 `;document.head.appendChild(style);
 dialog=document.createElement('dialog');dialog.id='fqCustomerView';dialog.setAttribute('aria-labelledby','fqCustomerViewTitle');
 dialog.addEventListener('close',()=>dialog.replaceChildren());
 dialog.addEventListener('cancel',()=>dialog.replaceChildren());
 document.body.appendChild(dialog);return dialog;
}
function fqCloseCustomerView(){
 const dialog=$('fqCustomerView');if(!dialog)return;if(dialog.open)dialog.close();dialog.replaceChildren();
}
function fqCustomerViewSnapshot(){
 if(!authUid||!fqFlow.ready||!fqDataReady||fqFlow.busy||fqFlow.restoring||fqFlow.review||fqPricingError){throw Error('Ürün ve fiyatların yüklenmesini bekle; güncel fiyat kontrolü varsa önce onayla.');}
 const selected=quoteRows.filter(r=>r.kod),items=teklifItems();
 if(!items.length)throw Error('Önce teklifine ürün ekle.');
 if(items.length!==selected.length||selected.some(r=>r.veriHata||r._codePending))throw Error('Bütün ürünlerin fiyatları hazır olduğunda müşteriye gösterebilirsin.');
 // A focused field may still contain an edit that has not reached the pricing engine.
 for(const input of document.querySelectorAll('#rows [data-fq-row][data-fq-field]')){
  const row=quoteRows[Number(input.dataset.fqRow)],field=input.dataset.fqField;if(!row)continue;
  const parsed=trSayi(input.value);
  if(field!=='kod'&&input.value.trim()&&parsed==null)throw Error('Son değişikliğin fiyatını hesaplamak için alanı tamamlayıp tekrar dene.');
  const pending=field==='kod'?input.value.trim():parsed??0,current=field==='kod'?String(row.kod||''):+row[field]||0;
  if(pending!==current||!input.checkValidity())throw Error('Son değişikliğin fiyatını hesaplamak için alanı tamamlayıp tekrar dene.');
 }
 const installments=Number($('taksit').value)||0;
 const hasInstallments=komisOran>0||(installments>1&&!!$('banka').value)||(lastTot&&lastTot.manuelT!=null)||items.some(r=>r.isET&&+r.manuelTaksit>0);
 if(!lastTot||!Number.isFinite(lastTot.finalNakit)||lastTot.finalNakit<=0||(hasInstallments&&(!Number.isFinite(lastTot.finalTaksit)||lastTot.finalTaksit<=0)))throw Error('Teklif toplamını kontrol et.');
 const rows=teklifSatirlar(items).rows.map(({r,netP,netT})=>({model:String(r.kod),product:String(r.ad||''),quantity:FiyatIQCore.quantity(r.adet),cash:netP,installment:netT}));
 if(rows.some(r=>!Number.isFinite(r.cash)||r.cash<0||(hasInstallments&&(!Number.isFinite(r.installment)||r.installment<0))))throw Error('Ürün fiyatlarını kontrol et.');
 const cash=Math.round(lastTot.finalNakit),installment=Math.round(lastTot.finalTaksit);
 if(rows.reduce((sum,r)=>sum+r.cash,0)!==cash||(hasInstallments&&rows.reduce((sum,r)=>sum+r.installment,0)!==installment))throw Error('Ürün fiyatları ve teklif toplamı uyuşmuyor.');
 return {rows,cash,installment,hasInstallments,bank:hasInstallments?bankaAdi():'',installments,validityText:fqValidityText()};
}
function fqShowCustomerView(){
 fqCloseCustomerView();let offer;try{offer=fqCustomerViewSnapshot();}catch(error){alert(error.message);return false;}
 const dialog=fqCustomerViewDialog(),page=fqCustomerViewElement('div',null,'fq-cv-page'),header=fqCustomerViewElement('div',null,'fq-cv-header'),heading=document.createElement('div');
 heading.appendChild(fqCustomerViewElement('p','FiyatIQ','fq-cv-brand'));
 const title=fqCustomerViewElement('h1','Size özel teklif');title.id='fqCustomerViewTitle';heading.appendChild(title);header.appendChild(heading);
 const close=fqCustomerViewElement('button','Geri dön','fq-cv-close');close.type='button';close.setAttribute('aria-label','Müşteri görünümünü kapat');close.addEventListener('click',fqCloseCustomerView);header.appendChild(close);page.appendChild(header);
 const wrap=fqCustomerViewElement('div',null,'fq-cv-table-wrap'),table=document.createElement('table'),thead=document.createElement('thead'),headRow=document.createElement('tr');
 ['Ürün','Adet','Peşin satır toplamı',...(offer.hasInstallments?['Taksitli satır toplamı']:[])].forEach((label,i)=>{const th=fqCustomerViewElement('th',label,i?'fq-cv-number':null);th.scope='col';headRow.appendChild(th);});thead.appendChild(headRow);table.appendChild(thead);
 const body=document.createElement('tbody');
 for(const row of offer.rows){
  const tr=document.createElement('tr'),product=document.createElement('td');product.appendChild(fqCustomerViewElement('div',row.model,'fq-cv-model'));if(row.product)product.appendChild(fqCustomerViewElement('div',row.product,'fq-cv-product'));tr.appendChild(product);
  for(const value of [row.quantity,fmt(row.cash)+' ₺',...(offer.hasInstallments?[fmt(row.installment)+' ₺']:[])])tr.appendChild(fqCustomerViewElement('td',value,'fq-cv-number'));body.appendChild(tr);
 }
 table.appendChild(body);wrap.appendChild(table);page.appendChild(wrap);
 const totals=fqCustomerViewElement('div',null,'fq-cv-totals');
 function addTotal(label,amount,payment){const card=fqCustomerViewElement('div',null,'fq-cv-total');card.appendChild(fqCustomerViewElement('div',label,'fq-cv-total-label'));card.appendChild(fqCustomerViewElement('div',fmt(amount)+' ₺','fq-cv-total-amount'));if(payment)card.appendChild(fqCustomerViewElement('div',payment,'fq-cv-payment'));totals.appendChild(card);}
 addTotal('Peşin toplam',offer.cash);
 if(offer.hasInstallments)addTotal('Taksitli toplam',offer.installment,[offer.bank,offer.installments>1?offer.installments+' taksit':null].filter(Boolean).join(' · '));
 page.appendChild(totals);page.appendChild(fqCustomerViewElement('p',offer.validityText,'fq-cv-payment'));dialog.appendChild(page);dialog.showModal();return true;
}
