const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../js/fiyat-core.js');
const {harness}=require('./harness.cjs');

function basket(t){
 const h=harness(t);h.seed();
 h.run("quoteRows=[{...bosSatir(),kod:'WGA142ZE0TR',ad:'Çamaşır makinesi',adet:2,toptan:10000,bip:1000,etiket:14000,netStok:8},{...bosSatir(),kod:'SMS44DW01T',ad:'Bulaşık makinesi',adet:1,toptan:5000,bip:1000,etiket:8000,netStok:8}];secilenKampanya.clear();aktifKampanyalar=[];ikiliList=[];komisOran=5;renderRows();");
 return h;
}
function target(h,value){
 const input=h.w.document.getElementById('karOrani');input.value=String(value);
 // The harness runs scripts outside-only; execute the actual input handler.
 h.run(input.getAttribute('oninput'));
}
test('signed target markup calculates loss prices and still rejects non-finite input',()=>{
 const row={adet:1,toptan:10000,bip:1000};
 for(const rate of [-0.5,-5,-99.9,-100]){
  const result=Core.calcParts(row,rate,5);
  assert.ok(Math.abs(result.unitNakit-9000*(1+rate/100))<1e-8);
  assert.ok(Math.abs(result.unitTaksit*0.95-result.unitNakit)<1e-8);
  assert.ok(Math.abs(result.karPesin-rate)<1e-8);
 }
 for(const rate of [NaN,Infinity,-Infinity,'invalid'])assert.throws(()=>Core.calcParts(row,rate,0),/Kâr oranı geçersiz/);
});
for(const simple of [true,false])test(`negative target keeps two product codes and names without bundle in ${simple?'simple':'detailed'} view`,t=>{
 const h=basket(t);h.run(`basitMod=${simple};applyGorunum();renderRows()`);
 assert.doesNotThrow(()=>target(h,-5));
 const doc=h.w.document;
 assert.deepEqual([...doc.querySelectorAll('#rows [data-fq-field="kod"]')].map(input=>input.value),['WGA142ZE0TR','SMS44DW01T']);
 assert.deepEqual([...doc.querySelectorAll('#rows .product-name')].map(el=>el.textContent),['Çamaşır makinesi','Bulaşık makinesi']);
 assert.equal(h.run('lastTot.finalNakit'),20900);assert.equal(h.run('lastTot.finalTaksit'),22000);
 assert.ok(Math.abs(h.run('lastTot.karPct')+5)<1e-8);
 assert.equal(h.run('secilenKampanya.size'),0);assert.equal(h.run('lastTot.hakedis'),0);
 assert.match(doc.getElementById('karPct').textContent,/ZARAR -5\.00%/);
 assert.equal(doc.querySelector('[onclick="saveQuote()"]')?.disabled,false);
 for(const value of [-0.5,0,4,-5])assert.doesNotThrow(()=>target(h,value));
 assert.equal(doc.querySelectorAll('#rows .product-name').length,2);
});
test('negative target offer can be saved and its signed target remains in its draft and snapshot',async t=>{
 const h=basket(t);target(h,-5);h.run('fqDraftFlush()');
 assert.equal(h.run('JSON.parse(localStorage.getItem(fqDraftKey())).inputs.karOrani'),'-5');
 h.respond({data:{id:'loss-offer'},error:null});assert.equal(await h.run('saveQuote()'),true);
 const payload=h.calls.find(call=>call.table==='teklifler').methods.find(method=>method[0]==='upsert')[1];
 assert.equal(payload.toplam,20900);assert.equal(payload.satirlar.workflow_inputs.inputs.karOrani,'-5');
 assert.deepEqual(Array.from(payload.satirlar.net_items,row=>row.model),['WGA142ZE0TR','SMS44DW01T']);
 assert.equal(payload.satirlar.net_items.reduce((sum,row)=>sum+row.net_nakit,0),20900);
});
