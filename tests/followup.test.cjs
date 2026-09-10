const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
const record=(extra={})=>({id:'follow-1',bayi_id:'user-a',teklif_no:'FQ-123',musteri_ad:'Test müşteri',musteri_tel:'5551112233',durum:'teklif',takip_notu:'Önceki görüşme',sonraki_arama:'2026-09-10T21:15:00.000Z',takip_sorumlusu:'Satıcı',kayip_nedeni:'',takip_surumu:7,takip_guncellendi_at:'2026-09-10T09:00:00.000Z',...extra});
async function opened(t,extra={}){const h=harness(t);h.respond({data:record(extra),error:null});await h.run("fqOpenFollowup('follow-1')");return h;}
const has=(query,...method)=>query.methods.some(entry=>JSON.stringify(entry)===JSON.stringify(method));

test('follow-up reads and updates only the branch owner, with version check and no price payload',async t=>{
 const h=await opened(t);assert.ok(has(h.calls[0],'eq','id','follow-1'));assert.ok(has(h.calls[0],'eq','bayi_id','user-a'));
 h.run("$('fqFollowNote').value=' Yeni görüşme ';$('fqFollowAssignee').value=' Yeni satıcı ';$('fqFollowDate').value='2026-09-11T14:30'");
 h.respond({data:record({takip_notu:'Yeni görüşme',takip_sorumlusu:'Yeni satıcı',takip_surumu:8,sonraki_arama:'2026-09-11T11:30:00.000Z'}),error:null});await h.run('fqSaveFollowup()');
 const q=h.calls[1],payload=q.methods.find(x=>x[0]==='update')[1];assert.ok(has(q,'eq','id','follow-1'));assert.ok(has(q,'eq','bayi_id','user-a'));assert.ok(has(q,'eq','takip_surumu',7));
 assert.deepEqual(Object.keys(payload).sort(),['durum','kayip_nedeni','sonraki_arama','takip_notu','takip_sorumlusu']);assert.equal(payload.takip_notu,'Yeni görüşme');assert.equal(payload.sonraki_arama,'2026-09-11T11:30:00.000Z');assert.equal(h.run('fqFollowup.record.takip_surumu'),8);assert.equal(h.run('fqFollowupDirty()'),false);assert.match(h.run("$('fqFollowMessage').textContent"),/Takip kaydedildi/);
});
test('optimistic conflict preserves the typed note and never reports success',async t=>{
 const h=await opened(t);h.run("$('fqFollowNote').value='Kaybolmaması gereken yeni not'");h.respond({data:null,error:{code:'PGRST116',message:'0 rows'}});await h.run('fqSaveFollowup()');
 assert.equal(h.run("$('fqFollowNote').value"),'Kaybolmaması gereken yeni not');assert.equal(h.run('fqFollowup.record.takip_surumu'),7);assert.equal(h.run('fqFollowupDirty()'),true);assert.equal(h.run("$('fqFollowForm').disabled"),false);assert.match(h.run("$('fqFollowMessage').textContent"),/başka bir ekranda değişti/);assert.doesNotMatch(h.run("$('fqFollowMessage').textContent"),/✓/);
});
test('lost offers require a reason, and completed outcomes remove callback plans',async t=>{
 const h=await opened(t);h.run("$('fqFollowStatus').value='kaybedildi';fqFollowStatusChanged()");await h.run('fqSaveFollowup()');assert.equal(h.calls.length,1);assert.match(h.run("$('fqFollowMessage').textContent"),/kayıp nedeni yaz/);assert.equal(h.run("$('fqFollowDate').disabled"),true);
 h.run("$('fqFollowLoss').value=' Başka mağazadan aldı '");const lost=JSON.parse(h.run('JSON.stringify(fqFollowPayload())'));assert.equal(lost.sonraki_arama,null);assert.equal(lost.kayip_nedeni,'Başka mağazadan aldı');
 h.respond({data:record({...lost,takip_surumu:8}),error:null});await h.run('fqSaveFollowup()');assert.equal(h.calls.length,2);assert.equal(h.calls[1].methods.find(x=>x[0]==='update')[1].sonraki_arama,null);
 h.run("$('fqFollowStatus').value='satildi';fqFollowStatusChanged()");const sold=JSON.parse(h.run('JSON.stringify(fqFollowPayload())'));assert.equal(sold.sonraki_arama,null);assert.equal(sold.kayip_nedeni,'');assert.equal(h.run("$('fqFollowLossLabel').hidden"),true);
});
test('follow-up dates round trip in Istanbul across UTC midnight and reject impossible dates',t=>{
 const h=harness(t);assert.equal(h.run("fqTurkeyInput('2026-09-10T21:15:00.000Z')"),'2026-09-11T00:15');assert.equal(h.run("fqTurkeyDate('2026-09-11T00:15')"),'2026-09-10T21:15:00.000Z');
 assert.equal(h.run("fqTurkeyTomorrow(new Date('2026-09-10T20:59:00.000Z'))"),'2026-09-10T21:00:00.000Z');assert.equal(h.run("fqTurkeyTomorrow(new Date('2026-09-10T21:00:00.000Z'))"),'2026-09-11T21:00:00.000Z');assert.equal(h.run("fqTurkeyDate('')"),null);
 assert.throws(()=>h.run("fqTurkeyDate('2026-02-30T10:00')"));assert.throws(()=>h.run("fqTurkeyDate('2026-09-11T25:00')"));
});
test('due follow-ups filter on server by owner and Istanbul deadline with stable pagination',async t=>{
 const h=harness(t);h.respond({data:[],count:41,error:null});h.run("$('fqMyQuotes').showModal();$('fqMyFollow').value='due';$('fqMyStatus').value='';fqFlow.page=1");const deadline=h.run('fqTurkeyTomorrow()');await h.run('fqLoadMyQuotes()');
 const q=h.calls[0];assert.ok(has(q,'eq','bayi_id','user-a'));assert.ok(has(q,'eq','durum','teklif'));assert.ok(has(q,'not','sonraki_arama','is',null));assert.ok(has(q,'lt','sonraki_arama',deadline));assert.ok(has(q,'order','sonraki_arama',{ascending:true}));assert.ok(has(q,'order','id',{ascending:false}));assert.ok(has(q,'range',20,39));assert.equal(h.run("$('fqMyPrev').disabled"),false);assert.equal(h.run("$('fqMyNext').disabled"),false);
});
test('logout can retain an unsaved note on cancel and clears personal follow-up state when confirmed',async t=>{
 const h=await opened(t);h.run("$('fqFollowNote').value='Özel görüşme'");h.w.confirm=()=>false;await h.run('signOut()');assert.equal(h.run('authUid'),'user-a');assert.equal(h.run("$('fqFollowNote').value"),'Özel görüşme');assert.equal(h.run("$('fqFollowupDialog').open"),true);
 h.w.confirm=()=>true;await h.run('signOut()');assert.equal(h.run('authUid'),null);assert.equal(h.run('fqFollowup.record'),null);assert.equal(h.run("$('fqFollowupDialog').open"),false);assert.equal(h.run("$('fqFollowCustomer').textContent"),'');assert.equal(h.run("['fqFollowAssignee','fqFollowDate','fqFollowNote','fqFollowLoss'].every(id=>!$(id).value)"),true);
});
test('a delayed follow-up response cannot resurrect customer information after the dialog closes',async t=>{
 const h=harness(t);let release;h.respond(new Promise(resolve=>{release=resolve;}));const pending=h.run("fqOpenFollowup('follow-1')");h.run('fqCloseFollowup()');release({data:record(),error:null});await pending;
 assert.equal(h.run('fqFollowup.record'),null);assert.equal(h.run("$('fqFollowupDialog').open"),false);assert.equal(h.run("$('fqFollowCustomer').textContent"),'');assert.equal(h.run("$('fqFollowNote').value"),'');
});
test('duplicate follow-up save clicks issue one identity check and one update',async t=>{
 const h=await opened(t);let release,checks=0;h.w.__sb.auth.getUser=()=>{checks++;return new Promise(resolve=>{release=resolve;});};h.run("$('fqFollowNote').value='Tek kayıt'");h.respond({data:record({takip_notu:'Tek kayıt',takip_surumu:8}),error:null});
 const first=h.run('fqSaveFollowup()'),second=h.run('fqSaveFollowup()');assert.equal(h.run('fqFollowup.saving'),true);release({data:{user:{id:'user-a'}},error:null});await Promise.all([first,second]);assert.equal(checks,1);assert.equal(h.calls.filter(q=>q.methods.some(x=>x[0]==='update')).length,1);assert.equal(h.run('fqFollowup.saving'),false);
});
test('identity mismatch blocks updates while preserving the typed follow-up note',async t=>{
 const h=await opened(t);h.run("$('fqFollowNote').value='Korunan not'");h.w.__sb.auth.getUser=async()=>({data:{user:{id:'user-b'}},error:null});await h.run('fqSaveFollowup()');assert.equal(h.calls.length,1);assert.equal(h.run("$('fqFollowNote').value"),'Korunan not');assert.match(h.run("$('fqFollowMessage').textContent"),/Oturum doğrulanamadı/);
});
test('a pending save cannot restore private data after session cleanup and account change',async t=>{
 const h=await opened(t);let release;h.respond(new Promise(resolve=>{release=resolve;}));h.run("$('fqFollowNote').value='Eski hesabın notu'");const pending=h.run('fqSaveFollowup()');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.length,2);
 h.run("fqResetSession();authUid='user-b'");release({data:record({takip_notu:'Eski hesabın notu',takip_surumu:8}),error:null});await pending;
 assert.equal(h.run('authUid'),'user-b');assert.equal(h.run('fqFollowup.record'),null);assert.equal(h.run("$('fqFollowNote').value"),'');assert.equal(h.run("$('fqFollowMessage').textContent"),'');assert.equal(h.run("$('fqFollowupDialog').open"),false);assert.equal(h.run('fqFollowup.saving'),false);
});
