const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

function setup(t,{viewport=360,left=30,width=170,scrollX=0,scrollY=0}={}){
 const h=harness(t);h.seed();
 h.run("onCodeInput(0,'WM',document.querySelector('[data-fq-field=kod]'))");
 const input=h.w.document.querySelector('[data-fq-field=kod]');input.focus();
 Object.defineProperty(h.w.document.documentElement,'clientWidth',{configurable:true,value:viewport});
 Object.defineProperty(h.w,'scrollX',{configurable:true,value:scrollX});
 Object.defineProperty(h.w,'scrollY',{configurable:true,value:scrollY});
 input.getBoundingClientRect=()=>({left,width,bottom:180,top:136,right:left+width,height:44});
 h.respond({data:[{model_kodu:'WM12N200TR',urun_adi:'Çamaşır makinesi'}],error:null});
 h.w.__codeInput=input;
 return {...h,input,popup:h.w.document.getElementById('ac')};
}

// JSDOM has no layout engine: these verify placement arithmetic against supplied
// DOM rectangles. These arithmetic checks do not establish actual phone rendering.
for(const viewport of [360,390,430])test(`autocomplete stays inside ${viewport}px viewport when its input is near either edge`,async t=>{
 for(const left of [-12,30,viewport-80]){
  const h=setup(t,{viewport,left});await h.run("showAC(0,'WM',__codeInput)");
  const width=parseFloat(h.popup.style.width),start=parseFloat(h.popup.style.left);
  assert.ok(start>=8,'Left margin stays visible');assert.ok(start+width<=viewport-8,'Right margin stays visible');
  assert.ok(width>=Math.min(340,viewport-16),'Readable suggestion width is retained');
  assert.equal(h.popup.classList.contains('show'),true);assert.equal(h.popup.querySelector('.ac-code').textContent,'WM12N200TR');
 }
});

test('autocomplete contracts on a narrow viewport and preserves larger desktop inputs and document scroll offsets',async t=>{
 for(const options of [
  {viewport:320,left:25,width:140,expectedWidth:304,scrollX:0,scrollY:0},
  {viewport:1200,left:25,width:140,expectedWidth:340,scrollX:0,scrollY:0},
  {viewport:1200,left:980,width:140,expectedWidth:340,scrollX:75,scrollY:300},
  {viewport:1200,left:200,width:480,expectedWidth:480,scrollX:75,scrollY:300}
 ]){
  const h=setup(t,options);await h.run("showAC(0,'WM',__codeInput)");
  const width=parseFloat(h.popup.style.width),left=parseFloat(h.popup.style.left)-options.scrollX;
  assert.equal(width,options.expectedWidth);assert.ok(left>=8&&left+width<=options.viewport-8);
  assert.equal(parseFloat(h.popup.style.top),182+options.scrollY);
  if(options.left+width<=options.viewport-8)assert.equal(left,options.left,'A fitting popup stays aligned with its input');
 }
});

test('selecting a repositioned suggestion still fetches the correct product and shows its retail-only reference',async t=>{
 const h=setup(t,{viewport:360,left:280}),calls=[];await h.run("showAC(0,'WM',__codeInput)");
 h.w.__sb.rpc=async(name,args)=>{calls.push({name,args});return {data:[{urun_adi:'Çamaşır makinesi',toptan_fiyat:null,bip_tutar:0,nakit_fiyat:35600}],error:null};};
 h.respond({data:[{depo:'mars',tip:'mevcut',adet:1,stok_tarihi:h.run('_bugun()')}],error:null});
 h.popup.querySelector('.ac-item').onmousedown();await new Promise(setImmediate);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'urun_fiyat');assert.equal(calls[0].args.p_model_kodu,'WM12N200TR');
 assert.equal(h.popup.classList.contains('show'),false);assert.equal(h.run('quoteRows[0].kod'),'WM12N200TR');
 assert.equal(h.run('quoteRows[0].ad'),'Çamaşır makinesi');assert.equal(h.run('quoteRows[0].veriHata'),null);
 assert.equal(h.w.document.querySelector('[data-cost=retail]').textContent,'35.600,00 ₺');
 assert.equal(h.run('quoteRows[0].toptan'),null);assert.equal(h.run('lastTot.finalNakit'),0,'Retail reference is not silently used as cost or sale price');
});
