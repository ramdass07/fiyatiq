const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const V=require('../js/teklif-gecerlilik.js');
const {harness}=require('./harness.cjs');
function validity(t){const h=harness(t);if(!h.w.FiyatIQValidity)h.run(fs.readFileSync(path.join(__dirname,'../js/teklif-gecerlilik.js'),'utf8'));return h;}
const row=(overrides={})=>({kod:'WAS123',ad:'Çamaşır',adet:1,kampFiyat:18000,...overrides});
const quick={WAS123:{fiyat:18000,nakit:17000,bitis:'2026-09-15'}};

test('validity uses the Istanbul calendar across UTC midnight and validates calendar dates',()=>{
 assert.equal(V.today(new Date('2026-09-10T21:01:00Z')),'2026-09-11');
 assert.equal(V.today(new Date('2026-12-31T21:01:00Z')),'2027-01-01');
 assert.equal(V.date('2028-02-29'),'2028-02-29');
 for(const bad of ['2026-02-29','2026-09-31','0000-01-01','2026-9-10','2026-09-10T23:59:00','<script>x</script>',null,42])assert.equal(V.date(bad),null);
});

test('effective validity respects the earliest used campaign and does not invent a month-end limit',()=>{
 const campaigns=[{id:'used',ad:'İkili destek',bitis_tarihi:'2026-09-13'},{id:'unused',ad:'Alakasız',bitis_tarihi:'2026-09-11'}];
 const state=V.snapshot('2026-09-30',V.sources([row()],quick,campaigns,['used']));
 assert.equal(state.valid_until,'2026-09-13');assert.equal(state.requested_until,'2026-09-30');assert.equal(state.limits.length,2);
 assert.equal(V.snapshot('2026-10-20',[]).valid_until,'2026-10-20');
 assert.equal(V.snapshot('2026-09-10',state.limits).valid_until,'2026-09-10');
});

test('only the applied model or pair price sets a campaign deadline and manual cash overrides both',()=>{
 const pairRow=row({ikiliAdet:1,ikiliTaksit:16000,ikiliBilgi:{id:'pair',bitis:'2026-09-18'}});
 assert.deepEqual(V.sources([pairRow],quick).map(x=>[x.type,x.until]),[['pair','2026-09-18']]);
 assert.deepEqual(V.sources([row({kampFiyat:null})],quick),[]);
 assert.deepEqual(V.sources([{...pairRow,isET:true,manuelFiyat:15000}],quick),[]);
 assert.deepEqual(V.sources([{...pairRow,isET:true,manuelTaksit:20000}],quick),[]);
});

test('unpaired quantities retain the earlier model deadline and repeated pairs are deduplicated',()=>{
 const paired=row({adet:2,ikiliAdet:1,ikiliTaksit:16000,ikiliBilgi:{id:'pair',bitis:'2026-09-18'}});
 const source=V.sources([paired,{...paired,kod:'WQ123',adet:1,kampFiyat:null}],quick);
 assert.deepEqual(source.map(x=>x.type),['pair','quick']);
 assert.equal(V.snapshot('2026-09-30',source).valid_until,'2026-09-15');
});

test('selected cash follows pair then model precedence including a manual installment amount',()=>{
 const paired=row({nakitSecili:true,isET:true,manuelTaksit:19000,ikiliAdet:1,ikiliTaksit:18000,ikiliBilgi:{id:'pair',bitis:'2026-09-18'}});
 assert.deepEqual(V.sources([paired],quick).map(x=>x.type),['quick']);
 assert.deepEqual(V.sources([{...paired,ikiliNakit:15000}],quick).map(x=>x.type),['pair']);
});

test('saved validity keeps its historical date while an old snapshot is explicitly unknown',t=>{
 const h=validity(t),saved=V.snapshot('2026-09-20',[{type:'bundle',label:'Kampanya',until:'2026-09-15'}]);
 h.w.__historical=saved;h.seed();h.run("$('fqValidUntil').value='2027-01-01'");
 assert.match(h.run('fqValidityText(__historical)'),/15\.09\.2026/);
 assert.match(h.run('fqValidityHTML(undefined)'),/kaydedilmemiş/);
 assert.doesNotMatch(h.run('fqValidityHTML(undefined)'),/01\.01\.2027/);
 assert.match(V.text(saved,'2026-09-16'),/süresi doldu/);
 assert.doesNotMatch(V.text(saved,'2026-09-15'),/süresi doldu/);
});

test('a past date produces an accessible warning but never blocks quote saving',async t=>{
 const h=validity(t);h.seed();h.respond({data:{id:'saved'},error:null});
 h.run("$('fqValidUntil').value='2020-01-01';fqValidityRefresh()");
 const input=h.w.document.getElementById('fqValidUntil'),status=h.w.document.getElementById('fqValidityStatus');
 assert.equal(status.getAttribute('role'),'status');assert.match(status.textContent,/süresi doldu/);assert.equal(input.checkValidity(),true);
 assert.equal(input.min,'');assert.equal(input.max,'');assert.equal(input.disabled,false);
 assert.equal(await h.run('saveQuote()'),true);
});

test('draft restoration retains its date or empty choice while a copy starts with today',t=>{
 const h=validity(t);h.seed();h.run("fqValidityRestore({validity_requested:'2020-01-01'})");
 assert.equal(h.run('fqValidityValue()'),'2020-01-01');assert.match(h.w.document.getElementById('fqValidityStatus').textContent,/süresi doldu/);
 h.run("fqValidityRestore({validity_requested:'2020-01-01'},{copy:true})");assert.equal(h.run('fqValidityValue()'),V.today());
 h.run('fqValidityRestore({validity_requested:null})');assert.equal(h.run('fqValidityValue()'),null);
 h.run('fqValidityRestore({})');assert.equal(h.run('fqValidityValue()'),V.today());
 h.run("$('fqValidUntil').value='2027-01-01';fqValidityReset()");assert.equal(h.run('fqValidityValue()'),V.today());
});

test('unknown campaign dates remain conditional and malformed dates cannot inject HTML',()=>{
 const state=V.snapshot('2026-09-20',[{type:'quick',label:'<img src=x onerror=alert(1)>',until:null}]);
 assert.equal(state.unknown_campaign_end,true);assert.match(V.text(state,'2026-09-10'),/kampanya teyidine bağlıdır/);
 const html=V.html({...state,valid_until:'<img src=x onerror=alert(1)>'},'2026-09-10');
 assert.doesNotMatch(html,/<img|onerror|<script/);assert.match(html,/belirtilmedi/);
});

test('active snapshot uses the pricing engine allocation rather than every selected campaign',t=>{
 const h=validity(t);h.seed();h.run(`
 quoteRows=[{...bosSatir(),kod:'WAS123',ad:'Çamaşır',adet:1,toptan:10000},{...bosSatir(),kod:'WQ123',ad:'Kurutma',adet:1,toptan:10000}];
 aktifKampanyalar=[{id:'used',ad:'İkili',match_type:'all',kategoriler:['CAMASIR','KURUTMA'],hakedis:1000,musteri_indirimi:1000,bitis_tarihi:'2999-09-15'},{id:'unmatched',ad:'Buzdolabı',match_type:'model_list',secili_modeller:['KG123'],hakedis:2000,bitis_tarihi:'2999-09-11'}];
 secilenKampanya=new Set(['used','unmatched']);$('fqValidUntil').value='2999-09-30';renderRows();`);
 const snapshot=JSON.parse(h.run('JSON.stringify(fqValiditySnapshot())'));
 assert.equal(snapshot.valid_until,'2999-09-15');assert.deepEqual(snapshot.limits.map(x=>x.label),['İkili']);
});

test('changing the validity date saves a revised draft and a new offer resets only the new date',t=>{
 const h=validity(t);h.seed();h.run("$('fqValidUntil').value='2027-01-15';fqFlow.baseline=fqFingerprint(fqCapture());$('fqValidUntil').value='2027-01-20';fqDraftFlush();");
 assert.equal(h.run('fqDraftReadAll()[0].validity_requested'),'2027-01-20');
 h.run('fqClearWorkspace()');assert.equal(h.run('fqCapture().validity_requested'),V.today());
 assert.equal(h.run('fqDraftReadAll()[0].validity_requested'),'2027-01-20');
});

function stubRestore(h){h.run("fqReloadData=async()=>{};loadTaksit=async()=>{};setKomis=async()=>{};refetch=async r=>{Object.assign(r,{ad:'Fresh product',toptan:20000,bip:0,netStok:3,veriHata:null});}");}
test('the draft action restores the chosen past date alongside newly fetched prices',async t=>{
 const h=validity(t);h.seed();h.run("$('fqValidUntil').value='2020-01-01';fqDraftFlush();const oldDraftId=fqFlow.draftId;");stubRestore(h);
 await h.run('fqRestoreDraft(oldDraftId)');
 assert.equal(h.run('fqValidityValue()'),'2020-01-01');assert.equal(h.run('lastTot.finalNakit'),20800);
 assert.match(h.w.document.getElementById('fqValidityStatus').textContent,/süresi doldu/);
 assert.equal(h.run('fqFlow.review'),true);
});

test('the saved-quote copy action starts with today and preserves the old record snapshot',async t=>{
 const h=validity(t);h.seed();h.run("$('fqValidUntil').value='2020-01-01'");
 const oldInputs=JSON.parse(h.run('JSON.stringify(fqCapture())'));
 const record={id:'original',bayi_id:'user-a',marka:'bosch',musteri_ad:'Önceki müşteri',musteri_tel:'5551112233',toplam:10400,satirlar:{workflow_inputs:oldInputs,gecerlilik:V.snapshot('2020-01-01')}};
 const before=JSON.stringify(record);h.respond({data:record,error:null});stubRestore(h);h.run("$('fqMyQuotes').showModal()");
 await h.run("fqCopyQuote('original')");
 assert.equal(h.run('fqValidityValue()'),V.today());assert.equal(h.run('savedTeklifId'),null);assert.equal(JSON.stringify(record),before);
 assert.equal(h.run('lastTot.finalNakit'),20800);
});

test('session reset saves the outgoing date and does not carry it into another account',t=>{
 const h=validity(t);h.seed();h.run("$('fqValidUntil').value='2027-02-01';fqResetSession()");
 assert.equal(h.run('fqValidityValue()'),V.today());assert.equal(h.run('authUid'),null);
 const drafts=Object.keys(h.w.localStorage).filter(k=>k.startsWith('fq_draft_v115:user-a:'));
 assert.equal(drafts.length,1);assert.equal(JSON.parse(h.w.localStorage.getItem(drafts[0])).validity_requested,'2027-02-01');
});

test('customer presentation includes only the public validity text and remains available after expiry',t=>{
 const h=validity(t);h.run(fs.readFileSync(path.join(__dirname,'../js/musteri-gorunumu.js'),'utf8'));h.seed();
 h.run("$('fqValidUntil').value='2020-01-01'");assert.equal(h.run('fqShowCustomerView()'),true);
 const content=h.w.document.getElementById('fqCustomerView').textContent;
 assert.match(content,/01\.01\.2020/);assert.match(content,/süresi doldu/);assert.doesNotMatch(content,/maliyet|kâr|hakediş|Birinci müşteri/i);
 const publicSnapshot=JSON.parse(h.run('JSON.stringify(fqCustomerViewSnapshot())'));
 assert.equal(typeof publicSnapshot.validityText,'string');assert.equal(Object.hasOwn(publicSnapshot,'limits'),false);
});
