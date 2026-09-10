/* Stok tarihleri, dosyadaki stok_tarihi alanıdır; ekrandaki sorgu saati değildir. */
function stockFreshnessFromRows(rows){
  if(!Array.isArray(rows))return null;
  const depots=['mars','horoz','kadikoy'].map(key=>({key,count:0,mevcutRows:0,ayrilmisRows:0,mevcut:0,ayrilmis:0,dates:[]}));
  for(const row of rows){
    if(!row||typeof row!=='object')continue;
    const depot=depots.find(d=>d.key===row.depo);if(!depot)continue;
    const kind=row.tip==='ayrilmis'?'ayrilmis':'mevcut';
    depot.count++;depot[kind+'Rows']++;depot[kind]+=Number.isFinite(Number(row.adet))?Number(row.adet):0;
    depot.dates.push({kind,value:typeof row.stok_tarihi==='string'?row.stok_tarihi:null});
  }
  return {depots};
}
function stockFreshnessToday(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=name=>parts.find(p=>p.type===name).value;
  return part('year')+'-'+part('month')+'-'+part('day');
}
function stockFreshnessDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const stamp=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value?stamp/86400000:null;
}
function stockFreshnessState(info,now=new Date()){
  if(!info||!Array.isArray(info.depots))return null;
  const today=stockFreshnessDay(stockFreshnessToday(now));
  const depots=info.depots.map(depot=>{
    const valid=[];let missing=false,invalid=false,future=false;
    for(const date of depot.dates){
      if(date.value===null||date.value.trim()===''){missing=true;continue;}
      const day=stockFreshnessDay(date.value);
      if(day===null){invalid=true;continue;}
      if(day>today){future=true;continue;}
      valid.push({date:date.value,age:today-day});
    }
    valid.sort((a,b)=>a.date.localeCompare(b.date));
    const oldest=valid[0]||null,threshold=depot.key==='kadikoy'?7:3;
    const status=!depot.count?'absent':invalid||future?'invalid':missing?'unknown':oldest&&oldest.age>threshold?'stale':oldest?'dated':'unknown';
    return {...depot,status,missing,invalid,future,date:oldest?oldest.date:null,age:oldest?oldest.age:null,threshold};
  });
  const present=depots.filter(d=>d.count),dated=present.filter(d=>d.date).sort((a,b)=>a.date.localeCompare(b.date));
  const status=!present.length?'absent':present.some(d=>d.status==='invalid')?'invalid':present.some(d=>d.status==='unknown')?'unknown':present.some(d=>d.status==='stale')?'stale':'dated';
  return {depots,status,date:dated[0]?dated[0].date:null,age:dated[0]?dated[0].age:null};
}
function stockFreshnessDepotDate(info,key,now=new Date()){
  const state=stockFreshnessState(info,now),depot=state&&state.depots.find(d=>d.key===key);
  return depot&&['dated','stale'].includes(depot.status)?depot.date:null;
}
function stockFreshnessHTML(row,now=new Date()){
  if(!row||!row.kod)return '';
  const safe=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state=stockFreshnessState(row.stockFreshness,now);
  if(!state)return '<span class="stock-summary fq-stock-freshness">'+(row.veriHata==='Stok sorgulanamadı'?'Stok tarihi: doğrulanamadı':'Stok tarihi: bekleniyor')+'</span>';
  const format=date=>date?date.slice(8,10)+'.'+date.slice(5,7)+'.'+date.slice(0,4):'';
  const ageText=age=>age===0?'bugün':age===1?'dün':age+' gün önce';
  let summary='Stok tarihi: ';
  if(state.status==='absent')summary+='kayıt bulunamadı';
  else if(state.status==='invalid')summary+='tarih kontrolü gerekli';
  else if(state.status==='unknown')summary+='eksik tarih var';
  else summary+=format(state.date)+' · '+ageText(state.age)+(state.status==='stale'?' · kontrol edin':'');
  const ownLabel=typeof depoAdi==='function'?depoAdi():'Kendi depo';
  const lines=state.depots.map(depot=>{
    const label=depot.key==='mars'?'Mars':depot.key==='horoz'?'Horoz':ownLabel;
    if(!depot.count)return '<span style="display:block"><b>'+safe(label)+'</b>: Bu ürün için stok kaydı yok.</span>';
    let text='';
    if(depot.future)text='İleri tarih var; güncellik doğrulanamadı.';
    else if(depot.invalid)text='Geçersiz tarih var; güncellik doğrulanamadı.';
    else if(depot.missing)text='Tarihi eksik kayıt var; güncellik bilinmiyor.';
    else text=format(depot.date)+' · '+ageText(depot.age)+(depot.status==='stale'?' · stoğu teyit edin':'');
    if(depot.date&&(depot.missing||depot.invalid||depot.future))text+=' Bilinen en eski tarih: '+format(depot.date)+'.';
    const quantity=(kind,label)=>label+' '+(depot[kind+'Rows']?depot[kind].toLocaleString('tr-TR'):'kaydı yok');
    return '<span style="display:block"><b>'+safe(label)+'</b>: '+safe(text)+' <span style="opacity:.8">('+safe(quantity('mevcut','mevcut')+' / '+quantity('ayrilmis','ayrılan'))+')</span></span>';
  }).join('');
  const warning=['unknown','invalid','stale'].includes(state.status);
  return '<details class="stock-summary fq-stock-freshness" style="white-space:normal"><summary style="cursor:pointer;'+(warning?'color:var(--warn);':'')+'">'+safe(summary)+'</summary><span style="display:block;margin:4px 0;font-size:11px;line-height:1.6">'+lines+'<span style="display:block;opacity:.75">Tarih, stok kaydındaki sayım tarihidir. Mevcut ve ayrılan kayıtların en eski tarihi esas alınır.</span></span></details>';
}
