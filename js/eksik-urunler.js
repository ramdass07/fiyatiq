/* Eksik katalog bilgileri: mevcut yetkilerle salt okunur liste kontrolü. */
'use strict';
const fqCatalogCheck={request:0,loading:false,rows:[],scope:null,page:0,size:50,loaded:false};
const FQ_CATALOG_SOURCES={central:{title:'Mağaza listesi',cost:'toptan_fiyatlar',retail:'perakende_fiyatlar'},dealer:{title:'Dış bayi listesi',cost:'bayi_toptan_fiyatlar',retail:'bayi_perakende_fiyatlar'}};
function fqCatalogAllowed(p=profil){return !!authUid&&!!p&&(p.rol==='admin'||p.rol==='personel'&&['aktif','deneme'].includes(p.abonelik_durumu));}
function fqCatalogBrandAllowed(p=profil,mk=brand){return fqCatalogAllowed(p)&&['bosch','siemens'].includes(mk);}
function fqCatalogAccess(){const card=$('fqCatalogCard');if(card)card.style.display=fqCatalogAllowed()?'':'none';if(!fqCatalogAllowed())fqCatalogReset();}
function fqCatalogClear(message='Listeyi kontrol etmek için Yenile düğmesine basın.'){
 fqCatalogCheck.rows=[];fqCatalogCheck.scope=null;fqCatalogCheck.page=0;fqCatalogCheck.loaded=false;
 if($('fqCatalogSummary'))$('fqCatalogSummary').textContent='';
 if($('fqCatalogRows'))$('fqCatalogRows').replaceChildren();
 if($('fqCatalogStatus'))$('fqCatalogStatus').textContent=message;
 if($('fqCatalogPage'))$('fqCatalogPage').textContent='';
 for(const id of ['fqCatalogPrev','fqCatalogNext'])if($(id))$(id).disabled=true;
}
function fqCatalogReset(){
 fqCatalogCheck.request++;fqCatalogCheck.loading=false;fqCatalogClear();
 const d=$('fqCatalogDialog');if(d&&d.open)d.close();
 if($('fqCatalogSource'))$('fqCatalogSource').value='central';
 if($('fqCatalogSearch'))$('fqCatalogSearch').value='';
 if($('fqCatalogKind'))$('fqCatalogKind').value='all';
 if($('fqCatalogCurrentOnly'))$('fqCatalogCurrentOnly').checked=true;
 if($('fqCatalogContext'))$('fqCatalogContext').textContent='';
 if($('fqCatalogRefresh'))$('fqCatalogRefresh').disabled=false;
 const card=$('fqCatalogCard');if(card)card.style.display=fqCatalogAllowed()?'':'none';
}
function fqCatalogCurrent(scope){return scope.request===fqCatalogCheck.request&&scope.uid===authUid&&scope.epoch===fqEpoch&&scope.brand===brand&&scope.source===$('fqCatalogSource').value&&$('fqCatalogDialog').open&&fqCatalogBrandAllowed()&&scope.role===profil.rol;}
function fqCatalogPositive(value){return (typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)>0;}
function fqCatalogFold(value){return String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');}
function fqCatalogRows(catalog,costs,retail){
 const map=new Map();
 for(const [kind,items] of [['catalog',catalog],['cost',costs],['retail',retail]])for(const item of items){
  const code=String(item.model_kodu||'').trim().toUpperCase();if(!code)throw Error('Ürün kodu eksik kayıt var; liste tamamlanamadı.');
  if(!map.has(code))map.set(code,{code,name:'',cost:null,retail:null,current:false});const row=map.get(code);
  if(kind==='catalog')row.name=String(item.urun_adi||'').trim();
  else{row.current=true;if(kind==='cost')row.cost=item.toptan_fiyat;else row.retail=item.nakit_fiyat;}
 }
 return [...map.values()].map(r=>({...r,missingCost:!fqCatalogPositive(r.cost),missingRetail:!fqCatalogPositive(r.retail),missingName:!r.name||r.name.toUpperCase()===r.code})).sort((a,b)=>a.code.localeCompare(b.code,'tr'));
}
async function fqCatalogPeriod(scope){
 const source=FQ_CATALOG_SOURCES[scope.source];
 const {data,error}=await sb.from(source.cost).select('donem').eq('marka',scope.brand).order('donem',{ascending:false}).limit(1);
 if(error||!Array.isArray(data))throw Error('Fiyat dönemi okunamadı. Bağlantı ve erişimi kontrol ederek tekrar deneyin.');
 const value=data[0]?.donem||null;if(value&&!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(value))throw Error('Fiyat dönemi geçersiz; liste tamamlanamadı.');
 // Same fallback as the sales screen when fl_aktif_donem returns null.
 return {period:value||_donem(),hasCostPeriod:!!value};
}
async function fqCatalogReadAll(table,fields,scope,period){
 const rows=[],seen=new Set();let total=null;
 for(let offset=0;;offset+=500){
  if(!fqCatalogCurrent(scope))return null;
  let query=sb.from(table).select(fields,{count:'exact'}).eq('marka',scope.brand);
  if(period)query=query.eq('donem',period);
  const {data,error,count}=await query.order('model_kodu',{ascending:true}).range(offset,offset+499);
  if(!fqCatalogCurrent(scope))return null;
  if(error||!Array.isArray(data))throw Error('Ürün listeleri okunamadı. Bağlantı ve erişimi kontrol ederek tekrar deneyin.');
  if(!Number.isSafeInteger(count)||count<0||total!==null&&count!==total)throw Error('Liste tarama sırasında değişti veya sayısı doğrulanamadı. Yenile ile tekrar deneyin.');
  total=count;
  if(data.length!==Math.min(500,total-offset))throw Error('Liste eksik geldi. Yenile ile tekrar deneyin.');
  for(const row of data){const code=String(row.model_kodu||'').trim().toUpperCase();if(!code||seen.has(code))throw Error('Tekrarlanan veya boş ürün kodu var; liste tamamlanamadı.');seen.add(code);rows.push(row);}
  if(rows.length===total)return rows;
 }
}
async function fqCatalogLoad(){
 if(!fqCatalogBrandAllowed()){fqCatalogReset();return;}
 const source=$('fqCatalogSource').value;if(!FQ_CATALOG_SOURCES[source])return;
 const scope={request:++fqCatalogCheck.request,uid:authUid,epoch:fqEpoch,brand,source,role:profil.rol};
 fqCatalogCheck.loading=true;fqCatalogClear('Listeler kontrol ediliyor…');$('fqCatalogRefresh').disabled=true;
 $('fqCatalogContext').textContent=markaAd(scope.brand)+' · '+FQ_CATALOG_SOURCES[source].title;
 try{
  // Confirm the protected profile instead of trusting a stale editor UI alone.
  const profile=await sb.from('profiller').select('rol,abonelik_durumu,marka_erisimi').eq('id',scope.uid).single();
  if(!fqCatalogCurrent(scope))return;
  if(profile.error||!fqCatalogBrandAllowed(profile.data,scope.brand))throw Error('Bu liste için merkez erişimi doğrulanamadı. Yeniden giriş yapın.');
  const period=await fqCatalogPeriod(scope);if(!fqCatalogCurrent(scope))return;Object.assign(scope,period);
  const src=FQ_CATALOG_SOURCES[source];
  const [catalog,costs,retail]=await Promise.all([fqCatalogReadAll('urunler','model_kodu,urun_adi',scope),fqCatalogReadAll(src.cost,'model_kodu,toptan_fiyat',scope,scope.period),fqCatalogReadAll(src.retail,'model_kodu,nakit_fiyat',scope,scope.period)]);
  if(!fqCatalogCurrent(scope))return;
  const after=await fqCatalogPeriod(scope);if(!fqCatalogCurrent(scope))return;
  if(after.period!==scope.period||after.hasCostPeriod!==scope.hasCostPeriod)throw Error('Fiyat dönemi tarama sırasında değişti. Yenile ile tekrar deneyin.');
  fqCatalogCheck.rows=fqCatalogRows(catalog,costs,retail);fqCatalogCheck.scope=scope;fqCatalogCheck.loaded=true;fqCatalogCheck.page=0;
  $('fqCatalogContext').textContent=markaAd(scope.brand)+' · '+src.title+' · Dönem: '+scope.period.slice(0,7)+(scope.hasCostPeriod?'':' · Toptan listesi yok; satış ekranının kullandığı ay kontrol edildi.');
  fqCatalogCheck.loading=false;fqCatalogRender();
 }catch(error){if(fqCatalogCurrent(scope))fqCatalogClear(error.message||'Liste yüklenemedi. Tekrar deneyin.');}
 finally{if(scope.request===fqCatalogCheck.request){fqCatalogCheck.loading=false;$('fqCatalogRefresh').disabled=false;}}
}
function fqCatalogRender(){
 const state=fqCatalogCheck;if(!state.loaded||!state.scope)return;
 if(!fqCatalogCurrent(state.scope)){fqCatalogReset();return;}
 const currentOnly=$('fqCatalogCurrentOnly').checked,query=fqCatalogFold($('fqCatalogSearch').value.trim()),kind=$('fqCatalogKind').value;
 const scopeRows=state.rows.filter(r=>(!currentOnly||r.current)&&(!query||fqCatalogFold(r.code+' '+r.name).includes(query)));
 const issues=scopeRows.filter(r=>r.missingCost||r.missingRetail||r.missingName);
 const rows=issues.filter(r=>kind==='all'||kind==='cost'&&r.missingCost||kind==='retail'&&r.missingRetail||kind==='name'&&r.missingName);
 state.page=Math.min(state.page,Math.max(0,Math.ceil(rows.length/state.size)-1));
 $('fqCatalogSummary').textContent=`${scopeRows.length} ürün içinde ${issues.length} üründe eksik bilgi · Maliyet: ${scopeRows.filter(r=>r.missingCost).length} · Peşin perakende: ${scopeRows.filter(r=>r.missingRetail).length} · Katalog adı: ${scopeRows.filter(r=>r.missingName).length}`;
 const body=$('fqCatalogRows');body.replaceChildren();
 const price=v=>fqCatalogPositive(v)?Number(v).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺':v===null||v===undefined||typeof v==='string'&&!v.trim()?'Eksik':'Geçersiz';
 for(const row of rows.slice(state.page*state.size,(state.page+1)*state.size)){
  const tr=document.createElement('tr');const missing=[row.missingCost?'Maliyet':'',row.missingRetail?'Peşin perakende':'',row.missingName?'Katalog adı':''].filter(Boolean);
  for(const [label,value] of [['Ürün kodu',row.code],['Katalog ürün adı',row.missingName?'Katalog adı eksik':row.name],['Liste maliyeti',price(row.cost)],['Peşin perakende',price(row.retail)],['Eksik bilgi',missing.join(' · ')+(row.current?'':' · Bu dönem fiyat listelerinde yok')]]){
   const td=document.createElement('td');td.dataset.label=label;td.textContent=value;tr.append(td);
  }
  body.append(tr);
 }
 $('fqCatalogStatus').textContent=rows.length?`${rows.length} ürün listeleniyor. Özetteki sayılar ürün kapsamı ve aramaya göredir; eksik türleri aynı üründe birleşebilir.`:scopeRows.length?'Bu filtrelere uyan eksik bilgi bulunmadı.':'Bu kapsamda ürün bulunmadı.';
 $('fqCatalogPage').textContent=rows.length?`Sayfa ${state.page+1} / ${Math.ceil(rows.length/state.size)}`:'0 ürün';
 $('fqCatalogPrev').disabled=state.page===0;$('fqCatalogNext').disabled=(state.page+1)*state.size>=rows.length;
}
async function fqCatalogOpen(){
 if(!fqCatalogBrandAllowed())return;
 const d=$('fqCatalogDialog');if(!d.open)d.showModal();await fqCatalogLoad();
}
function fqCatalogMount(){
 const anchor=$('topluGuncelleme');if(!anchor||$('fqCatalogCard'))return;
 const card=document.createElement('section');card.className='card';card.id='fqCatalogCard';card.style.display='none';
 card.innerHTML='<h2><button id="fqCatalogHeadingOpen" class="ghost" type="button" aria-haspopup="dialog" aria-controls="fqCatalogDialog">Eksik ürün bilgileri <span aria-hidden="true">›</span></button></h2><p class="mut">Seçili markanın katalog adlarını, maliyetlerini ve peşin perakende fiyatlarını kontrol edin.</p><button id="fqCatalogOpen" type="button" aria-haspopup="dialog" aria-controls="fqCatalogDialog">Eksik bilgileri incele</button>';
 anchor.insertAdjacentElement('beforebegin',card);
 const dialog=document.createElement('dialog');dialog.id='fqCatalogDialog';dialog.className='fq-dialog';dialog.setAttribute('aria-labelledby','fqCatalogTitle');
 dialog.innerHTML=`<div class="fq-catalog-head"><h2 id="fqCatalogTitle">Eksik ürün bilgileri</h2><button id="fqCatalogClose" class="ghost" type="button">Kapat</button></div>
 <p id="fqCatalogContext" class="mut"></p>
 <div class="fq-catalog-controls"><label>Fiyat kaynağı<select id="fqCatalogSource"><option value="central">Mağaza listesi</option><option value="dealer">Dış bayi listesi</option></select></label><label>Eksik bilgi türü<select id="fqCatalogKind"><option value="all">Tüm eksikler</option><option value="cost">Maliyet eksik / geçersiz</option><option value="retail">Peşin perakende eksik / geçersiz</option><option value="name">Katalog adı eksik</option></select></label><label>Ürün kodu veya adı<input id="fqCatalogSearch" type="search" placeholder="Ürün ara" maxlength="100"></label><button id="fqCatalogRefresh" type="button" class="ghost">Yenile</button></div>
 <label class="fq-catalog-scope"><input id="fqCatalogCurrentOnly" type="checkbox" checked>Yalnız bu dönem fiyat listelerinde yer alan ürünler</label>
 <p class="mut fq-catalog-note">İşareti kaldırınca eski katalog ürünleri de görünür. Katalog adı boş olsa da satış ekranı stok kaydındaki adı gösterebilir. Liste maliyeti BİP öncesidir; sıfır veya negatif fiyatlar geçersiz sayılır.</p>
 <p id="fqCatalogSummary"></p><p id="fqCatalogStatus" role="status" aria-live="polite"></p>
 <div class="fq-catalog-table"><table><thead><tr><th>Ürün kodu</th><th>Katalog ürün adı</th><th>Liste maliyeti</th><th>Peşin perakende</th><th>Eksik bilgi</th></tr></thead><tbody id="fqCatalogRows"></tbody></table></div>
 <div class="fq-catalog-paging"><button id="fqCatalogPrev" class="ghost" type="button" disabled>Önceki</button><span id="fqCatalogPage"></span><button id="fqCatalogNext" class="ghost" type="button" disabled>Sonraki</button></div>
 <p class="mut fq-catalog-note">Fiyatları Aylık Veri Güncelleme veya ilgili fiyat yükleme alanından, katalog adlarını ürün adı sütunu içeren toptan listeyle güncelleyebilirsiniz. Ardından Yenile'ye basın. Bu liste bilgilendirme amaçlıdır; satışa engel koymaz.</p>`;
 document.body.append(dialog);
 const style=document.createElement('style');style.textContent=`
 #fqCatalogCard h2{margin:0}#fqCatalogHeadingOpen{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:44px;padding:8px 0;text-align:left;font:inherit;border:0;border-radius:6px}#fqCatalogHeadingOpen:hover{color:var(--acc)}#fqCatalogHeadingOpen:focus-visible{outline:2px solid var(--acc);outline-offset:4px}#fqCatalogOpen{min-height:44px}
 #fqCatalogDialog{width:calc(100% - 24px);max-width:1080px;box-sizing:border-box}#fqCatalogDialog *{box-sizing:border-box}
 .fq-catalog-head,.fq-catalog-paging{display:flex;align-items:center;justify-content:space-between;gap:12px}.fq-catalog-head h2{margin:0}
 .fq-catalog-controls{display:flex;align-items:end;flex-wrap:wrap;gap:12px}.fq-catalog-controls label{display:flex;flex:1 1 190px;flex-direction:column;gap:6px}.fq-catalog-controls input,.fq-catalog-controls select{width:100%;min-width:0}
 .fq-catalog-scope{display:flex;align-items:center;gap:8px;margin:16px 0 8px}.fq-catalog-scope input{width:auto}.fq-catalog-note{font-size:12px;line-height:1.6}.fq-catalog-table{overflow-x:auto}.fq-catalog-table td{overflow-wrap:anywhere}.fq-catalog-paging{justify-content:flex-start;margin-top:14px}
 @media(max-width:700px){#fqCatalogDialog{padding:16px}.fq-catalog-controls label{flex-basis:100%}.fq-catalog-controls input,.fq-catalog-controls select,#fqCatalogDialog button{min-height:44px;font-size:16px}.fq-catalog-table table,.fq-catalog-table tbody{display:block}.fq-catalog-table thead{display:none}.fq-catalog-table tr{display:block;border:1px solid var(--line);border-radius:8px;margin:10px 0;padding:8px}.fq-catalog-table td{display:grid;grid-template-columns:115px minmax(0,1fr);gap:8px;padding:6px;border:0;white-space:normal}.fq-catalog-table td::before{content:attr(data-label);font-weight:600;color:var(--mut)}.fq-catalog-table{overflow:visible}}
 `;document.head.append(style);
 for(const id of ['fqCatalogHeadingOpen','fqCatalogOpen'])$(id).addEventListener('click',fqCatalogOpen);
 $('fqCatalogClose').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{fqCatalogCheck.request++;fqCatalogCheck.loading=false;fqCatalogClear();$('fqCatalogRefresh').disabled=false;});
 $('fqCatalogRefresh').addEventListener('click',fqCatalogLoad);$('fqCatalogSource').addEventListener('change',fqCatalogLoad);
 for(const [id,event] of [['fqCatalogSearch','input'],['fqCatalogKind','change'],['fqCatalogCurrentOnly','change']])$(id).addEventListener(event,()=>{fqCatalogCheck.page=0;fqCatalogRender();});
 for(const [id,delta] of [['fqCatalogPrev',-1],['fqCatalogNext',1]])$(id).addEventListener('click',()=>{fqCatalogCheck.page=Math.max(0,fqCatalogCheck.page+delta);fqCatalogRender();});
}
fqCatalogMount();
