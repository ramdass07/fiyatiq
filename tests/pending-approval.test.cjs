const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
// 16 Eki: onay bekleyen mağaza, yönetici onaylayınca yenilemeden satış ekranına geçmeli.
function setup(t,durum){const h=harness(t);h.w.__durum=durum;h.run(`window.__acilan=0;window.__aralik=[];
 setInterval=(f,ms)=>{window.__aralik.push(ms);return 7;};clearInterval=()=>{window.__durdu=(window.__durdu||0)+1;};
 sb={auth:{getSession:async()=>({data:{session:{user:{id:'yeni-sube'}}},error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{rol:'bayi',abonelik_durumu:window.__durum},error:null})})})})};
 fqStartSession=async s=>{window.__acilan++;window.__uid=s.user.id;};show('pendingView');`);return h;}
test('the waiting screen polls every 30 seconds and opens the sales screen once approved',async t=>{
 const h=setup(t,'pasif');
 assert.equal(h.run('JSON.stringify(window.__aralik)'),'[30000]');assert.ok(h.w.document.getElementById('pendingCheckBtn'));
 await h.run('fqPendingCheck(true)');
 assert.equal(h.run('window.__acilan'),0);assert.match(h.w.document.getElementById('pendingMsg').textContent,/Henüz onaylanmadı/);
 h.w.__durum='aktif';await h.run('fqPendingCheck(false)');
 assert.equal(h.run('window.__acilan'),1);assert.equal(h.run('window.__uid'),'yeni-sube');
 assert.match(h.w.document.getElementById('pendingMsg').textContent,/onaylandı/);assert.ok(h.run('window.__durdu')>=1);
});
test('checks stop when the waiting screen is not shown',async t=>{
 const h=setup(t,'aktif');h.run("show('loginView')");
 await h.run('fqPendingCheck(true)');assert.equal(h.run('window.__acilan'),0);
});

test('the version note is shown only to the admin; stores see only date and version',t=>{
 const h=harness(t);const el=()=>h.w.document.getElementById('fqSurum').textContent;
 h.run("profil.rol='bayi';fqSurumGoster()");assert.equal(el(),'v · '+h.run('FQ_SURUM').replace(/\s*\(.*\)\s*$/,''));assert.doesNotMatch(el(),/\(/);assert.match(el(),/v11\.23$/);
 h.run("profil.rol='admin';fqSurumGoster()");assert.equal(el(),'v · '+h.run('FQ_SURUM'));assert.match(el(),/\(/);
});
