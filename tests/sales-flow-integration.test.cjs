const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {harness}=require('./harness.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));

// Synthetic service boundary: real application entry points and calculations run,
// but catalog reads, quote persistence, popups and WhatsApp navigation stay local.
function scenario(t,brand){
 const h=harness(t),records=new Map(),queries=[],rpc=[],popups=[],alerts=[];
 const codes=brand==='bosch'?['WAS123','WQ123','KG123','SM123']:['WM123','WT123','KG234','SN123'];
 const names=['Çamaşır makinesi','Kurutma makinesi','Buzdolabı','Bulaşık makinesi'];
 const catalog=Object.fromEntries(codes.map((code,i)=>[code,{
  urun_adi:names[i],toptan_fiyat:[10000,12000,15000,7000][i],
  bip_tutar:[1000,2000,1000,500][i],nakit_fiyat:[15000,18000,21000,11000][i]
 }]));
 const campaigns=[
  {id:'laundry',ad:'Çamaşır ve kurutma seti',match_type:'all',kategoriler:['CAMASIR','KURUTMA'],hakedis:1000,musteri_indirimi:1200},
  {id:'kitchen',ad:'Mutfak seti',match_type:'all',kategoriler:['BUZDOLABI','BULASIK'],hakedis:1500,musteri_indirimi:1800}
 ].map(c=>({...c,marka:brand,aktif:true,bitis_tarihi:'2999-09-30'}));
 h.w.__campaigns=campaigns;
 h.run(fs.readFileSync(path.join(__dirname,'../js/musteri-gorunumu.js'),'utf8'));
 h.w.__sb.rpc=async(name,args)=>{
  rpc.push({name,args:clone(args)});assert.equal(name,'urun_fiyat');assert.equal(args.p_marka,brand);
  return {data:catalog[args.p_model_kodu]?[clone(catalog[args.p_model_kodu])]:[],error:null};
 };
 h.w.__sb.from=table=>{
  const methods=[],q={};
  for(const method of ['select','eq','order','range','limit','upsert','update'])q[method]=(...args)=>{methods.push([method,...args]);return q;};
  const execute=single=>{
   queries.push({table,methods:clone(methods)});
   const filter=key=>methods.find(m=>m[0]==='eq'&&m[1]===key)?.[2];
   if(table==='stok'){
    assert.equal(filter('marka'),brand);assert.equal(filter('bayi_id'),'central');
    return {data:[{depo:'mars',tip:'mevcut',adet:0,stok_tarihi:h.run('_bugun()')}],error:null};
   }
   if(table==='banka_komisyonlari')return {data:single?{oran:5}:[{banka:'Test Banka',taksit_sayisi:6,oran:5}],error:null};
   assert.equal(table,'teklifler','Unexpected service operation');
   const write=methods.find(m=>m[0]==='upsert'||m[0]==='update');
   if(write){
    const id=filter('id')||`flow-${records.size+1}`;
    if(write[0]==='update')assert.ok(records.has(id),'Update must address an existing quote');
    records.set(id,{created_at:'2026-09-11T09:00:00Z',durum:'teklif',...records.get(id),...clone(write[1]),id});
    return {data:{id},error:null};
   }
   const rows=[...records.values()].filter(r=>(!filter('id')||r.id===filter('id'))&&(!filter('bayi_id')||r.bayi_id===filter('bayi_id')));
   return {data:clone(single?(rows[0]||null):rows),count:rows.length,error:null};
  };
  q.single=q.maybeSingle=()=>Promise.resolve(execute(true));
  q.then=(yes,no)=>Promise.resolve(execute(false)).then(yes,no);
  return q;
 };
 h.w.open=()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');t.after(()=>dom.window.close());
  const popup={document:dom.window.document,location:{href:''},opener:{},closed:false,printed:0,focus(){},print(){this.printed++;},close(){this.closed=true;}};
  popups.push(popup);return popup;
 };
 h.w.alert=message=>alerts.push(message);
 h.run(`brand=${JSON.stringify(brand)};aktifKampanyalar=__campaigns;fqReloadData=async()=>{aktifKampanyalar=__campaigns;};
  $('banka').innerHTML='<option value="">Peşin</option><option>Test Banka</option>';
  $('mAd').value='Sentetik Test Müşterisi';$('mTel').value='05550000000';$('satisPersonel').value='Test Satıcısı';
  $('mTC').value='11111111111';$('fqValidUntil').value='2999-09-30';renderRows();`);
 return {...h,records,queries,rpc,popups,alerts,codes,names,catalog};
}

function input(h,id,value){
 const element=h.w.document.getElementById(id);element.value=String(value);
 // Outside-only JSDOM does not execute inline handlers on dispatched events.
 // Evaluate the actual page handler with the real element as `this`.
 h.w.__input=element;
 h.run(`(function(){${element.getAttribute('oninput')}}).call(__input)`);
}
function assertProducts(h){
 const doc=h.w.document;
 assert.deepEqual([...doc.querySelectorAll('#rows [data-fq-field="kod"]')].map(e=>e.value).filter(Boolean),h.codes);
 assert.deepEqual([...doc.querySelectorAll('#rows .product-name')].map(e=>e.textContent).filter(Boolean),h.names);
}
function assertCustomerOutput(text){
 assert.match(text,/34\.000 ₺/);assert.match(text,/36\.000 ₺/);
 assert.doesNotMatch(text,/maliyet|BİP|bip_tutar|hakedis|hakediş|karPct|kâr|komisyon|workflow_inputs|11111111111/i);
}
function writeCount(h){return h.queries.filter(q=>q.methods.some(m=>m[0]==='upsert'||m[0]==='update')).length;}

for(const brand of ['bosch','siemens'])test(`${brand}: product entry → two bundles → loss → negotiation → save → reopen → customer outputs → current-price copy`,async t=>{
 const h=scenario(t,brand),doc=h.w.document;
 for(let i=0;i<h.codes.length;i++)await h.run(`onCode(${i},${JSON.stringify(h.codes[i])})`);
 assertProducts(h);assert.equal(h.rpc.length,4);assert.equal(h.run('teklifItems().every(r=>r.netStok===0)'),true);
 assert.match(doc.getElementById('uyariKutu').textContent,/STOKSUZ ÜRÜN/);
 h.run("$('banka').value='Test Banka'");await h.run('loadTaksit()');
 assert.equal(h.run('komisOran'),5);assert.equal(doc.getElementById('taksit').value,'6');
 h.run("toggleKampanya('laundry');toggleKampanya('kitchen')");
 assert.equal(h.run('secilenKampanya.size'),2);assert.equal(h.run('lastTot.hakedis'),2500);
 assert.equal(h.run('lastTot.dip'),37000);assert.equal(h.run('lastTot.finalNakit'),38480);

 input(h,'karOrani',-5);assertProducts(h);
 assert.equal(h.run('lastTot.finalNakit'),35150);assert.ok(Math.abs(h.run('lastTot.finalTaksit')-37000)<1e-8);
 assert.ok(Math.abs(h.run('lastTot.karPct')+5)<1e-8);
 input(h,'mtPesin','34.000');input(h,'mtTaksit','36.000');assertProducts(h);
 assert.equal(h.run('lastTot.finalNakit'),34000);assert.equal(h.run('lastTot.finalTaksit'),36000);
 assert.ok(Math.abs(h.run('lastTot.karPct')-(34200/37000-1)*100)<1e-8);
 assert.match(doc.getElementById('karPct').textContent,/ZARAR/);assert.equal(doc.getElementById('fqSaveQuote').disabled,false);
 const net=clone(h.run('teklifSatirlar(teklifItems()).rows.map(x=>({model:x.r.kod,cash:x.netP,installment:x.netT}))'));
 assert.equal(net.reduce((s,r)=>s+r.cash,0),34000);assert.equal(net.reduce((s,r)=>s+r.installment,0),36000);
 assert.equal(h.run('fqShowCustomerView()'),true);assertCustomerOutput(doc.getElementById('fqCustomerView').textContent);h.run('fqCloseCustomerView()');
 assert.equal(writeCount(h),0,'Customer presentation must not save or send');

 assert.equal(await h.run('saveQuote()'),true);const saved=clone(h.records.get('flow-1'));
 assert.equal(saved.toplam,34000);assert.equal(saved.satirlar.workflow_inputs.inputs.karOrani,'-5');
 assert.equal(saved.satirlar.hesap.hakedis,2500);assert.deepEqual(saved.satirlar.workflow_inputs.campaigns,['laundry','kitchen']);
 assert.deepEqual(saved.satirlar.net_items.map(r=>({model:r.model,cash:r.net_nakit,installment:r.net_taksit})),net);
 await h.run("printDoc('teklif')");const activePrint=h.popups.at(-1);assert.equal(activePrint.closed,false);assertCustomerOutput(activePrint.document.body.textContent);
 await h.run('shareWhatsApp()');const activeMessage=new URL(h.popups.at(-1).location.href);
 assert.equal(activeMessage.origin,'https://api.whatsapp.com');assert.equal(activeMessage.searchParams.get('phone'),'905550000000');assertCustomerOutput(activeMessage.searchParams.get('text'));
 assert.equal(h.records.size,1,'Printing and preparing WhatsApp must update the same quote');
 assert.deepEqual(h.records.get('flow-1'),saved,'Customer outputs must preserve the saved price snapshot');

 h.run('fqClearWorkspace()');assert.equal(h.run('savedTeklifId'),null);
 await h.run('fqOpenMyQuotes()');assert.match(doc.getElementById('fqMyList').textContent,new RegExp(saved.teklif_no));
 const beforeRead=writeCount(h);await h.run("openTeklifDetay('flow-1')");
 const detail=doc.getElementById('quoteDetailBody').textContent;for(const code of h.codes)assert.ok(detail.includes(code));assert.match(detail,/34\.000/);
 const profitField=[...doc.querySelectorAll('#quoteDetailBody .detail-field')].find(e=>e.querySelector('span').textContent==='Gerçek taksitli kâr');
 assert.equal(profitField?.querySelector('strong').textContent,'%-7,57');assert.doesNotMatch(detail,/Gerçek peşin kâr/);
 assert.equal(await h.run("fqPrintSavedQuote('flow-1')"),true);assertCustomerOutput(h.popups.at(-1).document.body.textContent);assert.equal(h.popups.at(-1).printed,1);
 assert.equal(await h.run("fqShareSavedQuote('flow-1')"),true);assertCustomerOutput(new URL(h.popups.at(-1).location.href).searchParams.get('text'));
 assert.equal(writeCount(h),beforeRead,'Reopening and saved outputs must be read-only');

 // Reopening for editing explicitly makes a new copy with current catalog costs.
 h.catalog[h.codes[0]].toptan_fiyat+=1000;
 await h.run("fqCopyQuote('flow-1')");assertProducts(h);
 assert.equal(h.rpc.length,8,'Copy must refetch all four products');assert.equal(h.run('quoteRows[0].toptan'),11000);
 assert.equal(h.run('lastTot.dip'),38000);assert.equal(h.run('lastTot.hakedis'),2500);
 assert.equal(h.run('lastTot.finalNakit'),34000);assert.equal(h.run('lastTot.finalTaksit'),36000);
 assert.equal(doc.getElementById('karOrani').value,'-5');assert.equal(h.run('savedTeklifId'),null);assert.equal(h.run('fqFlow.review'),true);
 assert.equal(await h.run('saveQuote()'),false);assert.equal(writeCount(h),beforeRead);
 h.run('fqConfirmReview()');assert.equal(await h.run('saveQuote()'),true);
 assert.equal(h.records.size,2);assert.notEqual(h.records.get('flow-2').teklif_no,saved.teklif_no);
 assert.deepEqual(h.records.get('flow-1'),saved,'A revised quote must not rewrite the historical offer');
 h.run('delRow(0)');assert.equal(h.run("secilenKampanya.has('laundry')"),false);
 assert.equal(h.run("secilenKampanya.has('kitchen')"),true);assert.equal(h.run('lastTot.hakedis'),1500);
 assert.equal(h.alerts.length,0,'No zero-stock, loss or discount sales block should appear');
});

test('saved profit uses its historical payment basis and stays neutral if commission was not reliably saved',t=>{
 const h=harness(t);h.seed();h.run('komisOran=11.76;lastTot.karPct=99');
 for(const [commission,label] of [[0,'Gerçek peşin kâr'],['0','Gerçek peşin kâr'],[5,'Gerçek taksitli kâr'],['11.76','Gerçek taksitli kâr'],[undefined,'Kayıtlı kâr'],[null,'Kayıtlı kâr'],['','Kayıtlı kâr'],[' ','Kayıtlı kâr'],[false,'Kayıtlı kâr'],['unknown','Kayıtlı kâr'],[-1,'Kayıtlı kâr'],[100,'Kayıtlı kâr']]){
  h.w.__historical={satirlar:{hesap:{komis:commission,karPct:-10.56}}};
  h.run("$('quoteDetailBody').innerHTML=teklifDetayHTML(__historical)");
  const fields=[...h.w.document.querySelectorAll('#quoteDetailBody .detail-field')].filter(e=>/kâr$/.test(e.querySelector('span').textContent));
  assert.equal(fields.length,1);assert.equal(fields[0].querySelector('span').textContent,label);
  assert.equal(fields[0].querySelector('strong').textContent,'%-10,56','Historical margin must not be recomputed from the live basket');
 }
});
