/* Yönetim raporu: yetkili kayıtların tamamında sunucu filtresi ve sayfalama. */
'use strict';
const fqAdminReport={mode:'quotes',filters:{quotes:null,sales:null},page:0,size:50,total:0,request:0,timer:null,loading:false,exporting:false,exportRequest:0,rows:[],summary:null};
const FQ_SALE_PAYMENT={nakit:'Nakit',havale:'Havale / EFT',kart:'Kart',karma:'Karma ödeme',diger:'Diğer'};
function fqAdminReportAllowed(){return !!authUid&&!!profil&&isEditor();}
function fqAdminReportFilters(){
 const filters={p_ara:String(($('tfAra')||{}).value||'').trim(),p_baslangic:($('tfBas')||{}).value||null,p_bitis:($('tfBit')||{}).value||null,p_magaza:($('tfMagaza')||{}).value||null};
 if(fqAdminReport.mode==='quotes')filters.p_durum=($('tfDurum')||{}).value||null;
 return filters;
}
function fqAdminReportScope(){return {uid:authUid,epoch:fqEpoch,role:profil&&profil.rol,brands:JSON.stringify(profil&&profil.marka_erisimi||[]),mode:fqAdminReport.mode};}
function fqAdminReportCurrent(scope,filters){return fqAdminReportAllowed()&&scope.uid===authUid&&scope.epoch===fqEpoch&&scope.role===profil.rol&&scope.brands===JSON.stringify(profil.marka_erisimi||[])&&scope.mode===fqAdminReport.mode&&JSON.stringify(filters)===JSON.stringify(fqAdminReportFilters());}
function fqAdminReportRPC(mode){return mode==='sales'?'fq_satis_raporu':'fq_teklif_raporu';}
function fqAdminReportMonthDates(offset=0,now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit'}).formatToParts(now),year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value)-1+offset;
 return {p_baslangic:new Date(Date.UTC(year,month,1)).toISOString().slice(0,10),p_bitis:new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10)};
}
function fqAdminReportSetFilters(filters){
 if(filters.p_magaza)fqAdminReportStores([filters.p_magaza]);
 for(const [id,key] of [['tfAra','p_ara'],['tfBas','p_baslangic'],['tfBit','p_bitis'],['tfMagaza','p_magaza'],['tfDurum','p_durum']])if($(id))$(id).value=filters[key]||'';
}
function fqAdminReportCancelExport(){fqAdminReport.exportRequest++;fqAdminReport.exporting=false;fqAdminReportExportButton();}
function fqAdminReportMode(mode){
 if(!['quotes','sales'].includes(mode)||mode===fqAdminReport.mode)return;
 const previous=fqAdminReportFilters();fqAdminReport.filters[fqAdminReport.mode]=previous;
 fqAdminReport.mode=mode;fqAdminReport.page=0;fqAdminReportCancelExport();
 const filters=fqAdminReport.filters[mode]||(mode==='sales'?{...fqAdminReportMonthDates(),p_ara:previous.p_ara,p_magaza:previous.p_magaza}:{});
 fqAdminReportSetFilters(filters);fqAdminReportAppearance();return fqLoadAdminQuotes();
}
function fqAdminReportMonth(offset){
 if(fqAdminReport.mode!=='sales')return;
 const filters={...fqAdminReportFilters(),...fqAdminReportMonthDates(offset)};
 fqAdminReportSetFilters(filters);fqAdminReport.page=0;fqAdminReportCancelExport();return fqLoadAdminQuotes();
}
function fqAdminReportMessage(message){const e=$('tekliflerMsg');if(e)e.textContent=message||'';}
function fqAdminReportDate(value,dateOnly=false){
 if(!value)return '—';
 if(dateOnly){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));return m?`${m[3]}.${m[2]}.${m[1]}`:'—';}
 const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'—';
}
function fqAdminReportMoney(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value).toLocaleString('tr-TR',{maximumFractionDigits:2})+' ₺':'Girilmedi';}
function fqAdminReportValidateFilters(filters){
 if(filters.p_baslangic&&filters.p_bitis&&filters.p_baslangic>filters.p_bitis)throw Error((fqAdminReport.mode==='sales'?'Satış':'Teklif')+' başlangıç tarihi bitiş tarihinden sonra olamaz.');
}
function fqAdminReportResult(data,mode=fqAdminReport.mode){
 if(!data||Array.isArray(data)||!Array.isArray(data.rows)||!Array.isArray(data.stores)||!data.summary)throw Error('Rapor yanıtı alınamadı. Tekrar deneyin.');
 const total=Number(data.total_count),s=data.summary;
 if(!Number.isSafeInteger(total)||total<0||data.rows.some(r=>!r||typeof r.id!=='string'))throw Error('Rapor eksik geldi. Tekrar deneyin.');
 const fields=mode==='sales'?['sale_count','actual_sale_total','average_actual_sale']:['quote_count','cash_total','average_cash','sold_count','sold_cash_total','conversion_rate','actual_sale_count','actual_sale_total','missing_actual_count'];
 for(const key of fields)if(s[key]===null||s[key]===undefined||!Number.isFinite(Number(s[key])))throw Error('Rapor özeti eksik geldi. Tekrar deneyin.');
 if(mode==='sales'&&(data.undated_sales_count===null||data.undated_sales_count===undefined||!Number.isSafeInteger(Number(data.undated_sales_count))||Number(data.undated_sales_count)<0))throw Error('Satış tarihi eksik kayıtların sayısı alınamadı. Tekrar deneyin.');
 return {...data,total_count:total};
}
function fqAdminReportClearRows(text=''){
 fqAdminReport.rows=[];fqAdminReport.summary=null;fqAdminReport.total=0;
 const body=$('tekliflerList'),summary=$('tfOzet');if(summary)summary.innerHTML='';
 const undated=$('fqAdminUndatedNote');if(undated){undated.textContent='';undated.hidden=true;}
 if(body)body.innerHTML=text?`<tr><td colspan="12" class="mut">${esc(text)}</td></tr>`:'';
 fqAdminReportPaging();
}
function fqAdminReportPaging(){
 const previous=$('fqAdminPrev'),next=$('fqAdminNext'),label=$('fqAdminPage');
 if(previous)previous.disabled=fqAdminReport.loading||fqAdminReport.page===0||fqAdminReport.total===0;
 if(next)next.disabled=fqAdminReport.loading||(fqAdminReport.page+1)*fqAdminReport.size>=fqAdminReport.total;
 const noun=fqAdminReport.mode==='sales'?'satış':'teklif';
 if(label)label.textContent=fqAdminReport.loading?'Yükleniyor…':fqAdminReport.total?`${fqAdminReport.page*fqAdminReport.size+1}–${Math.min((fqAdminReport.page+1)*fqAdminReport.size,fqAdminReport.total)} / ${fqAdminReport.total} ${noun}`:'0 '+noun;
}
function fqAdminReportExportButton(){const button=$('fqAdminExport');if(button){button.disabled=fqAdminReport.exporting;button.textContent=fqAdminReport.exporting?'Excel hazırlanıyor…':"⬇ Excel'e aktar";}}
function fqAdminReportStores(stores){
 const select=$('tfMagaza');if(!select)return;
 const selected=select.value,values=[...new Set(stores.filter(value=>typeof value==='string'&&value))];
 // A formerly selected store must not silently become an unfiltered query after deletion.
 if(selected&&!values.includes(selected))values.push(selected);
 select.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='Hepsi';select.appendChild(all);
 values.sort((a,b)=>a.localeCompare(b,'tr')).forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option);});select.value=selected;
}
function fqAdminReportRender(data){
 fqAdminReport.rows=data.rows;fqAdminReport.summary=data.summary;fqAdminReport.total=data.total_count;
 fqAdminReportStores(data.stores);
 const s=data.summary,summary=$('tfOzet'),sales=fqAdminReport.mode==='sales';
 const card=(label,value,color='var(--txt)')=>`<div class="card" style="margin:0;padding:10px 14px;min-width:130px"><div class="mut" style="font-size:11px">${esc(label)}</div><div style="font-size:18px;font-weight:800;color:${color}">${esc(value)}</div></div>`;
 if(summary)summary.innerHTML=sales?card('Satış sayısı',s.sale_count)+card('Gerçekleşen satış toplamı',fqAdminReportMoney(s.actual_sale_total),'var(--ok)')+card('Ortalama satış tutarı',fqAdminReportMoney(s.average_actual_sale)):card('Teklif sayısı',s.quote_count)+card('Peşin teklif toplamı',fqAdminReportMoney(s.cash_total))+card('Ortalama peşin teklif',fqAdminReportMoney(s.average_cash))+card('Satıldı · peşin karşılığı',s.sold_count+' · '+fqAdminReportMoney(s.sold_cash_total),'var(--ok)')+card('Dönüşüm','%'+Number(s.conversion_rate).toLocaleString('tr-TR',{minimumFractionDigits:1,maximumFractionDigits:1}))+card('Bu tekliflerde gerçekleşen satış',s.actual_sale_count+' · '+fqAdminReportMoney(s.actual_sale_total),'var(--ok)')+card('Satıldı · tutarı girilmemiş',s.missing_actual_count,Number(s.missing_actual_count)>0?'var(--warn)':'var(--txt)');
 const undated=$('fqAdminUndatedNote');if(undated){undated.hidden=!sales;undated.style.color=Number(data.undated_sales_count)>0?'var(--warn)':'var(--mut)';undated.textContent=sales?`Satış tarihi eksik veya geçersiz ${Number(data.undated_sales_count)} “Satıldı” kaydı var. Bu sayı tüm dönemlerdeki seçili mağaza ve aramayı kapsar; seçili ayın satış sayısı değildir. Bu kayıtlar bir aya atanamadığı için tarih esaslı satış raporuna dahil edilmez.`:'';}
 const body=$('tekliflerList');if(!body)return;
 body.innerHTML=data.rows.length?data.rows.map(t=>{
  const known=t.gercek_satis_tutari!==null&&t.gercek_satis_tutari!==undefined&&t.gercek_satis_tutari!==''&&Number.isFinite(Number(t.gercek_satis_tutari));
  const activeSale=t.durum==='satildi',amount=activeSale?fqAdminReportMoney(t.gercek_satis_tutari):'—';
  const payment=activeSale&&known?[FQ_SALE_PAYMENT[t.satis_odeme_sekli]||'Ödeme girilmedi',t.satis_banka||'',t.satis_taksit_sayisi?t.satis_taksit_sayisi+' taksit':''].filter(Boolean).join(' · '):'—';
  const color=t.durum==='satildi'?'var(--ok)':t.durum==='kaybedildi'?'var(--bad)':'var(--txt)';
  const status=`<select aria-label="Teklif durumu" style="width:118px;font-size:12px;color:${color}" data-quote-id="${esc(t.id)}" onchange="setTeklifDurum(this.dataset.quoteId,this.value)">${Object.keys(DURUM_AD).map(key=>`<option value="${key}"${t.durum===key?' selected':''}>${DURUM_AD[key]}</option>`).join('')}</select>`;
  const products=String(t.urunler||'');
  return `<tr><td><b>${esc(t.no||'—')}</b></td><td>${esc(fqAdminReportDate(sales?t.satis_tarihi:t.tarih,sales))}</td><td>${esc(t.magaza||'—')}</td><td>${esc(t.personel||'—')}</td><td>${esc(t.musteri||'—')}${t.tel?' · '+esc(t.tel):''}</td><td>${esc(t.marka||'—')}</td><td class="num">${esc(fqAdminReportMoney(t.toplam))}</td><td class="num">${esc(amount)}</td><td>${esc(payment)}${!sales&&activeSale&&known&&t.satis_tarihi?'<div class="mut" style="font-size:11px">'+esc(fqAdminReportDate(t.satis_tarihi,true))+'</div>':''}</td><td>${status}</td><td class="mut" style="font-size:11px">${esc(products.slice(0,70))}${products.length>70?' …':''}</td><td><button class="ghost sm" data-quote-id="${esc(t.id)}" onclick="openTeklifDetay(this.dataset.quoteId)">İncele</button> <button class="ghost sm" data-quote-id="${esc(t.id)}" onclick="fqOpenFollowup(this.dataset.quoteId)">Takip</button></td></tr>`;
 }).join(''):`<tr><td colspan="12" class="mut">Bu filtreye uyan ${sales?'satış':'teklif'} yok.</td></tr>`;
}
async function fqLoadAdminQuotes(){
 if(fqAdminReport.timer!==null){clearTimeout(fqAdminReport.timer);fqAdminReport.timer=null;}
 if(!fqAdminReportAllowed()){fqResetAdminReport();return;}
 const request=++fqAdminReport.request,scope=fqAdminReportScope(),filters=fqAdminReportFilters(),page=fqAdminReport.page;
 const current=()=>request===fqAdminReport.request&&fqAdminReportCurrent(scope,filters);
 fqAdminReport.loading=true;fqAdminReportClearRows(scope.mode==='sales'?'Satışlar yükleniyor…':'Teklifler yükleniyor…');fqAdminReportStores([]);fqAdminReportMessage('');
 try{
  fqAdminReportValidateFilters(filters);
  const {data,error}=await sb.rpc(fqAdminReportRPC(scope.mode),{...filters,p_page:page,p_page_size:fqAdminReport.size});
  if(!current())return;
  if(error)throw Error('Rapor alınamadı. Bağlantınızı ve rapor yetkinizi kontrol edip tekrar deneyin.');
  const report=fqAdminReportResult(data,scope.mode);
  if(page>0&&page*fqAdminReport.size>=report.total_count){fqAdminReport.page=Math.max(0,Math.ceil(report.total_count/fqAdminReport.size)-1);return fqLoadAdminQuotes();}
  fqAdminReportRender(report);
 }catch(error){if(current()){fqAdminReportClearRows('Rapor yüklenemedi.');fqAdminReportMessage(error.message||'Rapor yüklenemedi. Tekrar deneyin.');}}
 finally{if(request===fqAdminReport.request){fqAdminReport.loading=false;fqAdminReportPaging();}}
}
function fqAdminReportSearch(){
 if(fqAdminReport.timer!==null)clearTimeout(fqAdminReport.timer);
 fqAdminReport.request++;fqAdminReport.page=0;fqAdminReport.loading=true;fqAdminReportCancelExport();fqAdminReportClearRows(fqAdminReport.mode==='sales'?'Satışlar yükleniyor…':'Teklifler yükleniyor…');fqAdminReportMessage('');
 fqAdminReport.timer=setTimeout(()=>{fqAdminReport.timer=null;fqLoadAdminQuotes();},300);
}
function fqAdminReportReset(){fqAdminReportSetFilters(fqAdminReport.mode==='sales'?fqAdminReportMonthDates():{});fqAdminReport.page=0;fqAdminReportCancelExport();return fqLoadAdminQuotes();}
function fqAdminReportPage(delta){if(fqAdminReport.loading)return;const page=fqAdminReport.page+delta;if(page<0||page*fqAdminReport.size>=fqAdminReport.total)return;fqAdminReport.page=page;return fqLoadAdminQuotes();}
function fqAdminReportExcelText(value){const text=String(value??'');return /^[\s\u0000-\u001f]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text)?"'"+text:text;}
async function fqExportAdminQuotes(){
 if(!fqAdminReportAllowed()||fqAdminReport.exporting)return;
 const request=++fqAdminReport.exportRequest,scope=fqAdminReportScope(),filters=fqAdminReportFilters(),size=500;
 const sales=scope.mode==='sales',noun=sales?'satış':'teklif',plural=sales?'satışlar':'teklifler';
 const current=()=>request===fqAdminReport.exportRequest&&fqAdminReportCurrent(scope,filters);
 fqAdminReport.exporting=true;fqAdminReportExportButton();fqAdminReportMessage(`Excel için tüm eşleşen ${plural} hazırlanıyor…`);
 try{
  fqAdminReportValidateFilters(filters);
  let total=null,revision=null,page=0;const records=[],seen=new Set();
  const fetchPage=async page=>{
   const {data,error}=await sb.rpc(fqAdminReportRPC(scope.mode),{...filters,p_page:page,p_page_size:size});
   if(!current())throw Error('Filtre veya oturum değiştiği için Excel aktarımı iptal edildi. Güncel filtrelerle tekrar deneyin.');
   if(error)throw Error('Excel hazırlanamadı. Bağlantınızı kontrol edip tekrar deneyin.');
   const report=fqAdminReportResult(data,scope.mode);
   if(typeof report.report_revision!=='string'||!report.report_revision)throw Error('Rapor bütünlüğü doğrulanamadı. Excel oluşturulmadı.');
   return report;
  };
  do{
   const report=await fetchPage(page);
   if(total===null){total=report.total_count;revision=report.report_revision;}
   if(total!==report.total_count||revision!==report.report_revision)throw Error(`Aktarım sırasında ${plural} değişti. Güncel kayıtlarla tekrar deneyin.`);
   const expected=Math.max(0,Math.min(size,total-page*size));
   if(report.rows.length!==expected)throw Error(`${sales?'Satışların':'Tekliflerin'} tamamı alınamadı. Excel oluşturulmadı; tekrar deneyin.`);
   for(const row of report.rows){if(seen.has(row.id))throw Error('Aktarım sırasında kayıt sırası değişti. Tekrar deneyin.');seen.add(row.id);records.push(row);}
   page++;fqAdminReportMessage(`${records.length} / ${total} ${noun} Excel için hazırlanıyor…`);
  }while(records.length<total);
  if(!total){fqAdminReportMessage(`Aktarılacak ${noun} yok.`);return;}
  const final=await fetchPage(0);
  if(final.total_count!==total||final.report_revision!==revision)throw Error(`Aktarım sırasında ${plural} değişti. Güncel kayıtlarla tekrar deneyin.`);
  const text=fqAdminReportExcelText;
  const table=[['Teklif No',sales?'Satış tarihi':'Teklif tarihi (Türkiye)','Mağaza','Personel','Müşteri','Telefon','Marka','Peşin teklif tutarı','Durum','Ürünler','Gerçekleşen satış tutarı','Ödeme şekli','Banka','Taksit sayısı',sales?'Teklif tarihi (Türkiye)':'Satış tarihi']];
  records.forEach(r=>{
   const sale=r.durum==='satildi',known=sale&&r.gercek_satis_tutari!==null&&r.gercek_satis_tutari!==undefined&&r.gercek_satis_tutari!==''&&Number.isFinite(Number(r.gercek_satis_tutari));
   table.push([text(r.no),text(fqAdminReportDate(sales?r.satis_tarihi:r.tarih,sales)),text(r.magaza),text(r.personel),text(r.musteri),text(r.tel),text(r.marka),Number(r.toplam),text(DURUM_AD[r.durum]||r.durum),text(r.urunler),known?Number(r.gercek_satis_tutari):sale?'Girilmedi':'',known?text(FQ_SALE_PAYMENT[r.satis_odeme_sekli]||r.satis_odeme_sekli):'',known?text(r.satis_banka):'',known&&r.satis_taksit_sayisi!==null&&r.satis_taksit_sayisi!==undefined?Number(r.satis_taksit_sayisi):'',sales?text(fqAdminReportDate(r.tarih)):known?text(fqAdminReportDate(r.satis_tarihi,true)):'']);
  });
  const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(table);
  sheet['!cols']=[16,23,20,18,24,18,12,19,14,44,24,18,22,14,16].map(wch=>({wch}));
  XLSX.utils.book_append_sheet(workbook,sheet,sales?'Gerçekleşen satışlar':'Teklifler');
  const s=final.summary;
  const context=[['Rapor kapsamı',sales?'Seçilen tarihler gerçekleşen satış tarihidir; teklifin oluşturulma tarihi değildir.':'Seçilen tarihler teklifin oluşturulma tarihidir (Türkiye).'],['Başlangıç',text(filters.p_baslangic||'Hepsi')],['Bitiş',text(filters.p_bitis||'Hepsi')],['Mağaza',text(filters.p_magaza||'Hepsi')],['Arama',text(filters.p_ara||'Yok')],...(sales?[
   ['Tablodaki durum','Satıldı'],['Özet kapsamı','Seçilen satış tarihi, mağaza ve aramaya uyan tarihli satışlar.'],['Satış sayısı',Number(s.sale_count)],['Gerçekleşen satış toplamı',Number(s.actual_sale_total)],['Ortalama satış tutarı',Number(s.average_actual_sale)],['Satış tarihi eksik veya geçersiz kayıt',Number(final.undated_sales_count)],['Tarihsiz kayıtların kapsamı','Tüm dönemlerdeki seçili mağaza ve aramadaki Satıldı kayıtlarıdır. Seçili ayın satış sayısı değildir; bir aya atanamadıkları için tarih esaslı rapora dahil edilmez.']
  ]:[['Tablodaki durum',text(DURUM_AD[filters.p_durum]||'Hepsi')],['Özet kapsamı','Tarih, mağaza ve aramadaki tüm durumlar; durum filtresi özeti değiştirmez.'],['Teklif sayısı',Number(s.quote_count)],['Peşin teklif toplamı',Number(s.cash_total)],['Satıldı sayısı',Number(s.sold_count)],['Dönüşüm (%)',Number(s.conversion_rate)],['Bu tekliflerde gerçekleşen satış toplamı',Number(s.actual_sale_total)],['Satış tutarı girilmiş kayıt',Number(s.actual_sale_count)],['Satıldı, tutarı girilmemiş kayıt',Number(s.missing_actual_count)]]),['Açıklama','Gerçekleşen satış, müşterinin kabul ettiği tutardır; tahsilat bilgisi değildir.']];
  const contextSheet=XLSX.utils.aoa_to_sheet(context);contextSheet['!cols']=[{wch:43},{wch:100}];XLSX.utils.book_append_sheet(workbook,contextSheet,'Rapor kapsamı');
  if(!current())throw Error('Filtre veya oturum değiştiği için Excel aktarımı iptal edildi.');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');
  await XLSX.writeFile(workbook,`${sales?'Gerceklesen_Satislar':'Teklifler'}_${date}.xlsx`);
  if(current())fqAdminReportMessage(`${total} ${noun} Excel dosyasına aktarıldı.`);
 }catch(error){if(request===fqAdminReport.exportRequest&&scope.uid===authUid&&scope.epoch===fqEpoch&&fqAdminReportAllowed())fqAdminReportMessage(error.message||'Excel hazırlanamadı. Tekrar deneyin.');}
 finally{if(request===fqAdminReport.exportRequest){fqAdminReport.exporting=false;fqAdminReportExportButton();}}
}
function fqResetAdminReport(){
 if(fqAdminReport.timer!==null)clearTimeout(fqAdminReport.timer);
 fqAdminReport.request++;fqAdminReport.exportRequest++;fqAdminReport.timer=null;fqAdminReport.page=0;fqAdminReport.loading=false;fqAdminReport.exporting=false;
 fqAdminReport.mode='quotes';fqAdminReport.filters={quotes:null,sales:null};
 for(const id of ['tfAra','tfBas','tfBit','tfDurum'])if($(id))$(id).value='';
 if($('tfMagaza'))$('tfMagaza').innerHTML='<option value="">Hepsi</option>';
 fqAdminReportAppearance();fqAdminReportClearRows();fqAdminReportMessage('');fqAdminReportExportButton();
}
function fqAdminReportAppearance(){
 const sales=fqAdminReport.mode==='sales',body=$('tekliflerList'),card=$('tekliflerCard');
 const heading=body&&body.closest('table').querySelector('thead tr');if(heading)heading.innerHTML=['Teklif No',sales?'Satış tarihi':'Teklif tarihi','Mağaza','Personel','Müşteri','Marka','Peşin teklif','Gerçekleşen satış','Ödeme','Durum','Ürünler','Detay'].map(label=>'<th>'+esc(label)+'</th>').join('');
 for(const [id,label] of [['tfBas',(sales?'Satış':'Teklif')+' başlangıç tarihi'],['tfBit',(sales?'Satış':'Teklif')+' bitiş tarihi']]){const input=$(id),element=input&&input.closest('.fld').querySelector('label');if(element){element.textContent=label;element.htmlFor=id;}}
 const status=$('tfDurum');if(status){status.disabled=sales;const field=status.closest('.fld');if(field){field.hidden=sales;field.style.display=sales?'none':'';}}
 const mode=$('fqAdminMode');if(mode)mode.value=fqAdminReport.mode;
 const months=$('fqAdminMonths');if(months){months.hidden=!sales;months.style.display=sales?'flex':'none';}
 const note=$('fqAdminScopeNote');if(note)note.textContent=(sales?'Özet, seçilen satış tarihi, mağaza ve aramaya uyan Satıldı kayıtlarını kapsar. ':'Özet seçilen teklif tarihi, mağaza ve aramadaki tüm durumları kapsar. Durum filtresi yalnız listeyi daraltır. ')+'Gerçekleşen satış, müşterinin kabul ettiği tutardır; tahsilat bilgisi değildir.';
 if(card){const title=card.querySelector('h2');if(title)title.innerHTML=sales?'📑 Gerçekleşen satışlar <span class="badge">satış tarihine göre</span>':'📑 Teklifler <span class="badge">mağazalardan gelen</span>';const intro=card.querySelector('p');if(intro){const refresh=intro.querySelector('button');intro.textContent=sales?'Satış tarihi girilmiş Satıldı kayıtları bu raporda yer alır. ':'Mağazaların çıktı aldığı her teklif buraya otomatik düşer. ';if(refresh)intro.appendChild(refresh);}}
}
function fqAdminReportMount(){
 const body=$('tekliflerList'),summary=$('tfOzet');if(!body||!summary)return;
 if(!$('fqAdminMode')){const controls=document.createElement('div');controls.className='row';controls.style.cssText='margin-bottom:12px;gap:12px;align-items:flex-end';controls.innerHTML='<div class="fld"><label for="fqAdminMode">Rapor görünümü</label><select id="fqAdminMode"><option value="quotes">Teklifler</option><option value="sales">Gerçekleşen satışlar</option></select></div><div id="fqAdminMonths" class="row" style="gap:8px;display:none" hidden><button id="fqAdminThisMonth" class="ghost sm" type="button">Bu ay</button><button id="fqAdminPreviousMonth" class="ghost sm" type="button">Önceki ay</button></div>';$('tfAra').closest('.row').insertAdjacentElement('beforebegin',controls);$('fqAdminMode').addEventListener('change',event=>fqAdminReportMode(event.target.value));$('fqAdminThisMonth').addEventListener('click',()=>fqAdminReportMonth(0));$('fqAdminPreviousMonth').addEventListener('click',()=>fqAdminReportMonth(-1));}
 if(!$('fqAdminScopeNote')){const note=document.createElement('p');note.id='fqAdminScopeNote';note.className='mut';summary.insertAdjacentElement('afterend',note);}
 if(!$('fqAdminUndatedNote')){const note=document.createElement('p');note.id='fqAdminUndatedNote';note.className='mut';note.style.fontSize='12px';note.hidden=true;$('fqAdminScopeNote').insertAdjacentElement('afterend',note);}
 if(!$('fqAdminPaging')){const paging=document.createElement('div');paging.id='fqAdminPaging';paging.className='row';paging.style.cssText='margin:10px 0;gap:10px';paging.innerHTML='<button id="fqAdminPrev" class="ghost sm" type="button">Önceki</button><span id="fqAdminPage" class="mut" aria-live="polite">0 teklif</span><button id="fqAdminNext" class="ghost sm" type="button">Sonraki</button>';$('gridWrap2').insertAdjacentElement('afterend',paging);$('fqAdminPrev').addEventListener('click',()=>fqAdminReportPage(-1));$('fqAdminNext').addEventListener('click',()=>fqAdminReportPage(1));}
 const exportButton=document.querySelector('button[onclick="teklifExcel()"]');if(exportButton)exportButton.id='fqAdminExport';
 fqAdminReportAppearance();fqAdminReportPaging();
}
fqAdminReportMount();
