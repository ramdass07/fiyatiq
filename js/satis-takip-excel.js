/* FiyatIQ v11.16 — 📥 SATIŞ TAKİP EXCELİ (23 Eyl 2026, Burak'ın EMAAR BOSCH formatı).
   Satıldı tekliflerinden mağazanın "AYLIK SATIŞ KASA TAKİP FÖYÜ" dosyasını üretir:
   DATA (satırlar + EMAAR formülleri + üst SUBTOTAL bloğu + banka×taksit komisyon matrisi),
   Kodlar (aktif dönem toptan — maliyet kaynağı), Bip (aktif dönem BİP KDV dahil).
   v1 sınırları: rapor sayfaları (Satış, Satışçıya Göre, Ürün Grubu, Banka Tahsilat,
   PRİMLİ ÜRÜNLER) yok; TAHSİLAT=SATIŞ varsayılır (peşin), KASA DEVİR satırını mağaza ekler. */
'use strict';

async function fqStkBayiListesi(){
  const sel=$('stkMagaza'); if(!sel||sel.dataset.dolu)return;
  try{
    const {data}=await sb.from('profiller').select('id,ad,magaza,rol').eq('rol','bayi').order('ad');
    (data||[]).forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=(p.ad||p.id.slice(0,8))+(p.magaza?' · '+p.magaza:''); sel.appendChild(o); });
    sel.dataset.dolu='1';
  }catch(e){}
}

function fqStkKolon(n){ let s=''; while(n>0){ s=String.fromCharCode(65+((n-1)%26))+s; n=Math.floor((n-1)/26);} return s; }

async function fqSatisTakipIndir(){
  const msg=$('stkMsg'), btn=$('stkBtn');
  const ay=$('stkAy').value; const bayi=$('stkMagaza').value;
  if(!ay){ msg.className='msg bad'; msg.textContent='Ay seç.'; return; }
  btn.disabled=true; msg.className='msg'; msg.textContent='Veriler toplanıyor…';
  try{
    const bas=ay+'-01', bit=new Date(+ay.slice(0,4), +ay.slice(5,7), 1).toISOString().slice(0,10);
    // 1) Satıldı teklifler (satış tarihi yoksa oluşturma tarihi ayın içinde olan)
    let q=sb.from('teklifler').select('id,bayi_id,marka,musteri_ad,musteri_tel,satirlar,created_at,gercek_satis_tutari,satis_odeme_sekli,satis_banka,satis_taksit_sayisi,satis_tarihi').eq('durum','satildi').eq('marka',brand);
    if(bayi!=='hepsi') q=q.eq('bayi_id',bayi);
    const {data:tekArr,error:e1}=await q; if(e1) throw e1;
    const satislar=(tekArr||[]).filter(t=>{ const d=String(t.satis_tarihi||t.created_at||'').slice(0,10); return d>=bas&&d<bit; })
      .sort((a,b)=>String(a.satis_tarihi||a.created_at).localeCompare(String(b.satis_tarihi||b.created_at)));
    // 2) Kodlar (aktif dönem toptan, %3'lü) + ürün adları
    const [top,urun,bipRes,bankaRes]=await Promise.all([
      sb.from('toptan_fiyatlar').select('model_kodu,toptan_fiyat').eq('marka',brand).eq('donem',aktifDonem),
      sb.from('urunler').select('model_kodu,urun_adi').eq('marka',brand),
      sb.from('bip').select('model_kodu,bip_tutar').eq('donem',aktifDonem).eq('marka',brand),
      sb.from('banka_komisyonlari').select('banka,taksit_sayisi,oran')
    ]);
    for(const r of [top,urun,bipRes,bankaRes]) if(r.error) throw r.error;
    const adMap={}; (urun.data||[]).forEach(u=>adMap[u.model_kodu]=u.urun_adi||'');
    // 3) Komisyon matrisi: banka -> {taksit:oran}
    const mat={}; (bankaRes.data||[]).forEach(b=>{ (mat[b.banka]=mat[b.banka]||{})[+b.taksit_sayisi]=+b.oran; });
    const bankalar=Object.keys(mat).sort(); ['HAVALE','NAKİT','BANKA KASA','ONLINE'].forEach(x=>{ if(!bankalar.includes(x)) bankalar.push(x); });
    // 4) DATA sayfası
    const ws={}; const put=(a,c)=>{ ws[a]=c; };
    const N=Math.max(4+satislar.reduce((s,t)=>s+(((t.satirlar||{}).items)||[]).length,0)-1, 4);
    const F={t:'s'};
    put('A1',{t:'s',v:' AYLIK SATIŞ KASA TAKİP FÖYÜ'});
    const basliklar=['TARİH','MÜŞTERİ ADI SOYADI','İLETİŞİM BİLGİSİ','ADRES','STOK KODU','ADET','BANKA KASA','MALİYET','SATIŞ TUTARI','TAHSİLAT \nTUTARI','KALAN TUTAR','KAR','KAR ORANI','BANKA KOMİSYON','ÖDEME ŞEKLİ','TAKSİT SAYISI','KART\nKOM','NET \nKAR','NET KAR\n%','TESLİMAT','SATIŞ DANIŞMANI','ÜRÜN GRUBU 1','ÜRÜN GRUBU 2','AÇIKLAMA','BİP TUTAR','BUNDLE \nTUTAR','BİP+BUNDLE \nTUTAR','BİP+BUNDLE \nDAHİL KAR','KAMPANYA \nBUNDLE','MARKA'];
    basliklar.forEach((b,i)=>put(fqStkKolon(i+1)+'3',{t:'s',v:b}));
    // üst SUBTOTAL bloğu (EMAAR satır 2)
    const S9=c=>({t:'n',f:'SUBTOTAL(9,'+c+'4:'+c+N+')'});
    put('F2',S9('F')); put('G2',S9('G')); put('H2',S9('H')); put('I2',S9('I'));
    put('J2',{t:'n',f:'SUM(J4:J'+N+')'}); put('K2',S9('K')); put('L2',S9('L'));
    put('M2',{t:'n',f:'I2/H2-1'}); put('Q2',S9('Q')); put('R2',{t:'n',f:'L2-Q2'});
    put('S2',{t:'n',f:'I2/(H2+Q2)-1'});
    put('Y2',{t:'n',f:'SUM(Y4:Y'+N+')'}); put('Z2',{t:'n',f:'SUM(Z4:Z'+N+')'});
    put('AA2',{t:'n',f:'Y2+Z2'}); put('AB2',{t:'n',f:'IFERROR(I2/(H2+Q2-AA2)-1,"")'});
    // komisyon matrisi (AJ3:AY..): AK3:AY3 = taksit 1..15, AJ4.. = bankalar
    for(let t=1;t<=15;t++) put(fqStkKolon(36+t)+'3',{t:'n',v:t});
    bankalar.forEach((b,i)=>{ const r=4+i; put('AJ'+r,{t:'s',v:b});
      for(let t=1;t<=15;t++){ const o=(mat[b]||{})[t]; if(o!=null) put(fqStkKolon(36+t)+r,{t:'n',v:o}); } });
    const matSon=3+bankalar.length;
    // veri satırları
    let r=4;
    for(const t of satislar){
      const items=(((t.satirlar||{}).items)||[]).filter(x=>x&&x.model);
      const tarih=String(t.satis_tarihi||t.created_at).slice(0,10);
      for(const it of items){
        const adet=Math.max(1,Math.round(+it.adet||1));
        const birim=(+it.taksit>0?+it.taksit:(+it.nakit>0?+it.nakit:0));
        put('A'+r,{t:'s',v:tarih});
        put('B'+r,{t:'s',v:t.musteri_ad||''});
        put('C'+r,{t:'s',v:t.musteri_tel||''});
        put('E'+r,{t:'s',v:String(it.model).toUpperCase()});
        put('F'+r,{t:'n',v:adet});
        put('H'+r,{t:'n',f:'IFERROR(VLOOKUP(E'+r+',Kodlar!A:B,2,0)*F'+r+',"")'});
        put('I'+r,{t:'n',v:Math.round(birim*adet*100)/100});
        put('J'+r,{t:'n',f:'I'+r});
        put('K'+r,{t:'n',f:'I'+r+'-J'+r});
        put('L'+r,{t:'n',f:'IFERROR(I'+r+'-H'+r+',"")'});
        put('M'+r,{t:'n',f:'IFERROR(I'+r+'/H'+r+'-1,"")'});
        put('N'+r,{t:'n',f:'IFERROR(INDEX($AK$4:$AY$'+matSon+',MATCH(O'+r+',$AJ$4:$AJ$'+matSon+',0),MATCH(P'+r+',$AK$3:$AY$3,0)),0)'});
        put('O'+r,{t:'s',v:t.satis_banka||t.satis_odeme_sekli||''});
        if(t.satis_taksit_sayisi!=null) put('P'+r,{t:'n',v:+t.satis_taksit_sayisi});
        put('Q'+r,{t:'n',f:'IFERROR(J'+r+'*N'+r+'/100,"")'});
        put('R'+r,{t:'n',f:'IFERROR(L'+r+'-Q'+r+',"")'});
        put('S'+r,{t:'n',f:'IFERROR(I'+r+'/(H'+r+'+Q'+r+')-1,"")'});
        put('V'+r,{t:'s',v:(FiyatIQCore.kategoriOf(it.model)[0]||'')});
        put('W'+r,{t:'s',v:''});
        put('X'+r,{t:'s',v:'FiyatIQ · '+((t.satirlar||{}).no||'')});
        put('Y'+r,{t:'n',f:'IFERROR(VLOOKUP(E'+r+',Bip!A:B,2,0)*F'+r+',0)'});
        put('Z'+r,{t:'n',v:0});
        put('AA'+r,{t:'n',f:'Y'+r+'+Z'+r});
        put('AB'+r,{t:'n',f:'IFERROR(I'+r+'/(H'+r+'+Q'+r+'-AA'+r+')-1,"")'});
        put('AD'+r,{t:'s',v:String(t.marka||brand).toUpperCase()});
        r++;
      }
    }
    ws['!ref']='A1:AY'+Math.max(r-1,matSon,4);
    ws['!cols']=[{wch:11},{wch:22},{wch:14},{wch:12},{wch:13},{wch:6},{wch:11},{wch:11},{wch:12},{wch:11},{wch:10},{wch:11},{wch:9},{wch:9},{wch:16},{wch:7},{wch:9},{wch:11},{wch:8},{wch:11},{wch:16},{wch:12},{wch:14},{wch:18},{wch:10},{wch:9},{wch:11},{wch:9},{wch:9},{wch:9}];
    // 5) Kodlar + Bip sayfaları
    const kodlarAoa=[['EYLÜL TOPTAN — FiyatIQ '+aktifDonem],['ÜRÜN KODLARI','FİYATLAR','ÜRÜN GRUBU','ÜRÜN TANIMI','','MARKA']];
    (top.data||[]).sort((a,b)=>a.model_kodu.localeCompare(b.model_kodu)).forEach(x=>kodlarAoa.push([x.model_kodu,+x.toptan_fiyat,(FiyatIQCore.kategoriOf(x.model_kodu)[0]||''),adMap[x.model_kodu]||'',1,String(brand).toUpperCase()]));
    const bipAoa=[['Ürün Kodu','Birim Fiyat Farkı (KDV dahil) — FiyatIQ '+aktifDonem,'']];
    (bipRes.data||[]).sort((a,b)=>a.model_kodu.localeCompare(b.model_kodu)).forEach(x=>bipAoa.push([x.model_kodu,Math.round(+x.bip_tutar*100)/100,'BİP']));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'DATA');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(kodlarAoa),'Kodlar');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(bipAoa),'Bip');
    const magazaAd=bayi==='hepsi'?'TUM-MAGAZALAR':(($('stkMagaza').selectedOptions[0]||{}).textContent||'magaza').split(' · ')[0].replace(/[^A-Za-z0-9ĞÜŞİÖÇğüşıöç ]/g,'').trim().replace(/\s+/g,'_');
    XLSX.writeFile(wb,magazaAd+'_'+String(brand).toUpperCase()+'_'+ay+'_SATIS_TAKIP.xlsx');
    msg.className='msg ok';
    msg.textContent='✓ '+satislar.length+' satış / '+(r-4)+' satır yazıldı. Formüller (maliyet, BİP, komisyon, kâr) dosyada canlı; TAHSİLAT sütunu satış tutarına eşitlendi — kalan ödemeleri mağaza düzeltir.';
    if(!satislar.length) msg.textContent='Seçilen ayda Satıldı kaydı yok — dosya boş şablon olarak indi (Kodlar + Bip + komisyon matrisi dolu).';
  }catch(e){ msg.className='msg bad'; msg.textContent='Üretilemedi: '+(e.message||e); }
  finally{ btn.disabled=false; }
}
