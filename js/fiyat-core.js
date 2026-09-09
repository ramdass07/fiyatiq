/* FiyatIQ: browser + Node shared calculation rules. No database or DOM access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FiyatIQCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const katNorm=s=>String(s||'').toUpperCase().replace(/[İı]/g,'I').replace(/Ş/g,'S').replace(/Ğ/g,'G').replace(/Ü/g,'U').replace(/Ö/g,'O').replace(/Ç/g,'C').trim();
// Bosch July 2026 Solo Perakende, rows 190–197 (model type only, no price import).
const BOSCH_SOLO_HOBS=new Set(['PBP0C2K80O','PBP0C2K80L','PBP0C5K80O','POP0C6O12O','POP0C6P30O','POP0C6K31O','POP0C2P30O','POP0C2K31O']);
function isBoschSoloHob(code){return BOSCH_SOLO_HOBS.has(String(code||'').trim().toUpperCase().replace(/\/\d{2}$/,''));}
const SIEMENS_LOW=["HB012FBH1T", "HB012FBB1T", "HB012FBW1T", "HB237JES0T", "HB237JES5T", "HB557JYH2T", "HB557JYS5T", "HB557JYW5T", "HB134FES1T", "HB134FES3T", "HI133FES3T", "HI133FEW3T", "HB234FEW3T", "HB234FEH2T", "HB514FBH2T", "HB514FBH0T", "HB534FER3T", "HB534FER0T", "HB514FBR1T", "HB214FBS1T", "HB214FBW1T"];
const SIEMENS_HIGH=["HB778G3B1", "HR776G3B1", "HS736G1B2", "HB776G1B1", "HB734G1B1", "HR232GEB3", "HB557JEB6T", "HJ852GYN0T", "HJ852GYB0T", "HJ852GYW0T", "HU736AEG0T", "HU736AEV0T", "HU736AEA0T", "HU736AEN0T", "HU717ABN0T", "HU717ABA0T", "HU717ABV0T"];
const BOSCH_LOW=["HBF514BB0T", "HBF514BB1T", "HBF512BB1T", "HBF514BW1T", "HBF512BW1T", "HBF514BH1T", "HBF512BH1T", "HBF514BS0T", "HBF514BS1T", "HBF534ES0T", "HBF534ES3T", "HBF534EB0T", "HBF534EB3T", "HBF534EW0T", "HBF534EW3T", "HBF534EH1T", "HBF534EH3T", "HIF534EB0T", "HIF534EB3T", "HIF534EW3T", "HBF537EG0T", "HBF537EG5T", "HBJ558YS0T", "HBJ558YS5T", "HBJ558YB5T", "HBJ558YW5T", "HBJ558YH5T"];
const BOSCH_EXCLUDED=["HBF514BB0T", "HBF514BB1T", "HBF512BB1T", "HBF514BW1T", "HBF512BW1T", "HBF514BH1T", "HBF512BH1T", "HBF514BS0T", "HBF514BS1T", "HBF534ES0T", "HBF534ES3T", "HBF534EB0T", "HBF534EB3T", "HBF534EW0T", "HBF534EW3T", "HBF534EH1T", "HBF534EH3T", "HIF534EB0T", "HIF534EB3T", "HIF534EW3T", "HBF537EG0T", "HBF537EG5T", "HBJ558YS0T", "HBJ558YS5T", "HBJ558YB5T", "HBJ558YW5T", "HBJ558YH5T", "HBF010BA0T", "HBF010BA1T", "HBF010BR0T", "HBF010BR1T", "HBF011BR0T", "HBF011BV1T", "HBF113BA0T", "HBF113BR0T", "HBF113BV0T", "PBP6C2B80O", "PBP6C2B82O", "PBP6C2K80O", "PBP6C5B82L", "PBP6C5B82O", "PBP6C5K80O", "PBP6C6B82O", "PBP6C6K80O", "PBY6C5B82L", "DFT63CA21T", "DFT63CA51T", "DFT63CA61T", "DWP64CC20T", "DWP64CC50T", "DWP64CC60T"];
const BOSCH_COMMON_EXCLUDED=["PBP6C2B80O", "PBP6C2B82O", "PBP6C2K80O", "PBP6C5B82L", "PBP6C5B82O", "PBP6C5K80O", "PBP6C6B82O", "PBP6C6K80O", "PBY6C5B82L", "DFT63CA21T", "DFT63CA51T", "DFT63CA61T", "DWP64CC20T", "DWP64CC50T", "DWP64CC60T"];
// Verified September 3–15 rules. Source details: BUNDLE_KONTROLU_20260908.md.
// Scoped to brand, exact campaign period, type and published amounts; later months are untouched.
function septemberPolicy(k){
 const start=String(k.baslangic_tarihi||k.baslangic||'').slice(0,10),end=String(k.bitis_tarihi||k.bitis||'').slice(0,10);
 if(start!=='2026-09-03'||end!=='2026-09-15'||!['siemens','bosch'].includes(k.marka))return k;
 const cats=(k.kategoriler||[]).map(katNorm),ind=+k.musteri_indirimi,hak=+k.hakedis;
 const pair=['any2','all'].includes(k.match_type),ank=cats.includes('ANKASTRE')||['FIRIN','OCAK','DAVLUMBAZ'].every(x=>cats.includes(x));
 let policy=null;
 if(pair&&!ank&&ind===5000&&hak===4000&&cats.includes('CAMASIR')&&cats.includes('BULASIK'))policy={excludeLaundryPair:true};
 if(pair&&!ank&&ind===10000&&hak===8000&&cats.includes('CAMASIR')&&cats.includes('KURUTMA'))policy={kategoriler:['CAMASIR','KURUTMA'],match_type:'all'};
 if(k.marka==='siemens'&&ank&&ind===5000&&hak===3700)policy={secili_modeller:SIEMENS_LOW,match_type:'all',kategoriler:['FIRIN','OCAK','DAVLUMBAZ']};
 if(k.marka==='siemens'&&ank&&ind===12800&&hak===9800)policy={secili_modeller:SIEMENS_HIGH,match_type:'all',kategoriler:['FIRIN','OCAK','DAVLUMBAZ']};
 if(k.marka==='bosch'&&ank&&ind===5000&&hak===3700)policy={secili_modeller:BOSCH_LOW,match_type:'all',kategoriler:['FIRIN','OCAK','DAVLUMBAZ'],excludeSoloHobs:true};
 if(k.marka==='bosch'&&ank&&ind===12600&&hak===9800)policy={secili_modeller:[],match_type:'all',kategoriler:['FIRIN','OCAK','DAVLUMBAZ'],excludeSoloHobs:true};
 if(!policy)return k;
 const excluded=[...(k.haric_modeller||[])];
 if(k.marka==='siemens'&&ank)excluded.push('EB6C5PK80O','EB6C5PB82O','LC64PCC20T','LC64PCC50T','LC64PCC60T');
 if(k.marka==='bosch'&&ank)excluded.push(...(hak===9800?BOSCH_EXCLUDED:BOSCH_COMMON_EXCLUDED));
 return {...k,...policy,haric_modeller:[...new Set(excluded)],_verifiedBundle:true};
}
function uniqueCampaigns(campaigns){
 const seen=new Set();
 return campaigns.map(septemberPolicy).filter(k=>{
  if(!k._verifiedBundle)return true;
  const list=v=>[...new Set((v||[]).map(katNorm))].sort();
  const key=JSON.stringify([k.marka,String(k.baslangic_tarihi||k.baslangic).slice(0,10),String(k.bitis_tarihi||k.bitis).slice(0,10),k.aktif!==false,k.match_type,+k.hakedis,+k.musteri_indirimi,list(k.kategoriler),list(k.secili_modeller),list(k.haric_modeller),!!k.excludeLaundryPair,!!k.excludeSoloHobs]);
  if(seen.has(key))return false;seen.add(key);return true;
 });
}
function kategoriOf(code){const c=String(code||'').toUpperCase().trim();
 if(/^G/.test(c))return ['DERINDONDURUCU'];if(/^K/.test(c))return ['BUZDOLABI'];if(/^W[QTD]/.test(c))return ['KURUTMA'];if(/^W/.test(c))return ['CAMASIR'];if(/^S/.test(c))return ['BULASIK'];if(/^A[SC]/.test(c))return ['KLIMA'];
 if(/^(HEZ|HZ)\d/.test(c))return [];if(/^(HTB|HXA|HXR)/.test(c))return ['SOLO_FIRIN'];if(/^H/.test(c))return ['FIRIN','ANKASTRE'];if(/^[PE]/.test(c))return ['OCAK','ANKASTRE'];if(/^(LC|LB|LH|D)/.test(c))return ['DAVLUMBAZ','ANKASTRE'];if(/^(BE|BF|CM|CF|FE|FC)/.test(c))return ['MIKRODALGA','ANKASTRE'];if(/^(BC|BG|BB)/.test(c))return ['SUPURGE'];if(/^(T|MS|MC|MF|MM|MU)/.test(c))return ['KEA'];return [];}
function quantity(v){const n=Number(v==null?1:v);if(!Number.isSafeInteger(n)||n<1||n>10000)throw Error('Adet 1–10000 arasında tam sayı olmalı.');return n;}
function commission(v){const n=Number(v);if(!Number.isFinite(n)||n<0||n>=100)throw Error('Komisyon 0 ile 100 arasında olmalı (%100 hariç).');return n;}
function money(v){if(v==null||v==='')return 0;if(typeof v==='number'){if(!Number.isFinite(v)||v<0)throw Error('Geçersiz tutar.');return v;}
 let s=String(v).trim().replace(/\s|₺|TL/gi,'');
 if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
 else if(/^\d+(,\d{1,2})$/.test(s))s=s.replace(',','.');
 else if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Belirsiz sayı biçimi: '+String(v).slice(0,30));
 const n=Number(s);if(!Number.isFinite(n)||n<0)throw Error('Geçersiz tutar.');return n;}
function businessDate(date=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const get=t=>p.find(x=>x.type===t).value;return get('year')+'-'+get('month')+'-'+get('day');}
function campaignActive(k,day=businessDate()){const start=k.baslangic_tarihi||k.baslangic;const end=k.bitis_tarihi||k.bitis;return k.aktif!==false&&(!start||String(start).slice(0,10)<=day)&&(!end||String(end).slice(0,10)>=day);}
function calcParts(r,kar,komis,nakit=null){komis=commission(komis);const adet=quantity(r.adet);kar=Number(kar);if(!Number.isFinite(kar)||kar<0)throw Error('Kâr oranı geçersiz.');
 const unitToptan=r.isET?(+r.etToptan||0):(+r.toptan||0),unitBip=r.isET?0:(+r.bip||0),unitBipli=unitToptan-unitBip;
 const manuelP=r.isET&&+r.manuelFiyat>0,manuelT=r.isET&&+r.manuelTaksit>0;
 const cash=r.nakitSecili&&nakit>0?nakit:null;
 const tak=!manuelP&&!manuelT&&!cash?(+r.ikiliTaksit>0?+r.ikiliTaksit:(+r.kampFiyat>0?+r.kampFiyat:null)):null;
 let unitNakit=manuelP?+r.manuelFiyat:cash!=null?cash:tak!=null?tak*(1-komis/100):+r.primliFiyat>0?+r.primliFiyat:unitBipli*(1+kar/100);
 let unitTaksit=manuelT?+r.manuelTaksit:unitNakit/(1-komis/100);
 // Pair prices apply only to matched quantities; remainder keeps its normal pricing.
 const paired=Number(r.ikiliAdet||0);
 if(paired>0&&paired<adet&&!manuelP&&!manuelT){const base=calcParts({...r,adet:adet-paired,ikiliAdet:0,ikiliTaksit:null,ikiliNakit:null,ikiliFiyat:null},kar,komis,r.normalNakit||null);
 unitNakit=(unitNakit*paired+base.unitNakit*(adet-paired))/adet;unitTaksit=(unitTaksit*paired+base.unitTaksit*(adet-paired))/adet;}
 const karPesin=unitBipli>0?(unitNakit/unitBipli-1)*100:0;
 const karTaksit=unitBipli>0?(unitTaksit*(1-komis/100)/unitBipli-1)*100:0;
 return {adet,unitToptan,unitBip,unitBipli,unitNakit,unitTaksit,karPct:komis>0?karTaksit:karPesin,karPesin,karTaksit};}
function applyPairs(rows,list){rows.forEach(r=>{Object.assign(r,{ikiliFiyat:null,ikiliTaksit:null,ikiliEksik:null,ikiliBilgi:null,ikiliNakit:null,ikiliEsIdx:null,ikiliEsler:[],ikiliBundle:false,ikiliAdet:0});});
 const left=rows.map(r=>quantity(r.adet));
 for(const p of list){if(p.a===p.b)continue;const aa=rows.map((r,i)=>r.kod.toUpperCase()===p.a?i:-1).filter(i=>i>=0),bb=rows.map((r,i)=>r.kod.toUpperCase()===p.b?i:-1).filter(i=>i>=0);
  if(!aa.length||!bb.length){for(const i of aa.concat(bb))if(!rows[i].ikiliAdet)rows[i].ikiliEksik={kod:aa.length?p.b:p.a,toplam:p.pesin,bitis:p.bitis};continue;}
  for(const ia of aa)for(const ib of bb){if(!left[ia]||!left[ib])continue;const n=Math.min(left[ia],left[ib]),ra=rows[ia],rb=rows[ib];
   // A row cannot mix two distinct pair prices; split it into separate rows to choose another pair.
   if((ra.ikiliBilgi&&ra.ikiliBilgi.id!==p.id)||(rb.ikiliBilgi&&rb.ikiliBilgi.id!==p.id))continue;
   const cost=r=>Math.max(0,(+r.toptan>0?+r.toptan:+r.etToptan||0)-(+r.bip||0));const a=cost(ra),b=cost(rb),ratio=a>0&&b>0?a/(a+b):0.5;
   const pa=Math.round(p.pesin*ratio*100)/100,pb=Math.round((p.pesin-pa)*100)/100;
   const na=p.nakit>0?Math.round(p.nakit*ratio*100)/100:null,nb=na==null?null:Math.round((p.nakit-na)*100)/100;
   for(const [r,i,j,price,cash]of [[ra,ia,ib,pa,na],[rb,ib,ia,pb,nb]]){const oldN=r.ikiliAdet;r.ikiliAdet+=n;r.ikiliTaksit=r.ikiliFiyat=((r.ikiliTaksit||0)*oldN+price*n)/r.ikiliAdet;r.ikiliNakit=cash==null?null:((r.ikiliNakit||0)*oldN+cash*n)/r.ikiliAdet;r.ikiliBundle=!!p.bundleDahil;r.ikiliBilgi={id:p.id,toplam:p.pesin,nakit:p.nakit,bitis:p.bitis,bundleDahil:!!p.bundleDahil};r.ikiliEsIdx=j;if(!r.ikiliEsler.includes(j))r.ikiliEsler.push(j);left[i]-=n;}
  }
 }
 return rows;}
function calculateCampaigns(applied,rows,options={}){const empty={toplamHak:0,toplamInd:0,dokum:[],bosta:[],dagilim:{},optimal:true};if(options.pairActive)return empty;
 const units=[];for(const r of rows){for(let n=0;n<quantity(r.adet);n++)units.push({kod:String(r.kod).toUpperCase(),kat:kategoriOf(r.kod)[0]||null,soloHob:isBoschSoloHob(r.kod)||r.solo_ocak===true||/SOLO|SET[ -]*USTU/.test(katNorm([r.ad,r.urun_adi,r.kategori,r.urun_tipi].filter(Boolean).join(' ')))});}
 if(!units.length)return empty;if(units.length>24)return {...empty,optimal:false,uyari:'24 adetten büyük sepette hakedişi ayrı tekliflere bölerek hesaplayın.'};
 const candidates=[];let capped=false;const limit=4000;const bit=i=>1n<<BigInt(i);
 const day=options.day||businessDate();let slot=units.length;
 for(const original of uniqueCampaigns(applied)){const k=septemberPolicy(original);if(!campaignActive(k,day))continue;
  const mt=k.match_type,hak=Math.max(0,+k.hakedis||0),ind=Math.max(0,+k.musteri_indirimi||0);if(!hak&&!ind)continue;
  const mods=(k.secili_modeller||[]).map(x=>String(x).toUpperCase()),haric=new Set((k.haric_modeller||[]).map(x=>String(x).toUpperCase()));
  let cats=[...new Set((k.kategoriler||[]).map(katNorm).filter(Boolean))];if(mt==='all'&&cats.includes('ANKASTRE'))cats=[...new Set(cats.filter(x=>x!=='ANKASTRE').concat(['FIRIN','OCAK','DAVLUMBAZ']))];
  const gate=u=>{if(haric.has(u.kod)||(k.excludeSoloHobs&&u.kat==='OCAK'&&u.soloHob))return false;const subset=mods.filter(m=>kategoriOf(m)[0]===u.kat);return !subset.length||subset.includes(u.kod);};
  const eligible=units.map((u,i)=>({u,i})).filter(({u})=>gate(u));
  const once=['model_list','tumu'].includes(mt)?bit(slot++):0n;
  function add(ids){if(candidates.length>=limit){capped=true;return;}if(!ids.length||new Set(ids).size!==ids.length)return;if(k.excludeLaundryPair&&ids.length===2&&['CAMASIR','KURUTMA'].every(cat=>ids.some(i=>units[i].kat===cat)))return;if(mods.length&&!ids.some(i=>mods.includes(units[i].kod)))return;
   candidates.push({mask:ids.reduce((m,i)=>m|bit(i),once),ids,k,hak,ind});}
  const groups=[];
  if(['xl','xxl','xl+xxl'].includes(mt)){for(const {u,i}of eligible)if(u.kat==='BUZDOLABI'&&mods.includes(u.kod))add([i]);}
  else if(mt==='any2'){const pool=cats.length?cats:['BUZDOLABI','DERINDONDURUCU','CAMASIR','KURUTMA','BULASIK'];const es=eligible.filter(({u})=>pool.includes(u.kat));for(let a=0;a<es.length;a++)for(let b=a+1;b<es.length;b++)if(es[a].u.kat!==es[b].u.kat)add([es[a].i,es[b].i]);}
  else if(mt==='all'||mt==='all+any'){
   if(!cats.length)continue;
   if(mt==='all')groups.push(cats);else if(cats.length>=2)for(const other of cats.slice(1))groups.push([cats[0],other]);
   for(const need of groups){const picks=need.map(cat=>eligible.filter(x=>x.u.kat===cat).map(x=>x.i));const visit=(j,ids)=>{if(capped)return;if(j===picks.length){add(ids);return;}for(const i of picks[j])visit(j+1,ids.concat(i));};visit(0,[]);}
  }else if(mt==='model_list'||mt==='tumu'){for(const {u,i}of eligible)if((!mods.length||mods.includes(u.kod))&&(!cats.length||cats.includes(u.kat))&&(mt!=='model_list'||mods.length))add([i]);}
 }
 // Exact weighted set packing for ordinary retail baskets; bounded work fails conservatively.
 const byUnit=units.map((_,i)=>candidates.filter(c=>(c.mask&bit(i))!==0n));const memo=new Map();let states=0,exhausted=false;
 function solve(mask){if(memo.has(mask))return memo.get(mask);if(++states>50000){exhausted=true;return {hak:0,ind:0,list:[]};}
  let i=0;while(i<units.length&&(mask&bit(i)))i++;if(i===units.length)return {hak:0,ind:0,list:[]};
  let best=solve(mask|bit(i));for(const c of byUnit[i]){if(mask&c.mask)continue;const tail=solve(mask|c.mask),hak=c.hak+tail.hak,ind=c.ind+tail.ind;if(hak>best.hak||(hak===best.hak&&ind>best.ind))best={hak,ind,list:[c,...tail.list]};}memo.set(mask,best);return best;}
 const best=solve(0n),dagilim={},used=new Set();const dokum=best.list.map(c=>{for(const i of c.ids){used.add(i);dagilim[units[i].kod]=(dagilim[units[i].kod]||0)+c.hak/c.ids.length;}return {kampanyaId:c.k.id,ikon:'🎁',aciklama:(c.k.ad||'Kampanya')+': '+c.ids.map(i=>units[i].kod).join(' + '),hak:c.hak,ind:c.ind};});
 const leftovers={};if(applied.some(k=>['all','all+any','any2','xl','xxl','xl+xxl'].includes(k.match_type)))units.forEach((u,i)=>{if(!used.has(i)&&u.kat)leftovers[u.kod]=(leftovers[u.kod]||0)+1;});
 return {toplamHak:best.hak,toplamInd:best.ind,dokum,dagilim,bosta:Object.entries(leftovers).map(([k,n])=>n>1?k+'×'+n:k),optimal:!capped&&!exhausted,uyari:capped||exhausted?'Hesap sınırına ulaşıldı; geçerli bir dağıtım gösteriliyor, en yüksek tutar garanti edilmez.':''};}
return {isBoschSoloHob,uniqueCampaigns,septemberPolicy,katNorm,kategoriOf,quantity,commission,money,businessDate,campaignActive,calcParts,applyPairs,calculateCampaigns};
});
