const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {harness}=require('./harness.cjs');
const validity={version:1,requested_until:'2020-01-02',valid_until:'2020-01-02',campaign_until:null,unknown_campaign_end:false};
function record(){return {id:'old-quote',bayi_id:'user-a',teklif_no:'ESKI-2020-19',created_at:'2020-01-01T23:15:00Z',musteri_ad:'Eski müşteri',musteri_tel:'0555 111 22 33',marka:'bosch',toplam:20000,takip_notu:'SECRET_NOTE',satirlar:{no:'ESKI-2020-19',magaza:'Eski mağaza',personel:'Eski satıcı',banka:'Eski Banka',taksit:6,gecerlilik:validity,items:[{model:'OLD1',ad:'Eski ürün',adet:2,nakit:30000,maliyet:987654},{model:'OLD2',ad:'Diğer ürün',adet:1,nakit:12000,maliyet:54321}],customer_fields:{mTC:'12345678901',mSevkAdres:'SECRET_ADDRESS'},net_items:[{model:'OLD1',ad:'Eski ürün',adet:2,net_nakit:19000,net_taksit:19950},{model:'OLD2',ad:'Diğer ürün',adet:1,net_nakit:1000,net_taksit:1050}],hesap:{finalNakit:20000.2,finalTaksit:21000.4,komis:0,karPct:-15,hakedis:88888,appliedNames:['SECRET_CAMPAIGN']}}};}
function outputs(t){
 const h=harness(t);if(h.run("typeof fqSavedQuoteSnapshot")!=='function')h.run(fs.readFileSync(path.join(__dirname,'../js/kayitli-teklif.js'),'utf8'));
 const popups=[],alerts=[];
 h.w.open=()=>{const dom=new JSDOM('<!doctype html><html><body></body></html>');t.after(()=>dom.window.close());const popup={document:dom.window.document,location:{href:''},opener:'source',closed:false,printed:0,focus(){},print(){this.printed++;},close(){this.closed=true;}};popups.push(popup);return popup;};
 h.w.alert=text=>alerts.push(text);h.w.__record=record();h.respond({data:h.w.__record,error:null});return {...h,popups,alerts,snapshot:()=>JSON.parse(h.run('JSON.stringify(fqSavedQuoteSnapshot(__record))'))};
}
function deferred(h){const pending=[];h.w.__query=()=>{const calls=[],q={};for(const name of ['select','eq'])q[name]=(...args)=>{calls.push([name,...args]);return q;};q.single=()=>new Promise(resolve=>pending.push({calls,resolve}));return q;};h.run('sb={from:__query}');return pending;}

test('saved print keeps original number, Turkey date, net totals and expired validity while live basket changes',async t=>{
 const h=outputs(t);h.seed();h.run("$('mAd').value='CURRENT_CUSTOMER';profil.magaza='CURRENT_STORE';quoteRows[0].nakit=999999;lastTot.finalNakit=999999;currentTeklifNo='CURRENT_NO';komisOran=99");
 const before=h.run('JSON.stringify({quoteRows,lastTot,currentTeklifNo,savedTeklifId})');assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),true);
 const popup=h.popups[0],text=popup.document.body.textContent;
 assert.match(text,/ESKI-2020-19/);assert.match(text,/2\.01\.2020 02:15/);assert.match(text,/19\.000 ₺/);assert.match(text,/20\.000 ₺/);assert.match(text,/21\.000 ₺/);assert.match(text,/02\.01\.2020, gün sonu/);assert.match(text,/süresi doldu/);assert.match(text,/Eski Banka · 6 taksit/);
 assert.doesNotMatch(text,/CURRENT_|999\.999|987654|SECRET_|12345678901|maliyet|kâr|komisyon|hakediş/i);assert.equal(popup.printed,1);assert.equal(popup.opener,null);
 assert.equal(h.run('JSON.stringify({quoteRows,lastTot,currentTeklifNo,savedTeklifId})'),before);assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].methods.map(x=>x[0]),['select','eq','eq']);
});
test('WhatsApp uses the same allowlisted snapshot and saved customer destination, without sending',async t=>{
 const h=outputs(t);h.seed();h.run("$('mTel').value='05550000000'");assert.equal(await h.run("fqShareSavedQuote('old-quote')"),true);
 const url=new URL(h.popups[0].location.href);assert.equal(url.origin,'https://api.whatsapp.com');assert.equal(url.searchParams.get('phone'),'905551112233');
 assert.equal(url.searchParams.get('text'),h.run('fqSavedQuoteMessage(fqSavedQuoteSnapshot(__record))'));assert.match(url.searchParams.get('text'),/Eski Banka · 6 taksit/);
 assert.doesNotMatch(url.searchParams.get('text'),/SECRET_|12345678901|987654|komisyon|hakediş|kâr/i);assert.equal(h.calls.length,1);
});
test('legacy records show known totals but no invented net allocations or current dates',async t=>{
 const h=outputs(t);delete h.w.__record.created_at;delete h.w.__record.satirlar.net_items;delete h.w.__record.satirlar.gecerlilik;
 assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),true);const text=h.popups[0].document.body.textContent;
 assert.match(text,/Teklif tarihi: Kaydedilmemiş/);assert.match(text,/OLD1/);assert.match(text,/20\.000 ₺/);assert.match(text,/ayrı ayrı kaydedilmemiş/);assert.match(text,/geçerlilik tarihi kaydedilmemiş/);assert.doesNotMatch(text,/30\.000|12\.000|987654/);
 const normalized=h.snapshot();assert.equal(normalized.rows[0].cash,null);assert.equal(normalized.rows[0].quantity,2);
});
test('legacy array records with no saved installment context remain usable as cash offers',async t=>{
 const h=outputs(t);h.w.__record.satirlar=[{kod:'LEGACY',ad:'Eski ürün',adet:1,nakit:30000}];assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),true);
 const text=h.popups[0].document.body.textContent;assert.match(text,/LEGACY/);assert.match(text,/20\.000 ₺/);assert.doesNotMatch(text,/Taksitli toplam|30\.000/);
});
test('cash-only saved snapshots do not invent installment offers from a redundant saved total',t=>{
 const h=outputs(t);h.w.__record.satirlar.taksit=0;h.w.__record.satirlar.banka='';h.w.__record.satirlar.hesap.finalTaksit=20000.2;
 const s=h.snapshot();assert.equal(s.installment,null);assert.doesNotMatch(h.run('fqSavedQuoteHTML(fqSavedQuoteSnapshot(__record))'),/Taksitli toplam/);
});
test('malformed prices, mismatched totals or number and missing modern row data never produce output',async t=>{
 const h=outputs(t);
 const mutations=[r=>r.satirlar.net_items[0].net_nakit=19500,r=>r.satirlar.net_items[0].net_taksit=1,r=>r.toplam=23000,r=>r.satirlar.no='DIFFERENT',r=>r.satirlar.net_items[0].adet=0,r=>r.satirlar.net_items[0].net_nakit=true,r=>delete r.satirlar.hesap.finalNakit,r=>r.satirlar.net_items=[],r=>r.satirlar.net_items[0].net_nakit=-1,r=>r.satirlar.hesap.finalTaksit=null];
 for(const change of mutations){const saved=record();change(saved);h.respond({data:saved,error:null});assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),false);assert.equal(h.popups.at(-1).closed,true);assert.equal(h.popups.at(-1).printed,0);}
 assert.equal(h.alerts.length,mutations.length);assert.ok(h.alerts.every(message=>message.includes('eksik veya tutarsız')));
});
test('HTML escapes every customer-controlled string and emits no internal source metadata',async t=>{
 const h=outputs(t);h.w.__record.musteri_ad='<img src=x onerror=alert(1)>';h.w.__record.satirlar.net_items[0].ad='<script>bad()</script>';h.w.__record.satirlar.banka='<svg onload=alert(1)>';
 assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),true);const document=h.popups[0].document;
 assert.equal(document.querySelector('img,script,svg'),null);assert.match(document.body.textContent,/<img src=x/);assert.match(document.body.textContent,/<script>bad/);
 assert.doesNotMatch(document.documentElement.outerHTML,/SECRET_|customer_fields|maliyet|karPct|hakedis|workflow_inputs|12345678901/);
});
test('owner filter is explicit for a seller while an editor may read another store through RLS',async t=>{
 const h=outputs(t);assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),true);assert.deepEqual(h.calls[0].methods.filter(x=>x[0]==='eq'),[['eq','id','old-quote'],['eq','bayi_id','user-a']]);
 h.run("profil.rol='admin'");h.w.__record.bayi_id='another-store';assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),true);assert.deepEqual(h.calls[1].methods.filter(x=>x[0]==='eq'),[['eq','id','old-quote']]);
});
test('incorrect record ownership or response ID and denied reads close blank windows',async t=>{
 const h=outputs(t);for(const response of [{data:{...record(),bayi_id:'another'},error:null},{data:{...record(),id:'wrong'},error:null},{data:null,error:{message:'SECRET_DATABASE_ERROR'}}]){h.respond(response);assert.equal(await h.run("fqShareSavedQuote('old-quote')"),false);assert.equal(h.popups.at(-1).closed,true);assert.equal(h.popups.at(-1).location.href,'');}
 assert.equal(h.alerts.length,3);assert.doesNotMatch(h.alerts.join(' '),/SECRET_DATABASE_ERROR/);
});
test('the popup opens before a slow read and logout invalidates the result and closes prior outputs',async t=>{
 const h=outputs(t);assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),true);const pending=deferred(h),promise=h.run("fqShareSavedQuote('old-quote')");
 assert.equal(h.popups.length,2);assert.match(h.popups[1].document.body.textContent,/hazırlanıyor/);h.run("fqResetSavedOutputs();authUid=null;fqEpoch++");pending[0].resolve({data:record(),error:null});
 assert.equal(await promise,false);assert.ok(h.popups.every(p=>p.closed));assert.equal(h.popups[1].location.href,'');assert.equal(h.alerts.length,0);
});
test('a newer output request cancels stale reads without showing or sharing the first customer',async t=>{
 const h=outputs(t),pending=deferred(h);const first=h.run("fqPrintSavedQuote('old-quote')"),second=h.run("fqShareSavedQuote('new-quote')");
 const next=record();next.id='new-quote';next.musteri_ad='Son müşteri';next.musteri_tel='05552223344';pending[1].resolve({data:next,error:null});assert.equal(await second,true);
 pending[0].resolve({data:record(),error:null});assert.equal(await first,false);assert.equal(h.popups[0].closed,true);assert.equal(h.popups[0].printed,0);assert.match(new URL(h.popups[1].location.href).searchParams.get('text'),/Son müşteri/);
});
test('switching account or losing editor permission during a read prevents the output',async t=>{
 const h=outputs(t);h.run("profil.rol='admin'");const pending=deferred(h),promise=h.run("fqPrintSavedQuote('old-quote')");h.run("profil.rol='bayi'");pending[0].resolve({data:record(),error:null});assert.equal(await promise,false);assert.equal(h.popups[0].closed,true);
 const next=h.run("fqPrintSavedQuote('old-quote')");h.run("authUid='user-b'");pending[1].resolve({data:record(),error:null});assert.equal(await next,false);assert.equal(h.popups[1].closed,true);
});
test('blocked popups do not fetch records and absence of a session does not open any popup',async t=>{
 const h=outputs(t);h.w.open=()=>null;assert.equal(await h.run("fqPrintSavedQuote('old-quote')"),false);assert.equal(h.calls.length,0);assert.match(h.alerts[0],/Açılır pencere/);h.run('authUid=null');assert.equal(await h.run("fqShareSavedQuote('old-quote')"),false);assert.equal(h.calls.length,0);
});
test('My Quotes renders saved-print and saved-WhatsApp actions alongside the current-price copy',async t=>{
 const h=outputs(t);h.respond({data:[record()],count:1,error:null});await h.run('fqOpenMyQuotes()');const list=h.w.document.getElementById('fqMyList');
 assert.match(list.textContent,/Kayıtlı teklifi yazdır/);assert.match(list.textContent,/Kayıtlı teklifi WhatsApp’ta aç/);assert.match(list.textContent,/Güncel fiyatla yeni kopya/);
});
