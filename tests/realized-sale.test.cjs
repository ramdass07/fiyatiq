const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
const fields=['gercek_satis_tutari','satis_odeme_sekli','satis_banka','satis_taksit_sayisi','satis_tarihi'];
const empty=Object.fromEntries(fields.map(field=>[field,null]));
const record=(extra={})=>({id:'sale-1',bayi_id:'user-a',teklif_no:'FQ-SALE',musteri_ad:'Satış müşterisi',durum:'teklif',takip_notu:'',takip_sorumlusu:'',kayip_nedeni:'',sonraki_arama:null,takip_surumu:3,toplam:30000,satis_tutari:99999,satirlar:{hesap:{finalNakit:30000,finalTaksit:33000},banka:'Kayıtlı banka',taksit:6},...empty,...extra});
const actual={gercek_satis_tutari:32500.25,satis_odeme_sekli:'kart',satis_banka:'Örnek Banka',satis_taksit_sayisi:6,satis_tarihi:'2026-09-10'};
async function opened(t,extra={}){const h=harness(t);h.respond({data:record(extra),error:null});await h.run("fqOpenFollowup('sale-1')");return h;}
const payload=h=>JSON.parse(h.run('JSON.stringify(fqFollowPayload())'));
const salePart=entry=>Object.fromEntries(fields.map(field=>[field,entry[field]]));
function fill(h){h.run("$('fqFollowStatus').value='satildi';fqFollowStatusChanged();$('fqSaleAmount').value='32.500,25';$('fqSalePayment').value='kart';$('fqSaleBank').value=' Örnek Banka ';$('fqSaleInstallments').value='6';$('fqSaleDate').value='2026-09-10'");}

test('marking sold does not invent a realized amount from cash or legacy satis_tutari',async t=>{
 const h=await opened(t);h.run("$('fqFollowStatus').value='satildi';fqFollowStatusChanged()");assert.equal(h.run("$('fqSalePanel').hidden"),false);assert.equal(h.run("$('fqSaleAmount').value"),'');assert.deepEqual(salePart(payload(h)),empty);
 h.respond({data:record({durum:'satildi',takip_surumu:4}),error:null});await h.run('fqSaveFollowup()');const update=h.calls[1].methods.find(x=>x[0]==='update')[1];assert.equal(update.durum,'satildi');assert.deepEqual(salePart(update),empty);assert.equal(h.run('fqFollowupDirty()'),false);
});
test('realized amount is separately saved with owner and concurrency guards while quote prices stay untouched',async t=>{
 const h=await opened(t);fill(h);h.respond({data:record({...actual,durum:'satildi',takip_surumu:4}),error:null});await h.run('fqSaveFollowup()');const q=h.calls[1],update=q.methods.find(x=>x[0]==='update')[1];assert.deepEqual(salePart(update),actual);
 for(const key of ['toplam','satirlar','satis_tutari','marka','bayi_id'])assert.equal(Object.hasOwn(update,key),false,key);
 assert.ok(q.methods.some(x=>x[0]==='eq'&&x[1]==='takip_surumu'&&x[2]===3));assert.ok(q.methods.some(x=>x[0]==='eq'&&x[1]==='bayi_id'&&x[2]==='user-a'));assert.equal(h.run('fqFollowupDirty()'),false);
 const selected=h.calls[0].methods.find(x=>x[0]==='select')[1];for(const field of [...fields,'toplam','satirlar'])assert.ok(selected.split(',').includes(field));
});
test('saved cash and installment suggestions require an explicit click and only set the agreed amount',async t=>{
 const h=await opened(t);h.run("$('fqFollowStatus').value='satildi';fqFollowStatusChanged()");assert.equal(h.run("$('fqSaleAmount').value"),'');assert.equal(h.run("$('fqSaleCashSuggestion').hidden"),false);assert.equal(h.run("$('fqSaleInstallmentSuggestion').hidden"),false);
 h.run("fqUseSaleSuggestion('cash')");assert.equal(h.run("$('fqSaleAmount').value"),'30000,00');h.run("fqUseSaleSuggestion('installment')");assert.equal(h.run("$('fqSaleAmount').value"),'33000,00');assert.equal(h.run("$('fqSalePayment').value"),'');assert.equal(h.run("$('fqSaleDate').value"),'');assert.equal(h.run("$('fqSaleBank').value"),'');
 h.run("fqFillFollowup({id:'old',durum:'satildi',satis_tutari:12345,toplam:null,satirlar:[]});fqUseSaleSuggestion('cash')");assert.equal(h.run("$('fqSaleAmount').value"),'');assert.equal(h.run("$('fqSaleCashSuggestion').hidden"),true);assert.equal(h.run("$('fqSaleInstallmentSuggestion').hidden"),true);
 h.run("fqFillFollowup({id:'old',durum:'satildi',toplam:15000,satirlar:{hesap:{finalTaksit:17000}}})");assert.equal(h.run("$('fqSaleCashSuggestion').hidden"),false);assert.equal(h.run("$('fqSaleInstallmentSuggestion').hidden"),true);
});
test('existing actual values including zero prefill exactly and create the clean baseline',async t=>{
 const h=await opened(t,{...actual,gercek_satis_tutari:0,durum:'satildi'});assert.equal(h.run("$('fqSaleAmount').value"),'0');assert.equal(h.run("$('fqSalePayment').value"),'kart');assert.equal(h.run("$('fqSaleBank').value"),'Örnek Banka');assert.equal(h.run("$('fqSaleInstallments').value"),'6');assert.equal(h.run("$('fqSaleDate').value"),'2026-09-10');assert.equal(h.run('fqFollowupDirty()'),false);assert.deepEqual(salePart(payload(h)),{...actual,gercek_satis_tutari:0});
});
test('amount suggestions match the rounded saved customer offer instead of raw calculation precision',async t=>{
 const h=await opened(t,{durum:'satildi',toplam:10400,satirlar:{hesap:{finalNakit:10400.45,finalTaksit:11300.65},taksit:6}});
 h.run("fqUseSaleSuggestion('cash')");assert.equal(h.run("$('fqSaleAmount').value"),'10400,00');h.run("fqUseSaleSuggestion('installment')");assert.equal(h.run("$('fqSaleAmount').value"),'11301,00');
 h.run("fqFillFollowup({id:'older',durum:'satildi',toplam:null,satirlar:{hesap:{finalNakit:10400.65},taksit:0}});fqUseSaleSuggestion('cash')");assert.equal(h.run("$('fqSaleAmount').value"),'10401,00');
});
test('partial actual details are explained without posting and clearing all details still permits Satıldı',async t=>{
 const h=await opened(t);h.run("$('fqFollowStatus').value='satildi';fqFollowStatusChanged();$('fqSaleAmount').value='32500'");await h.run('fqSaveFollowup()');assert.equal(h.calls.length,1);assert.match(h.run("$('fqFollowMessage').textContent"),/tutar, ödeme şekli ve satış tarihini/);assert.equal(h.run("$('fqSaleAmount').value"),'32500');
 h.run("$('fqSaleAmount').value='';$('fqSaleBank').value='Örnek'");assert.throws(()=>payload(h),/birlikte doldur/);h.run("$('fqSaleBank').value=''");assert.deepEqual(salePart(payload(h)),empty);
});
test('actual amount and dates validate precisely, allow zero and do not compare margin, stock or offer validity',async t=>{
 const h=await opened(t);fill(h);h.run("quoteRows=[];$('fqSaleAmount').value='0,00'");assert.equal(payload(h).gercek_satis_tutari,0);
 for(const [raw,expected] of [['32.500,25',32500.25],['32500.25',32500.25],['1.234',1234],['999999999999.99',999999999999.99]])assert.equal(h.run(`fqSaleMoney(${JSON.stringify(raw)})`),expected);
 for(const raw of ['-1','0.001','1,234','NaN','Infinity','1e4','1 200','1000000000000',''])assert.throws(()=>h.run(`fqSaleMoney(${JSON.stringify(raw)})`),raw);
 for(const raw of ['2026-02-30','2026-13-01','0000-01-01',''])assert.throws(()=>h.run(`fqSaleDate(${JSON.stringify(raw)})`),raw);assert.equal(h.run("fqSaleDate('2028-02-29')"),'2028-02-29');
});
test('payment, bank and installment validation accepts bounded optional fields',async t=>{
 const h=await opened(t);fill(h);for(const method of ['nakit','havale','kart','karma','diger']){h.run(`$('fqSalePayment').value=${JSON.stringify(method)}`);assert.equal(payload(h).satis_odeme_sekli,method);}
 h.run("$('fqSaleBank').value='';$('fqSaleInstallments').value=''");assert.equal(payload(h).satis_banka,null);assert.equal(payload(h).satis_taksit_sayisi,null);
 h.run("$('fqSaleBank').value='x'.repeat(121)");assert.throws(()=>payload(h),/120/);h.run("$('fqSaleBank').value=''");for(const number of ['0','61','1.5','-1']){h.run(`$('fqSaleInstallments').value=${JSON.stringify(number)}`);assert.throws(()=>payload(h),/1 ile 60/);}
});
test('leaving Satıldı warns and only clears actual details after successful save; cancel and conflict preserve them',async t=>{
 const h=await opened(t,{...actual,durum:'satildi'});h.run("$('fqFollowStatus').value='teklif';fqFollowStatusChanged()");assert.equal(h.run("$('fqSaleClearingWarning').hidden"),false);assert.equal(h.run("$('fqSalePanel').hidden"),true);assert.equal(h.run("$('fqSaleAmount').value"),'32500.25');assert.deepEqual(salePart(payload(h)),empty);
 let prompts=0;h.w.confirm=()=>{prompts++;return false;};await h.run('fqSaveFollowup()');assert.equal(prompts,1);assert.equal(h.calls.length,1);assert.equal(h.run("$('fqSaleAmount').value"),'32500.25');
 h.w.confirm=()=>true;h.respond({data:null,error:{code:'PGRST116'}});await h.run('fqSaveFollowup()');assert.equal(h.run("$('fqSaleAmount').value"),'32500.25');assert.equal(h.run('fqFollowup.record.gercek_satis_tutari'),32500.25);assert.equal(h.run('fqFollowupDirty()'),true);
 h.respond({data:record({durum:'teklif',takip_surumu:4}),error:null});await h.run('fqSaveFollowup()');assert.equal(h.run("$('fqSaleAmount').value"),'');assert.equal(h.run("$('fqSaleClearingWarning').hidden"),true);assert.equal(h.run('fqFollowupDirty()'),false);
});
test('server error preserves actual edits; saving locks the entire block and suppresses suggestion changes',async t=>{
 const h=await opened(t);fill(h);let release;h.w.__sb.auth.getUser=()=>new Promise(resolve=>{release=resolve;});const saving=h.run('fqSaveFollowup()');assert.equal(h.run("$('fqFollowForm').disabled"),true);h.run("fqUseSaleSuggestion('cash')");assert.equal(h.run("$('fqSaleAmount').value"),'32.500,25');
 h.respond({data:null,error:{code:'42501',message:'denied'}});release({data:{user:{id:'user-a'}},error:null});await saving;assert.equal(h.run("$('fqSaleAmount').value"),'32.500,25');assert.equal(h.run("$('fqSalePayment').value"),'kart');assert.equal(h.run('fqFollowupDirty()'),true);assert.equal(h.run("$('fqFollowForm').disabled"),false);assert.match(h.run("$('fqFollowMessage').textContent"),/Yazdıkların bu pencerede duruyor/);
});
test('actual-sale edits participate in cancel protection and are removed on session cleanup',async t=>{
 const h=await opened(t,{...actual,durum:'satildi'});h.run("$('fqSaleAmount').value='31000'");assert.equal(h.run('fqFollowupDirty()'),true);h.w.confirm=()=>false;h.run('fqCloseFollowup()');assert.equal(h.run("$('fqFollowupDialog').open"),true);assert.equal(h.run("$('fqSaleAmount').value"),'31000');
 h.run('fqResetSession()');assert.equal(h.run('FQ_SALE_INPUTS.every(id=>!$(id).value)'),true);assert.equal(h.run('fqFollowup.record'),null);assert.equal(h.run("$('fqSaleCashSuggestion').hidden"),true);assert.equal(h.run("$('fqFollowupDialog').open"),false);
});
