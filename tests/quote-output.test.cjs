const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

function outputHarness(t){
 const h=harness(t),popups=[],alerts=[];h.seed();h.respond({data:{id:'saved'},error:null});
 h.w.alert=message=>alerts.push(message);
 h.w.open=()=>{const popup={closed:false,opener:{},location:{href:''},html:'',document:{body:{textContent:''},close(){}},close(){this.closed=true;}};popup.document.write=html=>{popup.html=html;};popups.push(popup);return popup;};
 return {...h,popups,alerts};
}
function writtenRecord(h){
 const call=[...h.calls].reverse().find(c=>c.table==='teklifler'&&c.methods.some(m=>m[0]==='upsert'||m[0]==='update'));
 return call&&call.methods.find(m=>m[0]==='upsert'||m[0]==='update')[1];
}
function pauseWrite(h){
 const previous=h.w.__sb.from,records=[];let release,started;
 const ready=new Promise(resolve=>{started=resolve;});
 h.w.__sb.from=table=>{
  if(table!=='teklifler')return previous(table);
  const q={};for(const method of ['upsert','update'])q[method]=record=>{records.push(JSON.parse(JSON.stringify(record)));return q;};
  q.eq=q.select=()=>q;q.single=()=>new Promise(resolve=>{release=resolve;started();});return q;
 };
 return {ready,records,release:()=>release({data:{id:'saved'},error:null}),restore:()=>{h.w.__sb.from=previous;}};
}

test('saved and historical quotes retain the chosen validity snapshot even after the active date changes',async t=>{
 const h=outputHarness(t);h.run("$('fqValidUntil').value='2020-01-01'");assert.equal(await h.run('saveQuote()'),true);
 const record=writtenRecord(h);assert.equal(record.satirlar.gecerlilik.valid_until,'2020-01-01');assert.equal(record.satirlar.workflow_inputs.validity_requested,'2020-01-01');
 h.w.__saved=record;h.run("$('fqValidUntil').value='2027-06-30'");
 const html=h.run('teklifDetayHTML(__saved)');assert.match(html,/01\.01\.2020/);assert.match(html,/süresi doldu/);assert.doesNotMatch(html,/30\.06\.2027/);
});

test('past validity and a below-cost price remain printable and shareable with the exact saved validity',async t=>{
 const h=outputHarness(t);h.run("$('fqValidUntil').value='2020-01-01';manuelToplamPesin=9000;$('mtPesin').value='9000';renderRows()");
 await h.run("printDoc('teklif')");const printed=h.popups[0],record=writtenRecord(h);
 assert.equal(printed.closed,false);assert.match(printed.html,/01\.01\.2020/);assert.match(printed.html,/süresi doldu/);assert.match(printed.html,/9\.000 ₺/);assert.equal(record.toplam,9000);
 h.w.__validity=record.satirlar.gecerlilik;assert.ok(printed.html.includes(h.run('fqValidityText(__validity)')));
 await h.run('shareWhatsApp()');const shared=h.popups[1],message=new URL(shared.location.href).searchParams.get('text');
 assert.equal(shared.closed,false);assert.ok(message.includes(h.run('fqValidityText(__validity)')));assert.match(message,/9\.000 ₺/);assert.equal(h.alerts.length,0);
});

test('editing the date during a pending WhatsApp save closes the empty popup and preserves edits for retry',async t=>{
 const h=outputHarness(t);h.run("$('fqValidUntil').value='2027-01-01'");const paused=pauseWrite(h),pending=h.run('shareWhatsApp()');await paused.ready;
 h.run("$('fqValidUntil').value='2027-02-01'");paused.release();await pending;
 assert.equal(paused.records[0].satirlar.gecerlilik.valid_until,'2027-01-01');assert.equal(h.popups[0].closed,true);assert.equal(h.popups[0].location.href,'');
 assert.match(h.alerts[0],/önceki hali kaydedildi.*tekrar dene/);assert.equal(h.run('fqDraftReadAll()[0].validity_requested'),'2027-02-01');
 paused.restore();await h.run('shareWhatsApp()');assert.equal(h.popups[1].closed,false);assert.match(new URL(h.popups[1].location.href).searchParams.get('text'),/01\.02\.2027/);
 assert.equal(writtenRecord(h).satirlar.gecerlilik.valid_until,'2027-02-01');
});

test('editing price during a pending print save produces no mixed-version document',async t=>{
 const h=outputHarness(t),paused=pauseWrite(h),pending=h.run("printDoc('teklif')");await paused.ready;
 h.run("manuelToplamPesin=9000;$('mtPesin').value='9000';renderRows()");paused.release();await pending;
 assert.equal(paused.records[0].toplam,10400);assert.equal(h.popups[0].closed,true);assert.equal(h.popups[0].html,'');assert.match(h.alerts[0],/tekrar dene/);
 assert.equal(h.run('lastTot.finalNakit'),9000);
});

test('editing while identity is checked retries printing even if the new values were saved',async t=>{
 const h=outputHarness(t);let release,started;const ready=new Promise(resolve=>{started=resolve;});
 h.w.__sb.auth.getUser=()=>new Promise(resolve=>{release=resolve;started();});
 h.run("$('fqValidUntil').value='2027-01-01'");const pending=h.run("printDoc('teklif')");await ready;
 h.run("$('fqValidUntil').value='2027-02-01'");release({data:{user:{id:'user-a'}},error:null});await pending;
 assert.equal(writtenRecord(h).satirlar.gecerlilik.valid_until,'2027-02-01');assert.equal(h.popups[0].closed,true);assert.equal(h.popups[0].html,'');assert.match(h.alerts[0],/hazırlanırken bilgiler değişti/);
});

test('catalog repricing without an input change cannot alter an output while its snapshot is saving',async t=>{
 const h=outputHarness(t),fingerprint=h.run('fqFingerprint(fqCapture())'),paused=pauseWrite(h),pending=h.run("printDoc('teklif')");await paused.ready;
 h.run('quoteRows[0].toptan=15000;renderRows()');assert.equal(h.run('fqFingerprint(fqCapture())'),fingerprint);
 paused.release();await pending;assert.equal(paused.records[0].toplam,10400);assert.equal(h.run('lastTot.finalNakit'),15600);assert.equal(h.popups[0].html,'');assert.equal(h.popups[0].closed,true);assert.match(h.alerts[0],/bilgi veya fiyat değişti/);
});
