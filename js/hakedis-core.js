/* FiyatIQ — HAKEDİŞ MUTABAKATI hesap çekirdeği (Faz 1A). Ekran ve veritabanı erişimi YOK.
   Referans: Desktop\BSH HAKEDİŞ KONTROL\_sistem\hakedis_kontrol.py + itiraz_takip.py (Python, Eylül 2026'da doğrulandı).
   Kural: Python'la AYNI sonucu üretir (golden test). Bir davranışı değiştirmeden önce Python'daki karşılığına bak.
   Girdi hücreleri SheetJS'ten {header:1, raw:true, cellDates:false} ile okunur: tarihler Excel seri numarasıdır
   (saat dilimi kayması olmasın diye Date nesnesi kullanılmaz). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FiyatIQHakedis=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const KDV=1.20, TOL=1.00;
const AY_ADI={1:'OCAK',2:'ŞUBAT',3:'MART',4:'NİSAN',5:'MAYIS',6:'HAZİRAN',7:'TEMMUZ',8:'AĞUSTOS',9:'EYLÜL',10:'EKİM',11:'KASIM',12:'ARALIK'};
const TAKIP_EDILMEYEN=['DETERJAN','MASTERCHEF'];
const NA_DEGER=new Set(['','#N/A','#N/A N/A','#NA','-1.#IND','-1.#QNAN','-NaN','-nan','1.#IND','1.#QNAN','<NA>','N/A','NA','NULL','NaN','None','n/a','nan','null']);
const PAKET_KOL=['PAKET ADI','TÜR','ORAN SAYFASI','BUNDLE HAKEDİŞ (KDV DAHİL)','SET ÜRÜN SAYISI','KAMPANYA BAŞLANGIÇ','KAMPANYA BİTİŞ','HAKEDİŞ SON TARİHİ','KAYNAK / NOT','DURUM','FATURA+ÜRÜN BAŞINA ADET LİMİTİ'];

// ------------------------------------------------------------------ Python davranışı yardımcıları
const bos=v=>v===null||v===undefined||(typeof v==='number'&&Number.isNaN(v));
function pyStr(v){ if(bos(v))return 'nan'; if(typeof v==='boolean')return v?'True':'False'; return String(v); }
function trUpper(s){ return pyStr(s).replace(/i/g,'İ').replace(/ı/g,'I').toUpperCase(); }
const TRMAP={'Ç':'C','Ğ':'G','İ':'I','I':'I','Ö':'O','Ş':'S','Ü':'U','Â':'A','Î':'I','Û':'U'};
function norm(s){
  if(bos(s))return '';
  let x=trUpper(s).replace(/[ÇĞİIÖŞÜÂÎÛ]/g,c=>TRMAP[c]);
  x=x.normalize('NFKD').replace(/[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g,'');
  return x.replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function kod(s){ if(bos(s))return ''; return pyStr(s).replace(/\s+/g,'').toUpperCase(); }
function fno(s){ if(bos(s))return ''; let x=pyStr(s).trim(); if(x.endsWith('.0'))x=x.slice(0,-2); return x; }
function sayi(x){ if(x===null||x===undefined||x==='')return 0; const v=typeof x==='number'?x:Number(String(x).trim()); return Number.isFinite(v)?v:0; }
// Python round(x, n): doubleın TAM ondalık açılımı üzerinde, tam eşitlikte çifte yuvarlar (2.675 → 2.67)
function pyRound(x,n=2){
  if(bos(x)||!Number.isFinite(x))return x;
  const neg=x<0, s=Math.abs(x).toFixed(100), nokta=s.indexOf('.');
  const tam=s.slice(0,nokta), kesir=s.slice(nokta+1), tut=kesir.slice(0,n), kalan=kesir.slice(n);
  let yukari;
  if(kalan[0]>'5')yukari=true; else if(kalan[0]<'5')yukari=false;
  else yukari=/[1-9]/.test(kalan.slice(1))||(Number((tut||tam).slice(-1))%2===1);
  let rakam=BigInt(tam+tut)+(yukari?1n:0n), str=rakam.toString().padStart(n+1,'0');
  const sonuc=Number(n?str.slice(0,-n)+'.'+str.slice(-n):str);
  return neg?(sonuc===0?-0:-sonuc):sonuc;
}
// tarih: Excel seri no / 'GG.AA.YYYY' / 'YYYY-AA-GG' → 'YYYY-AA-GG' (string; karşılaştırma sözlük sırasıyla)
function seriTarih(n){ const ms=Date.UTC(1899,11,30)+Math.floor(n)*86400000; return new Date(ms).toISOString().slice(0,10); }
function tarih(x){
  if(bos(x)||x==='')return null;
  if(typeof x==='number'){ return x>20000&&x<90000?seriTarih(x):null; }
  if(x instanceof Date&&!Number.isNaN(x.getTime()))return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  const s=String(x).trim(); let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return gecerliTarih(+m[1],+m[2],+m[3]);
  if((m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)))return gecerliTarih(+m[3],+m[2],+m[1]);
  if(/^\d+(\.\d+)?$/.test(s)){ const n=Number(s); return n>20000&&n<90000?seriTarih(n):null; }
  return null;
}
function gecerliTarih(y,m,d){ const t=new Date(Date.UTC(y,m-1,d)); return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d?t.toISOString().slice(0,10):null; }
function excelTarih(v){ if(typeof v==='number'&&v>30000&&v<80000)return seriTarih(v); return (v==='-'||v==='..')?null:tarih(v); }
const tYil=t=>+t.slice(0,4), tAy=t=>+t.slice(5,7), tGun=t=>+t.slice(8,10);
const tAyNo=t=>t?tYil(t)*100+tAy(t):null;
function gunFark(a,b){ return Math.round((Date.parse(a)-Date.parse(b))/86400000); }
function gunEkle(t,n){ return new Date(Date.parse(t)+n*86400000).toISOString().slice(0,10); }
const tMetin=t=>t?`${t.slice(8,10)}.${t.slice(5,7)}.${t.slice(0,4)}`:'';
function kampanyaAyi(paket,ft){ const m=pyStr(paket).match(/(20\d{2})(0[1-9]|1[0-2])(?!\d)/); if(m)return (+m[1])*100+(+m[2]); return ft?tAyNo(ft):null; }
function aySonu(ay,ek=0){ let y=Math.floor(ay/100),m=ay%100+ek; y+=Math.floor((m-1)/12); m=((m-1)%12+12)%12+1; return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10); }
function ayMetni(ay){ return ay?`${AY_ADI[ay%100]} ${Math.floor(ay/100)}`:''; }
function virgul0(h){ return pyRound(h,0).toLocaleString('en-US',{maximumFractionDigits:0}); }
const cmp=(a,b)=>a<b?-1:a>b?1:0;
function siraliBenzersiz(arr){ return [...new Set(arr)].sort(cmp); }

// difflib.SequenceMatcher(None,a,b).ratio() — Python algoritmasının birebir kopyası
function oranBenzerlik(a,b){
  const la=a.length, lb=b.length; if(!la&&!lb)return 1;
  const b2j=new Map(); for(let j=0;j<lb;j++){const c=b[j]; if(!b2j.has(c))b2j.set(c,[]); b2j.get(c).push(j);}
  if(lb>=200){ const ntest=Math.floor(lb/100)+1; for(const [c,idx] of [...b2j]) if(idx.length>ntest) b2j.delete(c); }
  function enUzun(alo,ahi,blo,bhi){
    let bi=alo,bj=blo,bs=0,j2len=new Map();
    for(let i=alo;i<ahi;i++){ const yeni=new Map(); for(const j of (b2j.get(a[i])||[])){ if(j<blo)continue; if(j>=bhi)break; const k=(j2len.get(j-1)||0)+1; yeni.set(j,k); if(k>bs){bi=i-k+1;bj=j-k+1;bs=k;} } j2len=yeni; }
    while(bi>alo&&bj>blo&&a[bi-1]===b[bj-1]){bi--;bj--;bs++;}
    while(bi+bs<ahi&&bj+bs<bhi&&a[bi+bs]===b[bj+bs])bs++;
    return [bi,bj,bs];
  }
  const kuyruk=[[0,la,0,lb]]; let M=0;
  while(kuyruk.length){ const [alo,ahi,blo,bhi]=kuyruk.pop(); const [i,j,k]=enUzun(alo,ahi,blo,bhi);
    if(k){ M+=k; if(alo<i&&blo<j)kuyruk.push([alo,i,blo,j]); if(i+k<ahi&&j+k<bhi)kuyruk.push([i+k,ahi,j+k,bhi]); } }
  return 2*M/(la+lb);
}

// ------------------------------------------------------------------ tablo okuma (pandas.read_excel karşılığı)
// aoa: SheetJS satır dizisi. Başlık = ilk satır; tekrar eden başlık 'X.1', 'X.2'; '' ve NA yazıları → null.
function hucre(v){ if(v===undefined)return null; if(typeof v==='string'&&NA_DEGER.has(v))return null; return v; }
function tabloOku(aoa,temizle){
  if(!aoa||!aoa.length)return {kolonlar:[],satirlar:[]};
  const ham=(aoa[0]||[]).map((h,i)=>bos(h)||h===''?`Unnamed: ${i}`:pyStr(h));
  const say={}; const kol=ham.map(h=>{ if(say[h]===undefined){say[h]=0;return h;} say[h]++; let n=`${h}.${say[h]}`; while(ham.includes(n)){say[h]++;n=`${h}.${say[h]}`;} return n; });
  const kolonlar=temizle?kol.map(temizle):kol;
  let son=aoa.length-1; while(son>0&&(aoa[son]||[]).every(v=>hucre(v)===null))son--;
  const satirlar=[]; for(let r=1;r<=son;r++){ const row=aoa[r]||[]; const o={}; kolonlar.forEach((k,i)=>{o[k]=hucre(row[i]);}); o.__sira=r+1; satirlar.push(o); }
  return {kolonlar,satirlar};
}
const kolonTemizle=c=>String(c).replace(/(_x000D_|\r)/g,' ').replace(/\s+/g,' ').trim();

// ------------------------------------------------------------------ dosya türü (başlıklardan)
function dosyaTuru(sayfalar){
  const tum=sayfalar.map(s=>(s.aoa||[]).slice(0,6).flat().filter(c=>!bos(c)&&String(c).trim()).map(norm).join(' ')).join(' | ');
  if(tum.includes('PAKET ADI')&&tum.includes('KAMPANYA TIPI'))return 'DIVA_KAMPANYA';
  if(tum.includes('NIHAI KOD')||(tum.includes('KAMPANYA 1')&&tum.includes('HAK EDIS')))return 'BSH_DETAY';
  if(tum.includes('MATBU FATURA NO'))return 'DIVA_FATURA';
  if(tum.includes('BIRIM FIYAT FARKI'))return 'FIYAT_FARK';
  return 'TANINMADI';
}

// ------------------------------------------------------------------ fiyat fark dosyaları
function sayfaTipi(ad){ const a=norm(ad); if(a.includes('FIRSAT'))return 'FIRSAT'; if(a.includes('AILE'))return 'AİLE'; return 'ANA'; }
const AY_NORM=Object.entries(AY_ADI).map(([k,v])=>[+k,norm(v)]);
const AY_RE=new RegExp('('+AY_NORM.map(x=>x[1]).join('|')+') (20\\d{2})');
function ayBul(metin){ const m=metin.match(AY_RE); if(!m)return null; return (+m[2])*100+AY_NORM.find(x=>x[1]===m[1])[0]; }
function dosyaBaslangic(dosyaAdi,ay){
  const ad=norm(String(dosyaAdi).replace(/\.[^.]+$/,'')), ayAd=norm(AY_ADI[ay%100]);
  const m=ad.match(new RegExp('\\b(\\d{1,2})(?: \\d{1,2})? '+ayAd+'\\b')); const y=Math.floor(ay/100);
  if(m&&+m[1]>=1&&+m[1]<=31){ const t=gecerliTarih(y,ay%100,+m[1]); if(t)return t; }
  return gecerliTarih(y,ay%100,1);
}
// dosya: {dosyaAdi, sayfalar:[{ad, aoa}]} → [{AY,TİP,KOD,ORAN,BAŞLANGIÇ,KAYNAK}]
function fiyatFarkOku(dosya){
  const out=[];
  for(const ws of dosya.sayfalar){
    const rows=ws.aoa||[]; let kodC=null,degC=null,basR=null,ay=null;
    for(let i=0;i<Math.min(15,rows.length);i++){ const n=(rows[i]||[]).map(norm);
      if(n.includes('URUN KODU')){ for(let j=0;j<n.length;j++){ const c=n[j]; if(c.includes('FIYAT FARKI')&&c.includes('HARIC')){ kodC=n.indexOf('URUN KODU');degC=j;basR=i;ay=ayBul(c);break; } } }
      if(kodC!==null)break; }
    if(kodC===null||['TUMU','TUM','HEPSI'].includes(norm(ws.ad)))continue;
    if(ay===null){ ay=ayBul(norm(dosya.dosyaAdi)); if(ay===null)continue; }
    const bas=dosyaBaslangic(dosya.dosyaAdi,ay);
    const ust=rows.slice(0,Math.max(basR,1)).flat().filter(c=>!bos(c)).map(pyStr).join(' ');
    const tip=sayfaTipi(ws.ad+' '+ust);
    for(const r of rows.slice(basR+1)){ if(!r||r.length<=Math.max(kodC,degC))continue; const k=kod(r[kodC]),v=r[degC];
      if(!k||typeof v!=='number'||!/\d/.test(k))continue;
      out.push({AY:ay,'TİP':tip,KOD:k,ORAN:v,'BAŞLANGIÇ':bas,KAYNAK:`${dosya.dosyaAdi} › ${ws.ad}`}); }
  }
  return out;
}
function ekOranlar(ek){ // [{ÜRÜN KODU, ORAN SAYFASI, BİRİM FİYAT FARKI (KDV HARİÇ), GEÇERLİLİK BAŞLANGIÇ, KAYNAK}]
  const out=[];
  for(const r of ek||[]){ const k=kod(r['ÜRÜN KODU']),b=tarih(r['GEÇERLİLİK BAŞLANGIÇ']),o=r['BİRİM FİYAT FARKI (KDV HARİÇ)'];
    if(!k||!b||bos(o))continue;
    out.push({AY:tAyNo(b),'TİP':pyStr(r['ORAN SAYFASI']||'ANA').trim().toUpperCase().replace('AILE','AİLE'),KOD:k,ORAN:+o,'BAŞLANGIÇ':b,KAYNAK:`KAMPANYA_TANIMLARI › EK_ORANLAR (${r.KAYNAK||''})`}); }
  return out;
}
function oranBul(oranlar,k,tip,ay,ft){
  let c=oranlar.filter(o=>o.KOD===k&&o.AY===ay&&o['TİP']===tip);
  if(!c.length&&tip==='FIRSAT')c=oranlar.filter(o=>o.KOD===k&&o.AY===ay&&o['TİP']==='ANA');
  if(!c.length)return [null,'','ORAN YOK — bu ürün o ayın fiyat fark listelerinde bulunamadı'];
  const sirala=x=>x.map((o,i)=>[o,i]).sort((p,q)=>cmp(p[0]['BAŞLANGIÇ'],q[0]['BAŞLANGIÇ'])||p[1]-q[1]).map(p=>p[0]);
  const gecerli=ft?c.filter(o=>o['BAŞLANGIÇ']<=ft):c;
  if(!gecerli.length){ const r=sirala(c)[0]; return [r.ORAN,r.KAYNAK,`Fatura tarihi oranın geçerlilik başlangıcından (${tMetin(r['BAŞLANGIÇ'])}) önce`]; }
  const s=sirala(gecerli), r=s[s.length-1];
  const farkli=new Set(c.map(o=>pyRound(o.ORAN,2))).size>1;
  return [r.ORAN,r.KAYNAK,farkli?'Ay içinde oran değişmiş — fatura tarihine göre seçildi':''];
}

// ------------------------------------------------------------------ paket tanımları
function paketTahmin(p){
  const P=norm(p); const s=[p,'BİLİNMİYOR',null,null,null,null,null,null,'Otomatik eklendi — türünü ve tutarını kontrol et','KONTROL ET',null];
  if(P.includes('DETERJAN'))s[1]='HARİÇ';
  else if(P.includes('SEHRE DONUS')){s[1]='KEA';s[2]='ANA';}
  else if(P.includes('FIRSAT URUN')){s[1]='FIRSAT';s[2]='FIRSAT';}
  else if(P.includes('AILE')){s[1]='AİLE';s[2]='AİLE';}
  else if(P.includes('TEKIL')){s[1]='TEKİL';s[2]='ANA';}
  else if(P.includes('INDIRIM')&&(P.includes('ALIM')||P.includes('ALANA')||P.includes('SET'))){s[1]='BUNDLE';s[8]='Otomatik eklendi — BUNDLE HAKEDİŞ (KDV DAHİL) tutarını uygulama yazısından gir';}
  return s;
}
const satirdanPaket=s=>Object.fromEntries(PAKET_KOL.map((k,i)=>[k,s[i]===undefined?null:s[i]]));
// paketler: [{PAKET ADI, TÜR, ...}] (KAMPANYA_TANIMLARI › PAKETLER sütun adlarıyla)
function paketleriHazirla(paketler,divaPaketler,milat){
  const tanim=new Map();
  for(const r of paketler||[]){ if(bos(r['PAKET ADI']))continue; tanim.set(norm(r['PAKET ADI']),r); }
  const yeniler=[];
  for(const p of siraliBenzersiz(divaPaketler)){
    if(tanim.has(norm(p)))continue;
    const ay=kampanyaAyi(p,null); if(milat&&ay&&ay<milat)continue;
    if(TAKIP_EDILMEYEN.some(k=>norm(p).includes(k))){ tanim.set(norm(p),satirdanPaket([p,'HARİÇ',null,null,null,null,null,null,'burak: takip edilmiyor (sistem içi kural)','ONAYLI',null])); continue; }
    const s=paketTahmin(p); yeniler.push(s); tanim.set(norm(p),satirdanPaket(s));
  }
  return {tanim,yeniler:yeniler.map(satirdanPaket)};
}
const tDeger=(t,k)=>t?(t[k]===undefined?null:t[k]):null;

// ------------------------------------------------------------------ Diva kampanya raporu
// dosyalar: [{dosyaAdi, satirlar:[{başlık:değer}]}] — her dosyanın İLK sayfası (pandas.read_excel varsayılanı)
function divaKampanyaOku(dosyalar,marka){
  const tum=[]; const kolSet=[];
  for(const f of dosyalar){ for(const r of f.satirlar){ for(const k of Object.keys(r)) if(k!=='__sira'&&!kolSet.includes(k))kolSet.push(k); tum.push({...r,_KAYNAK:f.dosyaAdi}); } }
  const goruldu=new Set(), d=[];
  for(const r of tum){ const anahtar=JSON.stringify(kolSet.map(k=>r[k]===undefined?null:r[k])); if(goruldu.has(anahtar))continue; goruldu.add(anahtar); d.push(r); }
  const filtreli=(kolSet.includes('Aile')&&marka)?d.filter(r=>norm(pyStr(r.Aile)).startsWith(norm(marka))):d;
  return filtreli.map(r=>{ const ft=tarih(r['Fatura Tarihi']); const paket=pyStr(r['Paket Adı']).trim();
    return {...r,'FATURA NO':fno(r['Fatura No']),'ÜRÜN':kod(r['Ürün Kodu']),PAKET:paket,'FTARİH':ft,
      'MİKTAR':sayi(r.Miktar)||1,'KAMP AY':kampanyaAyi(paket,ft),
      'HESAP KODU':kolSet.includes('Hesap Kodu')?pyStr(r['Hesap Kodu']).trim():'',
      'İLERİ TESLİM':kolSet.includes('Sipariş No')?!!fno(r['Sipariş No']):false}; });
}
function beklenenHesapla(d,tanim,oranlar,milat){
  const setSay=new Map(); for(const r of d){ const k=r['FATURA NO']+'\u0000'+r.PAKET; setSay.set(k,(setSay.get(k)||0)+r['MİKTAR']); }
  const kullanilan=new Map();
  for(const r of d){
    const t=tanim.get(norm(r.PAKET))||null;
    let tur=t&&!bos(t['TÜR'])?pyStr(t['TÜR']).trim().toUpperCase():'BİLİNMİYOR';
    tur=tur.replace('TEKIL','TEKİL').replace('HARIC','HARİÇ').replace('AILE','AİLE');
    const ay=r['KAMP AY']; let bek=null,birim=null,kaynak='',durum='HESAPLANDI'; const uyari=[];
    let son=t?tarih(tDeger(t,'HAKEDİŞ SON TARİHİ')):null; if(son===null&&ay)son=aySonu(ay,2);
    const kBas=t?tarih(tDeger(t,'KAMPANYA BAŞLANGIÇ')):null, kBit=t?tarih(tDeger(t,'KAMPANYA BİTİŞ')):null;
    if(ay&&ay<milat){ durum='MİLAT ÖNCESİ'; uyari.push(`${ayMetni(ay)} kampanyası — milat ${ayMetni(milat)}, kontrol dışı`); }
    else if(tur==='HARİÇ'){ durum='KAPSAM DIŞI'; uyari.push("KAMPANYA_TANIMLARI'nda HARİÇ işaretli"); }
    else if(['TEKİL','FIRSAT','AİLE','KEA'].includes(tur)){
      let tip=!bos(tDeger(t,'ORAN SAYFASI'))?pyStr(t['ORAN SAYFASI']).trim().toUpperCase():(tur==='FIRSAT'?'FIRSAT':tur==='AİLE'?'AİLE':'ANA');
      tip=tip.replace('AILE','AİLE');
      const [o,kay,u]=oranBul(oranlar,r['ÜRÜN'],tip,ay,r['FTARİH']); kaynak=kay; if(u)uyari.push(u);
      if(o===null)durum='ORAN YOK';
      else{ birim=o; let adet=r['MİKTAR']; let lim=tDeger(t,'FATURA+ÜRÜN BAŞINA ADET LİMİTİ');
        if(!bos(lim)&&String(lim).trim()!==''){ lim=+lim; const an=r['FATURA NO']+'\u0000'+r['ÜRÜN']+'\u0000'+norm(r.PAKET);
          const kalan=Math.max(0,lim-(kullanilan.get(an)||0)); adet=Math.min(adet,kalan); kullanilan.set(an,(kullanilan.get(an)||0)+adet);
          if(adet<r['MİKTAR'])uyari.push(`KAMPANYA KURALI ('her tüketici 1 kez'): BSH aynı faturadaki aynı üründen ${Math.trunc(lim)} adet öder — ${Math.trunc(r['MİKTAR'])} adetten ${Math.trunc(adet)} adet sayıldı`); }
        bek=pyRound(o*adet,2); }
    } else if(tur==='BUNDLE'){
      let h=tDeger(t,'BUNDLE HAKEDİŞ (KDV DAHİL)');
      if(bos(h)||h===''){ durum='ORAN YOK'; uyari.push("Bundle hakediş tutarı KAMPANYA_TANIMLARI'nda girilmemiş"); }
      else{ h=+h; let n=tDeger(t,'SET ÜRÜN SAYISI'); const toplam=setSay.get(r['FATURA NO']+'\u0000'+r.PAKET);
        if(bos(n)||!+n)n=toplam; n=+n;
        if(toplam%n)uyari.push(`EKSİK SET: faturada bu pakette ${Math.trunc(toplam)} ürün var, set ${Math.trunc(n)} ürünlük`);
        birim=pyRound(h/KDV/n,2); bek=pyRound(birim*r['MİKTAR'],2);
        kaynak=`KAMPANYA_TANIMLARI › PAKETLER (${virgul0(h)} TL KDV dahil / 1,20 / ${Math.trunc(n)} ürün)`; }
    } else { durum='TANIMSIZ PAKET'; uyari.push("Paket türü bilinmiyor — KAMPANYA_TANIMLARI'nda tanımla"); }
    if((durum==='HESAPLANDI'||durum==='ORAN YOK')&&r['FTARİH']){
      if(kBas&&r['FTARİH']<kBas)uyari.push(`Fatura tarihi kampanya başlangıcından (${tMetin(kBas)}) önce`);
      if(kBit&&r['FTARİH']>kBit)uyari.push(`Fatura tarihi kampanya bitişinden (${tMetin(kBit)}) sonra`); }
    Object.assign(r,{'TÜR':tur,'BİRİM HAKEDİŞ':birim,'BEKLENEN (KDV HARİÇ)':bek,'ORAN KAYNAĞI':kaynak,'HESAP DURUMU':durum,UYARI:uyari.join(' | '),'HAKEDİŞ SON TARİHİ':son});
  }
  return d;
}

// ------------------------------------------------------------------ Diva fatura raporu (şube şube)
// dosyalar: [{dosyaAdi, satirlar}] → iade kümesi, (hesap,ürün)→satış faturaları, şube kapsamı (en son tarih), satır listesi
function divaFaturaOku(dosyalar){
  const iade=new Set(), satis=new Map(), kapsam=new Map(), satirlar=[];
  for(const f of dosyalar){
    const ornek=f.satirlar[0]||{}; const tipKol=Object.keys(ornek).filter(c=>c.startsWith('Fatura Tipi'));
    for(const r of f.satirlar){
      const m=norm(tipKol.map(c=>pyStr(r[c])).join(' '));
      const anah=pyStr(r['Müşteri Hesap Kodu']===undefined?'':r['Müşteri Hesap Kodu']).trim()+'\u0000'+kod(r['Ürün Kodu']);
      if(m.includes('IADE'))iade.add(anah);
      else{ if(!satis.has(anah))satis.set(anah,new Map()); const ft=tarih(r['Fatura Tarihi']),fn=fno(r['Fatura No']); satis.get(anah).set(ft+'|'+fn,[ft,fn]);
        satirlar.push({'ŞUBE KODU':pyStr(r['Şube Kodu']===undefined?'':r['Şube Kodu']).trim(),'ÜRÜN':kod(r['Ürün Kodu']),TARİH:ft,'FATURA NO':fn,MASKE:trUpper(r['Müşterinin Adı Soyadı']===undefined?'':r['Müşterinin Adı Soyadı'])}); }
    }
    if(Object.prototype.hasOwnProperty.call(ornek,'Şube Kodu'))
      for(const r of f.satirlar){ const sk=pyStr(r['Şube Kodu']).trim(), t=tarih(r['Fatura Tarihi']); if(t&&(!kapsam.has(sk)||t>kapsam.get(sk)))kapsam.set(sk,t); }
  }
  const satisS=new Map(); for(const [k,v] of satis) satisS.set(k,[...v.values()].sort((a,b)=>cmp(a[0]||'0000-00-00',b[0]||'0000-00-00')||cmp(a[1],b[1])));
  return {iade,satis:satisS,kapsam,satirlar};
}
function gercekFaturaBul(d,satis,kapsam){
  for(const r of d){ let n=null,t=null;
    if(r['İLERİ TESLİM']) for(const [ft,fn] of (satis.get(r['HESAP KODU']+'\u0000'+r['ÜRÜN'])||[])){ if(fn!==r['FATURA NO']&&ft&&r['FTARİH']&&ft>=r['FTARİH']){n=fn;t=ft;break;} }
    const sk=Object.prototype.hasOwnProperty.call(r,'Şube Kodu')?pyStr(r['Şube Kodu']).trim():'';
    Object.assign(r,{'GERÇEK FATURA NO':n,'GERÇEK FATURA TARİHİ':t,'FATURA RAPORU SON TARİH':kapsam.has(sk)?kapsam.get(sk):null}); }
  return d;
}
function iadeIsaretle(d,iade){
  if(!iade.size)return d;
  for(const r of d){ const h=Object.prototype.hasOwnProperty.call(r,'Hesap Kodu')?pyStr(r['Hesap Kodu']).trim():'';
    if(iade.has(h+'\u0000'+r['ÜRÜN'])) r.UYARI=(r.UYARI+' | Diva fatura raporunda bu müşteri+ürün için İADE var').replace(/^[ |]+|[ |]+$/g,''); }
  return d;
}

// ------------------------------------------------------------------ BSH hakediş detayı
// dosyalar: [{dosyaAdi, sayfalar:[{ad, satirlar(kolonları temizlenmiş)}]}]
function bshDetayOku(dosyalar){
  const parca=[];
  for(const f of dosyalar) for(const s of f.sayfalar){
    const rows=s.satirlar; if(!rows.length)continue; const kols=Object.keys(rows[0]).filter(k=>k!=='__sira');
    if(!kols.includes('Fatura No')||!kols.includes('Ürün Kodu'))continue;
    const kol=new Map();
    for(const c of kols){ let m=c.match(/^Kampanya (\d+) (Adı|Tür|Yöntem|Hak Ediş|Hak Ediş Dönemi|Fiyat Farkı)$/);
      if(m){ if(!kol.has(+m[1]))kol.set(+m[1],{}); kol.get(+m[1])[m[2]]=c; continue; }
      m=c.match(/^(Kampanya Adı|Kampanya Türü|Yöntem|Toplam Tutar H|Toplam Tutar|Hak Ediş Dönemi) (\d+)$/);
      if(m){ const ad={'Kampanya Adı':'Adı','Kampanya Türü':'Tür','Yöntem':'Yöntem','Toplam Tutar H':'Hak Ediş','Toplam Tutar':'_TT','Hak Ediş Dönemi':'Hak Ediş Dönemi'}[m[1]]; if(!kol.has(+m[2]))kol.set(+m[2],{}); kol.get(+m[2])[ad]=c; } }
    for(const n of [...kol.keys()].sort((a,b)=>a-b)){ const k=kol.get(n); if(!k['Adı'])continue; if(!k['Hak Ediş']&&k._TT)k['Hak Ediş']=k._TT;
      const g=(r,ad)=>k[ad]?r[k[ad]]:null;
      for(const r of rows){ const adi=g(r,'Adı'); if(bos(adi)||pyStr(adi).trim()==='')continue;
        const dn=kols.includes('Değişen Fatura No')?fno(r['Değişen Fatura No']):'';
        parca.push({'FATURA NO':fno(r['Fatura No']),'ÜRÜN':kod(r['Ürün Kodu']),'BSH DEĞİŞEN FATURA NO':(dn==='-'||dn==='')?'':dn,
          'BSH KAMPANYA':adi,'BSH TÜR':g(r,'Tür'),'BSH YÖNTEM':g(r,'Yöntem'),'BSH HAKEDİŞ':sayi(g(r,'Hak Ediş')),'BSH DÖNEM':g(r,'Hak Ediş Dönemi'),
          'BSH FATURA TARİHİ':kols.includes('Fatura Tarihi')?excelTarih(r['Fatura Tarihi']):null,'FATURA TİPİ':r['Fatura Tipi']??null,'SATIŞ TİPİ':r['Satış Tipi']??null,
          'İADE DURUMU':r['İade Durumu']??null,'BSH BAYİ KODU':r['Bayi Kodu']??null,'BSH DOSYASI':`${f.dosyaAdi} › ${s.ad}`}); } }
  }
  for(const b of parca){ const v=b['BSH DÖNEM']; b['BSH DÖNEM']=(v!==null&&v!==''&&v!=='-'&&!bos(v)&&Number.isFinite(+v))?Math.trunc(+v):null; b['KAMP NORM']=norm(b['BSH KAMPANYA']); b['BSH KAMP AYI']=kampanyaAyi(b['BSH KAMPANYA'],null); }
  const g=new Set(), out=[];
  for(const b of parca){ const k=JSON.stringify([b['FATURA NO'],b['ÜRÜN'],b['KAMP NORM'],b['BSH HAKEDİŞ'],b['BSH DÖNEM']]); if(g.has(k))continue; g.add(k); out.push(b); }
  return out;
}

// ------------------------------------------------------------------ BSH eşleştirme (hakedis_kontrol.bsh_eslestir)
function bshEslestir(d,bsh){
  const sep='\u0000', anah=r=>r['FATURA NO']+sep+r['ÜRÜN']+sep+r['KAMP NORM'];
  for(const r of d) r['KAMP NORM']=norm(r.PAKET);
  // groupby(sort=False) → ilk görülme sırası
  const gruplar=new Map();
  for(const r of d){ const k=anah(r); if(!gruplar.has(k))gruplar.set(k,[]); gruplar.get(k).push(r); }
  const top1=xs=>{ const v=xs.filter(x=>!bos(x)); return v.length?v.reduce((a,b)=>a+b,0):null; };
  const g=[...gruplar.values()].map(rs=>{ const r=rs[0];
    return {'FATURA NO':r['FATURA NO'],'ÜRÜN':r['ÜRÜN'],'KAMP NORM':r['KAMP NORM'],'ŞUBE':r['Şube Adı']??null,'FATURA TARİHİ':r['FTARİH'],'MÜŞTERİ':r['Ad Soyad']??null,
      PAKET:r.PAKET,'KAMPANYA AYI':r['KAMP AY'],'TÜR':r['TÜR'],ADET:rs.reduce((a,x)=>a+x['MİKTAR'],0),'BİRİM HAKEDİŞ':r['BİRİM HAKEDİŞ'],
      'BEKLENEN (KDV HARİÇ)':top1(rs.map(x=>x['BEKLENEN (KDV HARİÇ)'])),'ORAN KAYNAĞI':r['ORAN KAYNAĞI'],'HESAP DURUMU':r['HESAP DURUMU'],
      UYARI:siraliBenzersiz(rs.map(x=>x.UYARI).filter(x=>x)).join(' | '),'HAKEDİŞ SON TARİHİ':r['HAKEDİŞ SON TARİHİ'],'DİVA DOSYASI':r._KAYNAK,
      'İLERİ TESLİM':r['İLERİ TESLİM'],'GERÇEK FATURA NO':r['GERÇEK FATURA NO'],'GERÇEK FATURA TARİHİ':r['GERÇEK FATURA TARİHİ'],
      'FATURA RAPORU SON TARİH':r['FATURA RAPORU SON TARİH'],'ŞUBE KODU':r['Şube Kodu']??null,'BAYİ KODU':r['Bayi Kodu']??null,'HESAP KODU':r['HESAP KODU'],
      'BSH ÖDENEN':null,'BSH DÖNEM':'','BSH KAMPANYA ADI':'','BSH TÜR':'','FARK (ÖDENEN − BEKLENEN)':null}; });
  const bshVar=!!(bsh&&bsh.length), eslesen=new Set();
  if(bshVar){
    const sozluk=new Map(); // sıralı anahtar (pandas groupby sort=True)
    const bg=new Map(); for(const b of bsh){ const k=anah(b); if(!bg.has(k))bg.set(k,[]); bg.get(k).push(b); }
    const anahSirali=[...bg.keys()].sort((a,b)=>{ const x=a.split(sep),y=b.split(sep); return cmp(x[0],y[0])||cmp(x[1],y[1])||cmp(x[2],y[2]); });
    for(const k of anahSirali){ const bs=bg.get(k);
      sozluk.set(k,{ODENEN:bs.reduce((a,b)=>a+b['BSH HAKEDİŞ'],0),DONEM:[...new Set(bs.map(b=>b['BSH DÖNEM']).filter(v=>v))].sort((a,b)=>a-b).map(String).join(', '),
        AD:bs[0]['BSH KAMPANYA'],TUR:(bs.find(b=>!bos(b['BSH TÜR']))||{})['BSH TÜR']??null}); }
    const alt=new Map();
    for(const b of bsh){ const dn=b['BSH DEĞİŞEN FATURA NO']; if(dn) alt.set(dn+sep+b['ÜRÜN']+sep+b['KAMP NORM'],anah(b)); }
    const fu=new Map();
    for(const k of [...sozluk.keys(),...alt.keys()]){ const [f,u]=k.split(sep); const fk=f+sep+u; if(!fu.has(fk))fu.set(fk,[]); fu.get(fk).push(alt.has(k)?alt.get(k):k); }
    for(const r of g){
      const fat=[r['FATURA NO']].concat(r['GERÇEK FATURA NO']?[r['GERÇEK FATURA NO']]:[]); let bul=null;
      for(const f of fat){ let k=f+sep+r['ÜRÜN']+sep+r['KAMP NORM']; k=sozluk.has(k)?k:(alt.get(k)||null); if(k&&!eslesen.has(k)){bul=k;break;} }
      if(bul===null){ const aday=fat.flatMap(f=>fu.get(f+sep+r['ÜRÜN'])||[]).filter(x=>!eslesen.has(x));
        if(aday.length){ let en=aday[0],eb=-1; for(const x of aday){ const o=oranBenzerlik(x.split(sep)[2],r['KAMP NORM']); if(o>eb){eb=o;en=x;} }
          if(oranBenzerlik(en.split(sep)[2],r['KAMP NORM'])>=0.80)bul=en; } }
      if(bul!==null){ eslesen.add(bul); const v=sozluk.get(bul); r['BSH ÖDENEN']=pyRound(v.ODENEN,2); r['BSH DÖNEM']=v.DONEM; r['BSH KAMPANYA ADI']=v.AD; r['BSH TÜR']=v.TUR; }
    }
  }
  for(const r of g){ r['SET BEKLENEN']=null; r['SET ÖDENEN']=null; }
  const setG=new Map(); for(const r of g){ if(r['TÜR']!=='BUNDLE')continue; const k=r['FATURA NO']+sep+r['KAMP NORM']; if(!setG.has(k))setG.set(k,[]); setG.get(k).push(r); }
  for(const rs of setG.values()){ const sb=top1(rs.map(x=>x['BEKLENEN (KDV HARİÇ)'])), so=top1(rs.map(x=>x['BSH ÖDENEN'])); for(const r of rs){r['SET BEKLENEN']=sb;r['SET ÖDENEN']=so;} }
  const donemler=new Set(bshVar?bsh.map(b=>b['BSH DÖNEM']).filter(v=>v!==null):[]);
  const ilkSet=new Set();
  for(const r of g){
    const hd=r['HESAP DURUMU'], bundle=r['TÜR']==='BUNDLE';
    const bek=bundle?r['SET BEKLENEN']:r['BEKLENEN (KDV HARİÇ)'], od=bundle?r['SET ÖDENEN']:r['BSH ÖDENEN'];
    let ilk=true; if(bundle){ const k=r['FATURA NO']+sep+r['KAMP NORM']; ilk=!ilkSet.has(k); ilkSet.add(k); }
    let fark=null, sonuc; const ft=r['FATURA TARİHİ']; let hakDonem=ft?tAyNo(ft):null; const odendi=!bos(od);
    if(hd==='MİLAT ÖNCESİ'||hd==='KAPSAM DIŞI') sonuc=hd+(odendi?' — BSH ÖDEDİ':'');
    else if(odendi){ if(bos(bek))sonuc='ÖDENDİ — BEKLENEN HESAPLANAMADI'; else{ const f=pyRound(od-bek,2); fark=ilk?f:0; sonuc=Math.abs(f)<=TOL?'TAM':(f<0?'EKSİK ÖDENDİ':'FAZLA ÖDENDİ'); } }
    else if(!bshVar) sonuc='BSH DETAYI BEKLENİYOR';
    else if(!bos(bek)&&bek===0) sonuc='HAKEDİŞ YOK (KURAL GEREĞİ 0)';
    else{ let gt=null; if(r['İLERİ TESLİM']){ gt=r['GERÇEK FATURA TARİHİ']; hakDonem=gt?tAyNo(gt):null; }
      const eksik=!bos(bek)?(ilk?-bek:0):null;
      if(r['İLERİ TESLİM']&&hakDonem===null){ const s=r['FATURA RAPORU SON TARİH'];
        sonuc=!bos(s)?`SARKAN — İLERİ TESLİM, FATURA RAPORUNDA ${tMetin(s)} TARİHİNE KADAR FATURASI YOK (TESLİM BEKLİYOR OLABİLİR)`:'SARKAN — İLERİ TESLİM, BU ŞUBENİN DİVA FATURA RAPORU YOK'; }
      else if(donemler.has(hakDonem)){ fark=eksik; sonuc=`ÖDENMEDİ — ${ayMetni(hakDonem)} HAKEDİŞİNDE YOK`; }
      else if(r['İLERİ TESLİM']) sonuc=`SARKAN — İLERİ TESLİM, ${tMetin(gt)} FATURALANDI → ${ayMetni(hakDonem)} HAKEDİŞİNDE BEKLENİR`;
      else sonuc=`SARKAN — ${ayMetni(hakDonem)} HAKEDİŞİ HENÜZ GELMEDİ`; }
    r['SONUÇ']=sonuc; r['FARK (ÖDENEN − BEKLENEN)']=fark;
  }
  const goruldu=new Set();
  for(const r of g){
    if(/^(MİLAT|KAPSAM)/.test(r['SONUÇ'])){ r['AÇIK (BEKLENEN − ÖDENEN)']=null; continue; }
    let b_,o_; if(r['TÜR']==='BUNDLE'){ const k=r['FATURA NO']+sep+r['KAMP NORM']; if(goruldu.has(k)){r['AÇIK (BEKLENEN − ÖDENEN)']=0;continue;} goruldu.add(k); b_=r['SET BEKLENEN'];o_=r['SET ÖDENEN']; }
    else{ b_=r['BEKLENEN (KDV HARİÇ)'];o_=r['BSH ÖDENEN']; }
    r['AÇIK (BEKLENEN − ÖDENEN)']=pyRound((bos(b_)?0:+b_)-(bos(o_)?0:+o_),2);
  }
  const fazla=bshVar?bsh.filter(b=>!eslesen.has(anah(b))):[];
  return {kontrol:g,bshFazla:fazla};
}
function bundleSetleri(d){
  const b=d.filter(r=>r['TÜR']==='BUNDLE'); if(!b.length)return [];
  const m=new Map(); for(const r of b){ const k=r['FATURA NO']+'\u0000'+r.PAKET; if(!m.has(k))m.set(k,[]); m.get(k).push(r); }
  return [...m.keys()].sort((x,y)=>{const a=x.split('\u0000'),c=y.split('\u0000');return cmp(a[0],c[0])||cmp(a[1],c[1]);}).map(k=>{ const rs=m.get(k),r=rs[0]; const v=rs.map(x=>x['BEKLENEN (KDV HARİÇ)']).filter(x=>!bos(x));
    return {'FATURA NO':r['FATURA NO'],PAKET:r.PAKET,'ŞUBE':r['Şube Adı']??null,'FATURA TARİHİ':r['FTARİH'],'MÜŞTERİ':r['Ad Soyad']??null,'ÜRÜNLER':rs.map(x=>x['ÜRÜN']).join(' + '),
      'ÜRÜN SAYISI':rs.reduce((a,x)=>a+x['MİKTAR'],0),'BEKLENEN SET HAKEDİŞİ (KDV HARİÇ)':v.length?v.reduce((a,c)=>a+c,0):null,UYARI:siraliBenzersiz(rs.map(x=>x.UYARI).filter(x=>x)).join(' | ')}; });
}

// ------------------------------------------------------------------ itiraz ve ileri teslim (itiraz_takip.py)
// subeler: [{anahtar, magaza, bayi_kodu, oncelik}] (Python'daki MAGAZA_ANAHTAR karşılığı, öncelik sırasıyla)
function magazaBul(subeler,s){ const n=norm(s); for(const x of [...(subeler||[])].sort((a,b)=>(a.oncelik??100)-(b.oncelik??100))) if(n.includes(norm(x.anahtar)))return x.magaza; return n.trim()||'?'; }
function kisaBayi(v){ const s=pyStr(v===null||v===undefined?'':v).trim().replace(/\.0$/,''); if(s==='nan')return 'nan'; return s.startsWith('7000')&&/^\d+$/.test(s.slice(4))?parseInt(s.slice(4),10):(/^\d+$/.test(s)?parseInt(s,10):s); }
function bayiKodlari(d,subeler){
  const m=new Map(); const kod_=r=>pyStr(Object.prototype.hasOwnProperty.call(r,'Şube Kodu')?r['Şube Kodu']:r['Şube Adı']), ad=r=>pyStr(r['Şube Adı']);
  const gr=new Map(); for(const r of d){ const k=kod_(r)+'\u0000'+ad(r); if(!gr.has(k))gr.set(k,r); }
  for(const k of [...gr.keys()].sort((a,b)=>{const x=a.split('\u0000'),y=b.split('\u0000');return cmp(x[0],y[0])||cmp(x[1],y[1]);})){
    const r=gr.get(k), [sk,sa]=k.split('\u0000'), mg=magazaBul(subeler,sk+' '+sa); if(!m.has(mg))m.set(mg,kisaBayi(r['Bayi Kodu'])); }
  return m;
}
function bshOdediMi(bsh,fatura,urun,kampanya){ if(!bsh||!bsh.length)return null; const kn=kampanya?norm(kampanya):null;
  const x=bsh.filter(b=>(b['FATURA NO']===fatura||b['BSH DEĞİŞEN FATURA NO']===fatura)&&b['ÜRÜN']===urun&&(kn===null||b['KAMP NORM']===kn)); return x.length?x:null; }
function ayAcikMi(tanim,kampAy,bugun){ const bit=[...tanim.values()].filter(t=>kampanyaAyi(t['PAKET ADI'],null)===kampAy).map(t=>tarih(tDeger(t,'KAMPANYA BİTİŞ'))).filter(x=>x);
  const son=bit.length?bit.sort(cmp)[bit.length-1]:aySonu(kampAy); return [bugun<=son,son]; }
// eski: gönderilmiş itirazlar [{FATURA NO, ÜRÜN, KAMPANYA}]
function kayiplariTopla(ctx){
  const {kontrol,bsh,tanim,subeler,bayi,eski,bugun}=ctx; const kalem=[];
  for(const r of kontrol){ if(!String(r['SONUÇ']).startsWith('ÖDENMEDİ'))continue;
    const ileri=r['İLERİ TESLİM']===true, gf=r['GERÇEK FATURA NO'], mg=magazaBul(subeler,r['ŞUBE']);
    const tutar=r['TÜR']==='BUNDLE'?r['AÇIK (BEKLENEN − ÖDENEN)']:r['BEKLENEN (KDV HARİÇ)'];
    kalem.push({KAYNAK:"Diva'da kampanya var, BSH ödememiş",'MAĞAZA':mg,'BAYİ':bayi.has(mg)?bayi.get(mg):'','MÜŞTERİ':r['MÜŞTERİ'],'FATURA NO':r['FATURA NO'],
      'DEĞİŞEN FATURA NO':ileri&&gf?gf:'','FATURA TARİHİ':ileri&&r['GERÇEK FATURA TARİHİ']?r['GERÇEK FATURA TARİHİ']:r['FATURA TARİHİ'],'DİVA TARİHİ':r['FATURA TARİHİ'],
      'ÜRÜN':r['ÜRÜN'],KAMPANYA:r.PAKET,'TÜR':r['TÜR'],'SATIŞ TİPİ':ileri?'':'Hemen Teslim','TUTAR (KDV HARİÇ)':bos(tutar)?null:pyRound(+tutar,2),
      'TUTAR KAYNAĞI':r['ORAN KAYNAĞI']||'',KANIT:'HAKEDİŞ KONTROL sayfası'}); }
  const donem=new Set((bsh||[]).map(b=>b['BSH DÖNEM']).filter(v=>v!==null));
  const eskiK=new Set((eski||[]).map(e=>e['FATURA NO']+'\u0000'+e['ÜRÜN']+'\u0000'+norm(e.KAMPANYA))), eskiF=new Set((eski||[]).map(e=>e['FATURA NO']+'\u0000'+e['ÜRÜN']));
  for(const r of kalem){ const ay=tAyNo(r['FATURA TARİHİ']); const od=bshOdediMi(bsh,r['FATURA NO'],r['ÜRÜN'],r.KAMPANYA||null);
    if(od) r.DURUM=`BSH ÖDEMİŞ (${ayMetni(od[0]['BSH DÖNEM'])} hakedişi)`;
    else if(eskiK.has(r['FATURA NO']+'\u0000'+r['ÜRÜN']+'\u0000'+norm(r.KAMPANYA))||(!r.KAMPANYA&&eskiF.has(r['FATURA NO']+'\u0000'+r['ÜRÜN']))) r.DURUM='DAHA ÖNCE İTİRAZ EDİLDİ';
    else if(!r.KAMPANYA) r.DURUM='KAMPANYA ADI BULUNAMADI — ELLE YAZ';
    else if(donem.has(ay)) r.DURUM='İTİRAZ';
    else{ const [acik]=ayAcikMi(tanim,kampanyaAyi(r.KAMPANYA,r['FATURA TARİHİ']),bugun); r.DURUM=acik?"AY AÇIK — DİVA'YA KAMPANYA GİRİLMELİ":`${ayMetni(ay)} HAKEDİŞİ GELİNCE İTİRAZ EDİLECEK`; } }
  return kalem;
}
function eskiItirazDurumu(eski,bsh){ return (eski||[]).map(e=>{ const x=bshOdediMi(bsh,e['FATURA NO'],e['ÜRÜN'],e.KAMPANYA||null);
  return x?{...e,DURUM:'ÖDENDİ','BSH DÖNEM':x[0]['BSH DÖNEM']!==null?ayMetni(x[0]['BSH DÖNEM']):'','BSH ÖDEDİĞİ':pyRound(x.reduce((a,b)=>a+b['BSH HAKEDİŞ'],0),2)}
           :{...e,DURUM:'BEKLİYOR — BSH henüz ödemedi','BSH DÖNEM':null,'BSH ÖDEDİĞİ':null}; }); }
function ileriTeslimler(kontrol,tanim,subeler,milat){
  const x=kontrol.filter(r=>String(r['SONUÇ']).startsWith('SARKAN — İLERİ')&&(r['KAMPANYA AYI']||0)>=milat).map(r=>{ const t=tanim.get(norm(r.PAKET));
    return {...r,'MAĞAZA':magazaBul(subeler,r['ŞUBE']),FATURALI:!!r['GERÇEK FATURA NO'],'SON TARİH':(t&&tarih(tDeger(t,'HAKEDİŞ SON TARİHİ')))||aySonu(Math.trunc(r['KAMPANYA AYI']),2),
      'RİSK':r['TÜR']==='KEA'?'ŞEHRE DÖNÜŞ: ileri teslimin kampanya süresi içinde faturalanması gerekiyordu':''}; });
  return x.map((r,i)=>[r,i]).sort((p,q)=>{const a=p[0],b=q[0]; return (a.FATURALI-b.FATURALI)||cmp(a['MAĞAZA'],b['MAĞAZA'])||cmp(a['FATURA TARİHİ']||'9999',b['FATURA TARİHİ']||'9999')||cmp(a['FATURA NO'],b['FATURA NO'])||p[1]-q[1];}).map(p=>p[0]);
}

// ------------------------------------------------------------------ özet (ekran + ÖZET sayfası)
const toplamNull=xs=>{ const v=xs.filter(x=>!bos(x)).map(Number); return v.length?v.reduce((a,b)=>a+b,0):null; };
const toplam0=xs=>xs.filter(x=>!bos(x)).map(Number).reduce((a,b)=>a+b,0);
function ozet(kontrol){
  const gecerli=kontrol.filter(r=>!/^(MİLAT ÖNCESİ|KAPSAM DIŞI)/.test(r['SONUÇ']));
  const kir=g=>{ const a=g.map(r=>r['AÇIK (BEKLENEN − ÖDENEN)']), s=g.map(r=>String(r['SONUÇ']));
    const sec=f=>toplam0(a.filter((_,i)=>f(s[i])));
    return {satir:g.length,beklenen:toplamNull(g.map(r=>r['BEKLENEN (KDV HARİÇ)'])),odenen:toplamNull(g.map(r=>r['BSH ÖDENEN'])),acik:pyRound(toplam0(a),2),
      tutarFarki:pyRound(sec(x=>/^(TAM|EKSİK|FAZLA|ÖDENDİ|HAKEDİŞ YOK)/.test(x)),2),sarkan:pyRound(sec(x=>/^(SARKAN|BSH DETAYI)/.test(x)),2),
      itiraz:pyRound(sec(x=>x.startsWith('ÖDENMEDİ')),2),hesaplanamayan:g.filter(r=>bos(r['BEKLENEN (KDV HARİÇ)'])).length}; };
  const ayTur=new Map(); for(const r of gecerli){ if(bos(r['KAMPANYA AYI']))continue; const k=r['KAMPANYA AYI']+'\u0000'+r['TÜR']; if(!ayTur.has(k))ayTur.set(k,[]); ayTur.get(k).push(r); }
  const kirilim=[...ayTur.keys()].sort((x,y)=>{const a=x.split('\u0000'),b=y.split('\u0000');return (+a[0])-(+b[0])||cmp(a[1],b[1]);}).map(k=>{const [ay,tur]=k.split('\u0000'); return {etiket:`${ayMetni(+ay)} — ${tur}`,...kir(ayTur.get(k))};});
  const kova=x=>/^(ÖDENMEDİ|EKSİK|FAZLA)/.test(x)?'A) İTİRAZ / KONTROL':/^(SARKAN|BSH DETAYI)/.test(x)?'B) SARKAN — SONRAKİ HAKEDİŞTE BEKLENİYOR':/^(TAM|HAKEDİŞ YOK|ÖDENDİ)/.test(x)?'C) TAMAM':'D) KONTROL DIŞI';
  const sonuc=new Map(); for(const r of kontrol){ const kv=kova(r['SONUÇ']); if(!sonuc.has(kv))sonuc.set(kv,new Map()); const m=sonuc.get(kv); if(!m.has(r['SONUÇ']))m.set(r['SONUÇ'],[]); m.get(r['SONUÇ']).push(r); }
  const sonuclar=[...sonuc.keys()].sort(cmp).map(kv=>({kova:kv,satirlar:[...sonuc.get(kv).keys()].sort(cmp).map(s=>{const g=sonuc.get(kv).get(s);return {sonuc:s,satir:g.length,beklenen:toplamNull(g.map(r=>r['BEKLENEN (KDV HARİÇ)'])),odenen:toplamNull(g.map(r=>r['BSH ÖDENEN'])),acik:toplamNull(g.map(r=>r['AÇIK (BEKLENEN − ÖDENEN)']))};})}));
  return {kirilim,toplam:kir(gecerli),sonuclar};
}

// ------------------------------------------------------------------ ana hesap
/* girdi = {
     marka:'BOSCH', milat:202609, bugun:'YYYY-MM-DD',
     divaKampanya:[{dosyaAdi, satirlar}], divaFatura:[{dosyaAdi, satirlar}], bshDetay:[{dosyaAdi, sayfalar:[{ad,satirlar}]}],
     oranlar:[fiyatFarkOku() çıktıları birleşik], ekOranlar:[...], paketler:[...], subeler:[...], eskiItirazlar:[...] } */
function hesapla(g){
  const milat=g.milat||202609, bugun=g.bugun;
  const oranlar=[...(g.oranlar||[]),...ekOranlar(g.ekOranlar)];
  let d=divaKampanyaOku(g.divaKampanya||[],g.marka||'BOSCH');
  const {tanim,yeniler}=paketleriHazirla(g.paketler,d.map(r=>r.PAKET),milat);
  d=beklenenHesapla(d,tanim,oranlar,milat);
  const fat=divaFaturaOku(g.divaFatura||[]);
  d=gercekFaturaBul(d,fat.satis,fat.kapsam); d=iadeIsaretle(d,fat.iade);
  const bsh=bshDetayOku(g.bshDetay||[]);
  const {kontrol,bshFazla}=bshEslestir(d,bsh);
  const subeler=g.subeler||[], bayi=bayiKodlari(d,subeler);
  const kayip=kayiplariTopla({kontrol,bsh,tanim,subeler,bayi,eski:g.eskiItirazlar||[],bugun});
  return {d,kontrol,bshFazla,setler:bundleSetleri(d),kayip,eskiDurum:eskiItirazDurumu(g.eskiItirazlar,bsh),ileri:ileriTeslimler(kontrol,tanim,subeler,milat),
    yeniPaketler:yeniler,oranlar,bsh,kapsam:fat.kapsam,faturaSatir:fat.satirlar,bayi,ozet:ozet(kontrol),
    uyarilar:{oranYok:d.filter(r=>r['HESAP DURUMU']==='ORAN YOK').length,tanimsiz:d.filter(r=>r['HESAP DURUMU']==='TANIMSIZ PAKET').length,
      tarihDisi:d.filter(r=>/kampanya (başlangıcından|bitişinden)/.test(r.UYARI)).length,eksikSet:d.filter(r=>r.UYARI.includes('EKSİK SET')).length,yeniPaket:yeniler.length,bshYok:!bsh.length}};
}

// ------------------------------------------------------------------ BSH itiraz formu (form_yaz — renksiz)
const FORM_BASLIK=['Bölge','Alt Bölge','Rut','Bayi Kodu','Nihai Kod','Unvan','Fatura No','Değişen Fatura No','Ürün Kodu','Satış Tipi','Diva Yaratma Tarihi','Montaj Tarihi','Nakliye Tarihi','İtiraz Alanı','Montaj/Nakliye Sipariş No','Montaj/Nakliye Tarihi','Kampanya 1 Adı','Kampanya 2 Adı','Kampanya 3 Adı','Kampanya 4 Adı'];
const FORM_GEN=[8,10,13,11,10,22,13,18,14,14,13,13,13,26,22,22,46,46,16,16];
function sayiMi(v){ const s=String(v??'').trim(); return /^\d+$/.test(s)?Number(s):(s||null); }
// Excel'e yazılacak satır dizisi (aoa). Tarihler 'YYYY-MM-DD' → ekran katmanı Excel tarihine çevirir.
function itirazFormuAoa(kalemler){
  const r1=Array(20).fill(null); r1[14]='Nakliye veya Montaj Alanına İtiraz Var İse'; r1[16]='Kampanya Kısmına İtiraz Var İse';
  const aoa=[r1,FORM_BASLIK.slice()];
  for(const k of kalemler){ const bundle=k['TÜR']==='BUNDLE';
    aoa.push(['TRBM','TM1','000TRRBM13',k['BAYİ'],null,k['MÜŞTERİ'],sayiMi(k['FATURA NO']),sayiMi(k['DEĞİŞEN FATURA NO'])||null,k['ÜRÜN'],k['SATIŞ TİPİ']||null,k['DİVA TARİHİ'],null,null,
      'Kampanya Adı Yansımamış',null,null,bundle?null:k.KAMPANYA,bundle?k.KAMPANYA:null,null,null]); }
  return {aoa,merges:['O1:P1','Q1:T1'],genislik:FORM_GEN};
}

return {KDV,AY_ADI,PAKET_KOL,FORM_BASLIK,norm,kod,fno,tarih,sayi,pyRound,pyStr,kampanyaAyi,aySonu,ayMetni,tMetin,gunFark,gunEkle,oranBenzerlik,
  tabloOku,kolonTemizle,dosyaTuru,fiyatFarkOku,ekOranlar,oranBul,paketleriHazirla,divaKampanyaOku,beklenenHesapla,divaFaturaOku,gercekFaturaBul,
  bshDetayOku,bshEslestir,bundleSetleri,magazaBul,kisaBayi,bayiKodlari,kayiplariTopla,eskiItirazDurumu,ileriTeslimler,ozet,hesapla,itirazFormuAoa,sayiMi};
});
