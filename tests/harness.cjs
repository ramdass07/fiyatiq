const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
function harness(t){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''),{url:'https://fiyatiq.com/',runScripts:'outside-only'});
 const w=dom.window,ctx=dom.getInternalVMContext();
 w.fetch=async()=>({ok:false});w.alert=()=>{};w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.setInterval=()=>0;w.setTimeout=()=>0;w.clearTimeout=()=>{};
 w.XLSX={utils:{}};
 const run=code=>vm.runInContext(code,ctx);
 run(fs.readFileSync(path.join(root,'js/fiyat-core.js'),'utf8'));
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())run(m[1].replace('window.addEventListener("DOMContentLoaded", init);',''));
 run(fs.readFileSync(path.join(root,'js/satis-workflow.js'),'utf8'));
 run(fs.readFileSync(path.join(root,'js/kayit-akisi.js'),'utf8'));
 run(fs.readFileSync(path.join(root,'js/teklif-takip.js'),'utf8'));
 run(fs.readFileSync(path.join(root,'js/teklif-gecerlilik.js'),'utf8'));
 run(fs.readFileSync(path.join(root,'js/stok-guncellik.js'),'utf8'));
 run(fs.readFileSync(path.join(root,'js/kayitli-teklif.js'),'utf8'));
 run(fs.readFileSync(path.join(root,'js/yonetim-raporu.js'),'utf8'));
 const calls=[];let response={data:[],error:null,count:0};
 function query(table){const methods=[];const q={};for(const method of ['select','eq','or','order','range','limit','update','upsert','insert','delete','not','lt','gte','is'])q[method]=(...args)=>{methods.push([method,...args]);return q;};q.single=q.maybeSingle=()=>{calls.push({table,methods});return Promise.resolve(response);};q.then=(yes,no)=>{calls.push({table,methods});return Promise.resolve(response).then(yes,no);};return q;}
 w.__sb={from:query,auth:{getUser:async()=>({data:{user:{id:'user-a'}}}),signOut:async()=>({error:null}),resetPasswordForEmail:async(...args)=>{calls.push({reset:args});return {error:null};},updateUser:async(...args)=>{calls.push({password:args});return {data:{user:{id:'user-a'}},error:null};}}};
 run("sb=__sb;authUid='user-a';profil={rol:'bayi',bayi_sahibi:'central',marka_erisimi:['bosch','siemens'],abonelik_durumu:'aktif',magaza:'Test mağaza'};brand='bosch';fqDataReady=true;fqFlow.ready=true;$('banka').innerHTML='<option value=\"\">Peşin</option>';$('taksit').innerHTML='<option value=\"\">—</option>';quoteRows=Array.from({length:5},bosSatir);");
 t.after(()=>w.close());
 return {run,w,calls,respond:r=>{response=r;},seed:()=>run("quoteRows=[{...bosSatir(),kod:'TEST123',ad:'Test ürün',adet:1,toptan:10000,bip:0,etiket:14000,netStok:8}];$('mAd').value='Birinci müşteri';$('mTel').value='5551112233';$('satisPersonel').value='Satıcı';renderRows();")};
}
module.exports={harness};
