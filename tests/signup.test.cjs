const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
const fill="$('suAd').value='  Başvuran kişi  ';$('suMagaza').value='  Yeni mağaza  ';$('suEmail').value='applicant@example.invalid';$('suPass').value='fixture-only-123';$('suMarka').value='both';";
const admin="profil.rol='admin';window._bayiCache={applicant:{id:'applicant',ad:'Başvuran',magaza:'Mağaza',rol:'bayi',abonelik_durumu:'pasif',marka_erisimi:[],basvuru_markalari:['bosch'],bayi_sahibi:null}};fqOpenApproval('applicant');";
test('signup sends store and requested brands without authorization metadata',async t=>{
 const h=harness(t);h.run(fill);let payload;
 h.w.__sb.auth.signUp=async p=>(payload=p,{data:{session:null},error:null});
 await h.run('signUp()');
 assert.deepEqual(JSON.parse(JSON.stringify(payload.options.data)),{ad:'Başvuran kişi',magaza:'Yeni mağaza',basvuru_markalari:['siemens','bosch']});
 assert.equal(payload.options.emailRedirectTo,'https://fiyatiq.com/');assert.equal(h.w.document.getElementById('suPass').value,'');
 assert.match(h.w.document.getElementById('suMsg').textContent,/doğrulamak/);
});
test('incomplete or invalid applications never reach auth',async t=>{
 const h=harness(t);let calls=0;h.w.__sb.auth.signUp=async()=>{calls++;return {data:{},error:null};};
 for(const change of ["$('suMagaza').value=''","$('suEmail').value='invalid'","$('suPass').value='short'","$('suMarka').value=''"]){h.run(fill+change);await h.run('signUp()');assert.equal(h.w.document.getElementById('suMsg').className,'err');}
 assert.equal(calls,0);
});
test('signup double-click sends one request and shows direct pending result for an issued session',async t=>{
 const h=harness(t);h.run(fill);let resolve,calls=0;h.w.__sb.auth.signUp=()=>{calls++;return new Promise(r=>resolve=r);};
 const pending=h.run('signUp()');await h.run('signUp()');assert.equal(calls,1);assert.equal(h.w.document.getElementById('suSubmit').disabled,true);
 resolve({data:{session:{user:{id:'fixture'}}},error:null});await pending;
 assert.match(h.w.document.getElementById('suMsg').textContent,/yönetici onayından/);assert.equal(h.w.document.getElementById('suSubmit').disabled,false);
});
test('signup failure keeps entered information and gives a retryable Turkish message',async t=>{
 const h=harness(t);h.run(fill);h.w.__sb.auth.signUp=async()=>({error:{code:'over_email_send_rate_limit',message:'provider internal error'}});
 await h.run('signUp()');assert.match(h.w.document.getElementById('suMsg').textContent,/Bir süre sonra/);assert.doesNotMatch(h.w.document.getElementById('suMsg').textContent,/provider/);
 assert.equal(h.w.document.getElementById('suMagaza').value.trim(),'Yeni mağaza');assert.equal(h.w.document.getElementById('suSubmit').disabled,false);
});
test('administrator must choose stock model before atomic approval',async t=>{
 const h=harness(t);h.run(admin);await h.run('fqApproveSignup()');assert.equal(h.calls.length,0);assert.match(h.w.document.getElementById('fqApprovalMessage').textContent,/seçimini yap/);
 h.run("$('fqApproveModel').value='shared';");h.respond({data:{id:'applicant'},error:null});h.run('loadBayiler=async()=>{}');
 await h.run('fqApproveSignup()');
 const request=h.calls.find(x=>x.table==='profiller'),update=request.methods.find(x=>x[0]==='update')[1];
 assert.deepEqual(JSON.parse(JSON.stringify(update)),{ad:'Başvuran',magaza:'Mağaza',marka_erisimi:['bosch'],bayi_sahibi:'user-a',abonelik_durumu:'aktif'});
 assert.deepEqual(request.methods.find(x=>x[0]==='eq'),['eq','id','applicant']);assert.equal(h.w.document.getElementById('fqApprovalDialog').open,false);
});
test('legacy both-brand default is not silently reused as approved access',async t=>{
 const h=harness(t);h.run(admin+"window._bayiCache.applicant.marka_erisimi=['bosch','siemens'];window._bayiCache.applicant.basvuru_markalari=[];fqOpenApproval('applicant');$('fqApproveModel').value='independent';");
 await h.run('fqApproveSignup()');assert.equal(h.calls.length,0);assert.match(h.w.document.getElementById('fqApprovalMessage').textContent,/marka erişimi seç/);
 h.run("$('fqApproveSiemens').checked=true;loadBayiler=async()=>{};");h.respond({data:{id:'applicant'},error:null});await h.run('fqApproveSignup()');
 const update=h.calls[0].methods.find(x=>x[0]==='update')[1];assert.equal(update.bayi_sahibi,null);assert.deepEqual(Array.from(update.marka_erisimi),['siemens']);
});
test('RLS zero-row and backend errors never masquerade as an approved account',async t=>{
 const h=harness(t);h.run(admin+"$('fqApproveModel').value='shared';");
 for(const response of [{data:null,error:null},{data:null,error:{message:'denied'}}]){h.respond(response);await h.run('fqApproveSignup()');assert.equal(h.w.document.getElementById('fqApprovalDialog').open,true);assert.match(h.w.document.getElementById('fqApprovalMessage').textContent,/kaydedilemedi/);assert.equal(h.w.document.getElementById('fqApproveSave').disabled,false);}
});
test('ordinary shop account cannot open approval or update another account status',async t=>{
 const h=harness(t);h.run("window._bayiCache={applicant:{id:'applicant',rol:'bayi'}};");await h.run("setBayiDurum('applicant','aktif')");await h.run("setBayiDurum('applicant','pasif')");await h.run('fqApproveSignup()');
 assert.equal(h.calls.length,0);assert.equal(h.w.document.getElementById('fqApprovalDialog').open,false);
});
test('session reset closes application approval and clears target account',t=>{
 const h=harness(t);h.run(admin+'fqResetSession();');assert.equal(h.w.document.getElementById('fqApprovalDialog').open,false);assert.equal(h.run('fqApproval.id'),null);
});
