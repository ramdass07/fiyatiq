const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
function setup(t,options={}){
 const h=harness(t),calls=[];
 const profile={rol:'admin',abonelik_durumu:'aktif',marka_erisimi:[]};
 const data={
  urunler:[{model_kodu:'COSTONLY',urun_adi:'Buzdolabı'},{model_kodu:'RETAIL',urun_adi:null},{model_kodu:'OLD',urun_adi:'Eski ürün'},{model_kodu:'INVALID',urun_adi:'INVALID'}],
  toptan_fiyatlar:[{model_kodu:'COSTONLY',toptan_fiyat:12500.25,donem:'2026-09-01'},{model_kodu:'INVALID',toptan_fiyat:0,donem:'2026-09-01'},{model_kodu:'RETAIL',toptan_fiyat:9000,donem:'2026-08-01'}],
  perakende_fiyatlar:[{model_kodu:'RETAIL',nakit_fiyat:35600.15,donem:'2026-09-01'},{model_kodu:'PRICEONLY',nakit_fiyat:500,donem:'2026-09-01'},{model_kodu:'INVALID',nakit_fiyat:-1,donem:'2026-09-01'}],
  bayi_toptan_fiyatlar:[{model_kodu:'RETAIL',toptan_fiyat:21000,donem:'2026-08-01'}],
  bayi_perakende_fiyatlar:[{model_kodu:'RETAIL',nakit_fiyat:30000,donem:'2026-08-01'},{model_kodu:'RETAIL',nakit_fiyat:99000,donem:'2026-09-01'}]
 };
 h.run("profil={rol:'admin',abonelik_durumu:'aktif',marka_erisimi:[]};brand='siemens';fqCatalogAccess()");
 h.w.__sb.from=table=>{
  const methods=[],q={};for(const m of ['select','eq','order','range','limit'])q[m]=(...args)=>{methods.push([m,...args]);return q;};
  async function execute(){
   const call={table,methods:copy(methods)};calls.push(call);
   if(options.intercept){const result=await options.intercept(call);if(result!==undefined)return result;}
   if(table==='profiller'){assert.deepEqual(methods.find(m=>m[0]==='eq'),['eq','id','user-a']);return {data:copy(profile),error:null};}
   assert.ok(Object.hasOwn(data,table),'Unexpected table access');
   assert.deepEqual(methods.find(m=>m[0]==='eq'&&m[1]==='marka'),['eq','marka',h.run('brand')]);
   let rows=copy(data[table]);const period=methods.find(m=>m[0]==='eq'&&m[1]==='donem')?.[2];if(period)rows=rows.filter(r=>r.donem===period);
   if(methods.find(m=>m[0]==='select'&&m[1]==='donem'))return {data:rows.sort((a,b)=>b.donem.localeCompare(a.donem)).slice(0,1).map(r=>({donem:r.donem})),error:null};
   assert.deepEqual(copy(methods.find(m=>m[0]==='order')),['order','model_kodu',{ascending:true}]);
   const count=rows.length;rows.sort((a,b)=>a.model_kodu.localeCompare(b.model_kodu));
   const range=methods.find(m=>m[0]==='range');if(range)rows=rows.slice(range[1],range[2]+1);
   return {data:rows,count,error:null};
  }
  q.single=execute;q.then=(yes,no)=>execute().then(yes,no);return q;
 };
 return {...h,calls,data,profile,doc:h.w.document};
}
function fire(h,id,event){h.doc.getElementById(id).dispatchEvent(new h.w.Event(event,{bubbles:true}));}
function tableText(h){return h.doc.getElementById('fqCatalogRows').textContent;}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('management heading and existing review button each open and load the catalog through a real click',async t=>{
 const h=setup(t),dialog=h.doc.getElementById('fqCatalogDialog');h.seed();const before=h.run('JSON.stringify({quoteRows,lastTot})');
 assert.equal(h.doc.getElementById('fqCatalogCard').nextElementSibling.id,'topluGuncelleme');
 for(const id of ['fqCatalogHeadingOpen','fqCatalogOpen']){
  const button=h.doc.getElementById(id),callsBefore=h.calls.length;
  assert.equal(button.tagName,'BUTTON');assert.equal(button.type,'button');
  assert.equal(button.getAttribute('aria-controls'),dialog.id);assert.equal(button.getAttribute('aria-haspopup'),'dialog');
  button.click();assert.equal(dialog.open,true);await new Promise(setImmediate);
  assert.equal(h.run('fqCatalogCheck.loaded'),true);assert.match(tableText(h),/35.600,15 ₺/);
  assert.equal(h.calls.slice(callsBefore).filter(c=>c.table==='profiller').length,1,'One click starts one load');
  h.doc.getElementById('fqCatalogClose').click();assert.equal(dialog.open,false);
 }
 assert.equal(h.run('JSON.stringify({quoteRows,lastTot})'),before);
});

test('catalog check includes retail-only and price-only rows, distinguishes old catalog and preserves the sale',async t=>{
 const h=setup(t);h.seed();const before=h.run('JSON.stringify({quoteRows,lastTot})');
 await h.run('fqCatalogOpen()');
 assert.equal(h.run('fqCatalogCheck.loaded'),true);assert.equal(h.run('fqCatalogCheck.rows.length'),5);
 assert.equal(h.doc.querySelectorAll('#fqCatalogRows tr').length,4,'Catalog-only old model is excluded by default');
 assert.match(tableText(h),/35.600,15 ₺/);assert.match(tableText(h),/12.500,25 ₺/);assert.match(tableText(h),/PRICEONLY/);
 assert.doesNotMatch(tableText(h),/OLD|9.000/,'Old-period cost must not fill a current cost gap');
 assert.equal(h.run("fqCatalogCheck.rows.find(r=>r.code==='RETAIL').missingCost"),true);
 assert.equal(h.run("fqCatalogCheck.rows.find(r=>r.code==='INVALID').missingRetail"),true);
 h.doc.getElementById('fqCatalogCurrentOnly').checked=false;fire(h,'fqCatalogCurrentOnly','change');
 assert.match(tableText(h),/OLD/);assert.match(tableText(h),/Bu dönem fiyat listelerinde yok/);
 assert.equal(h.run('JSON.stringify({quoteRows,lastTot})'),before);
 assert.ok(h.calls.every(c=>!c.methods.some(m=>['update','upsert','insert','delete'].includes(m[0]))));
 assert.ok(h.calls.every(c=>!['bip','stok'].includes(c.table)));
});

test('source selector uses that source latest cost period, never another source or newer retail-only month',async t=>{
 const h=setup(t);await h.run('fqCatalogOpen()');h.doc.getElementById('fqCatalogSource').value='dealer';await h.run('fqCatalogLoad()');
 assert.equal(h.run('fqCatalogCheck.scope.period'),'2026-08-01');assert.match(tableText(h),/21.000,00 ₺/);assert.match(tableText(h),/30.000,00 ₺/);assert.doesNotMatch(tableText(h),/99.000/);
 assert.match(h.doc.getElementById('fqCatalogContext').textContent,/Dış bayi listesi.*2026-08/);
});

test('missing cost period follows sale fallback month and does not invent an older price',async t=>{
 const h=setup(t);h.data.toptan_fiyatlar=[];const month=h.run('_donem()');
 h.data.perakende_fiyatlar=[{model_kodu:'RETAIL',nakit_fiyat:35600,donem:month}];
 await h.run('fqCatalogOpen()');assert.equal(h.run('fqCatalogCheck.scope.period'),month);assert.match(h.doc.getElementById('fqCatalogContext').textContent,/Toptan listesi yok/);assert.match(tableText(h),/35.600,00/);
});

test('all pages are read, results page at 50 and literal Turkish search/type filters work together',async t=>{
 const h=setup(t);h.data.urunler=Array.from({length:1207},(_,i)=>({model_kodu:'MODEL'+String(i).padStart(4,'0'),urun_adi:i===1206?'İnce Işık <img src=x onerror=alert(1)>':'Ürün'}));
 h.data.toptan_fiyatlar=h.data.urunler.map(r=>({model_kodu:r.model_kodu,toptan_fiyat:100,donem:'2026-09-01'}));h.data.perakende_fiyatlar=[];
 await h.run('fqCatalogOpen()');assert.equal(h.run('fqCatalogCheck.rows.length'),1207);assert.equal(h.doc.querySelectorAll('#fqCatalogRows tr').length,50);
 assert.deepEqual(h.calls.filter(c=>c.table==='urunler').map(c=>c.methods.find(m=>m[0]==='range').slice(1)),[[0,499],[500,999],[1000,1499]]);
 h.doc.getElementById('fqCatalogNext').click();assert.match(h.doc.getElementById('fqCatalogPage').textContent,/Sayfa 2/);
 h.doc.getElementById('fqCatalogSearch').value='ince isik';fire(h,'fqCatalogSearch','input');
 assert.equal(h.doc.querySelectorAll('#fqCatalogRows tr').length,1);assert.match(tableText(h),/MODEL1206/);assert.equal(h.doc.querySelector('#fqCatalogRows img'),null);
 h.doc.getElementById('fqCatalogKind').value='cost';fire(h,'fqCatalogKind','change');assert.equal(h.doc.querySelectorAll('#fqCatalogRows tr').length,0);assert.match(h.doc.getElementById('fqCatalogStatus').textContent,/bulunmadı/);
 h.doc.getElementById('fqCatalogKind').value='retail';fire(h,'fqCatalogKind','change');assert.equal(h.doc.querySelectorAll('#fqCatalogRows tr').length,1);
});

test('empty valid dataset reports no products while denied or incomplete reads never report a clean list',async t=>{
 const h=setup(t);for(const key of Object.keys(h.data))h.data[key]=[];await h.run('fqCatalogOpen()');
 assert.equal(h.run('fqCatalogCheck.loaded'),true);assert.match(h.doc.getElementById('fqCatalogStatus').textContent,/ürün bulunmadı/);
 for(const response of [{data:null,error:{message:'permission denied'}},{data:[],count:5,error:null},{data:[],count:null,error:null}]){
  const bad=setup(t,{intercept:c=>c.table==='urunler'?response:undefined});await bad.run('fqCatalogOpen()');
  assert.equal(bad.run('fqCatalogCheck.loaded'),false);assert.equal(bad.doc.querySelectorAll('#fqCatalogRows tr').length,0);assert.notEqual(bad.doc.getElementById('fqCatalogStatus').textContent,'Bu filtrelere uyan eksik bilgi bulunmadı.');assert.equal(bad.doc.getElementById('fqCatalogRefresh').disabled,false);
 }
});

test('changed count and duplicate pages fail without partial results',async t=>{
 for(const duplicate of [true,false]){
  const h=setup(t,{intercept:c=>{
   if(c.table!=='urunler')return;
   const offset=c.methods.find(m=>m[0]==='range')[1];
   return offset===0?{data:Array.from({length:500},(_,i)=>({model_kodu:'P'+i})),count:501,error:null}:{data:[{model_kodu:duplicate?'P0':'P500'}],count:duplicate?501:502,error:null};
  }});await h.run('fqCatalogOpen()');assert.equal(h.run('fqCatalogCheck.loaded'),false);assert.equal(h.doc.querySelectorAll('#fqCatalogRows tr').length,0);assert.match(h.doc.getElementById('fqCatalogStatus').textContent,/değişti|Tekrarlanan/);
 }
});

test('ordinary dealers, inactive editors and anonymous sessions cannot start the panel; fresh protected profile is checked',async t=>{
 for(const profile of [{rol:'bayi',abonelik_durumu:'aktif'},{rol:'personel',abonelik_durumu:'pasif'}]){
  const h=setup(t);h.w.__profile=profile;h.run('profil=__profile;fqCatalogAccess()');await h.run('fqCatalogOpen()');assert.equal(h.calls.length,0);assert.equal(h.doc.getElementById('fqCatalogDialog').open,false);assert.equal(h.doc.getElementById('fqCatalogCard').style.display,'none');
 }
 const anonymous=setup(t);anonymous.run('authUid=null');await anonymous.run('fqCatalogOpen()');assert.equal(anonymous.calls.length,0);
 const stale=setup(t);stale.profile.rol='bayi';await stale.run('fqCatalogOpen()');assert.equal(stale.calls.length,1);assert.match(stale.doc.getElementById('fqCatalogStatus').textContent,/erişimi doğrulanamadı/);
 const editor=setup(t);editor.profile.rol='personel';editor.run("profil.rol='personel';profil.marka_erisimi=[]");await editor.run('fqCatalogOpen()');assert.equal(editor.run('fqCatalogCheck.loaded'),true,'Existing center editors may read both brands');
});

test('a late source response cannot overwrite the newly selected source',async t=>{
 const wait=deferred();const h=setup(t,{intercept:c=>c.table==='toptan_fiyatlar'&&c.methods.some(m=>m[0]==='select'&&m[1]==='donem')?wait.promise:undefined});
 const pending=h.run('fqCatalogOpen()');await new Promise(setImmediate);
 h.doc.getElementById('fqCatalogSource').value='dealer';await h.run('fqCatalogLoad()');
 wait.resolve({data:[{donem:'2026-09-01'}],error:null});await pending;
 assert.equal(h.run('fqCatalogCheck.scope.source'),'dealer');assert.match(tableText(h),/21.000,00/);assert.doesNotMatch(tableText(h),/COSTONLY/);
});

test('closing, changing brand and signing out discard pending or loaded catalog data',async t=>{
 for(const action of ["$('fqCatalogDialog').close()","brand='bosch';fqEpoch++;fqInvalidateCatalog()",'fqResetSession()']){
  const wait=deferred(),h=setup(t,{intercept:c=>c.table==='urunler'?wait.promise:undefined});const pending=h.run('fqCatalogOpen()');await new Promise(setImmediate);
  h.run(action);wait.resolve({data:[],count:0,error:null});await pending;
  assert.equal(h.doc.getElementById('fqCatalogRows').textContent,'');assert.equal(h.run('fqCatalogCheck.loaded'),false);assert.equal(h.doc.getElementById('fqCatalogDialog').open,false);
 }
 const h=setup(t);await h.run('fqCatalogOpen()');h.run('fqInvalidateCatalog()');assert.equal(h.run('fqCatalogCheck.rows.length'),0);assert.equal(h.doc.getElementById('fqCatalogDialog').open,false);
});

test('period change during scan is rejected and all invalid prices are marked without using retail as cost',async t=>{
 let n=0;const h=setup(t,{intercept:c=>c.table==='toptan_fiyatlar'&&c.methods.some(m=>m[0]==='select'&&m[1]==='donem')?{data:[{donem:++n===1?'2026-09-01':'2026-10-01'}],error:null}:undefined});
 await h.run('fqCatalogOpen()');assert.equal(h.run('fqCatalogCheck.loaded'),false);assert.match(h.doc.getElementById('fqCatalogStatus').textContent,/dönemi tarama sırasında değişti/);
 for(const value of [null,undefined,'',' ',0,-1,'0','NaN','Infinity',false,true]){h.w.__value=value;assert.equal(h.run('fqCatalogPositive(__value)'),false);}
 for(const value of [0.01,12500,'35600.15']){h.w.__value=value;assert.equal(h.run('fqCatalogPositive(__value)'),true);}
});
