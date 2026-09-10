const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness}=require('./harness.cjs');
const Q1='11111111-1111-4111-8111-111111111111',Q2='22222222-2222-4222-8222-222222222222';
const change=(once,sonra)=>({once,sonra});
function event(id='20',extra={}){return {id,olusturuldu_at:'2026-09-10T21:15:00Z',islem:'degisti',islem_yapan:'Ataşehir · mağaza hesabı',degisiklikler:{takip_notu:change('İlk görüşme','Cuma yeniden aranacak')},...extra};}
function setup(t){const h=harness(t);if(h.run("typeof fqOpenQuoteHistory")!=='function')h.run(fs.readFileSync(path.join(__dirname,'../js/teklif-gecmisi.js'),'utf8'));h.rpc=[];h.result={data:{rows:[],has_more:false},error:null};h.w.__sb.rpc=async(name,args)=>{h.rpc.push({name,args:JSON.parse(JSON.stringify(args))});return h.result;};h.open=id=>h.run(`fqOpenQuoteHistory(${JSON.stringify(id||Q1)})`);return h;}
function text(h){return h.w.document.getElementById('fqHistoryEvents').textContent;}

test('history baseline clearly marks when recording began and shows Turkey time, without inventing earlier events',async t=>{
 const h=setup(t);h.result={data:{rows:[event('19',{islem:'baslangic',islem_yapan:'Sistem · geçmiş kaydı başlangıcı',degisiklikler:{teklif_tarihi:change(null,'2026-08-01T10:00:00Z'),takip_notu:change(null,'Mevcut eski not'),satis_tarihi:change(null,null)}})],has_more:false},error:null};
 assert.equal(await h.open(),true);assert.equal(h.rpc[0].name,'fq_teklif_gecmisi_oku');assert.deepEqual(h.rpc[0].args,{p_teklif_id:Q1,p_before_id:null,p_page_size:30});
 assert.match(text(h),/Geçmiş kaydı bu noktada başlatıldı; daha eski değişiklikler saklanmamış/);assert.match(text(h),/11\.09\.2026 00:15/);assert.match(text(h),/0?1\.08\.2026 13:00/);assert.match(text(h),/Girilmedi/);assert.doesNotMatch(text(h),/Önce/);assert.equal(h.w.document.querySelectorAll('.fq-history-event').length,1);assert.match(h.w.document.getElementById('fqHistoryMessage').textContent,/sonuna ulaşıldı/);assert.equal(h.calls.length,0);
});

test('history shows before and after, preserves cents and zero, and renders only approved product and note fields',async t=>{
 const h=setup(t);h.result={data:{rows:[event('20',{islem_yapan:'<img src=x onerror=alert(1)> · hesap',degisiklikler:{gercek_satis_tutari:change('32500.25',0),takip_notu:change('Önce\n<svg onload=alert(1)>','Sonra & "yeni"'),satis_odeme_sekli:change('kart','havale'),satis_tarihi:change('2026-09-09','2026-09-10'),satis_taksit_sayisi:change(6,null),urunler:change([{model:'ESKI',ad:'Eski ürün',adet:1}],[{model:'<b>SN123</b>',ad:'Makine',adet:2,toplam_nakit:'32500.25',toplam_taksit:0,maliyet:98765,customer_fields:{tc:'SECRET_TC'}}]),gizli_anahtar:change(null,'SECRET_KEY')}})],has_more:false},error:null};
 await h.open();const shown=text(h);assert.match(shown,/Önce/);assert.match(shown,/Sonra/);assert.match(shown,/32\.500,25 ₺/);assert.match(shown,/0,00 ₺/);assert.match(shown,/Havale \/ EFT/);assert.match(shown,/10\.09\.2026/);assert.match(shown,/<b>SN123<\/b>/);assert.match(shown,/<svg onload=alert\(1\)>/);assert.doesNotMatch(shown,/98765|SECRET_TC|SECRET_KEY/);assert.equal(h.w.document.querySelectorAll('#fqHistoryEvents img,#fqHistoryEvents svg,#fqHistoryEvents b,#fqHistoryEvents script').length,0);
});

test('history cursor paging keeps bigint identity exact and prevents duplicate concurrent page requests',async t=>{
 const h=setup(t),first='9007199254740993123',second='9007199254740993122';h.result={data:{rows:[event(first),event(second)],has_more:true},error:null};await h.open();assert.equal(h.w.document.getElementById('fqHistoryMore').hidden,false);
 let release;h.w.__sb.rpc=(name,args)=>{h.rpc.push({name,args:JSON.parse(JSON.stringify(args))});return new Promise(resolve=>{release=resolve;});};const pending=h.run('fqLoadQuoteHistoryMore()');assert.equal(h.w.document.getElementById('fqHistoryMore').disabled,true);assert.equal(await h.run('fqLoadQuoteHistoryMore()'),false);assert.equal(h.rpc.length,2);assert.equal(h.rpc[1].args.p_before_id,second);
 release({data:{rows:[event('9007199254740993121')],has_more:false},error:null});assert.equal(await pending,true);assert.equal(h.w.document.querySelectorAll('.fq-history-event').length,3);assert.equal(h.w.document.getElementById('fqHistoryMore').hidden,true);assert.equal(h.run('fqQuoteHistory.cursor'),'9007199254740993121');assert.equal(h.calls.length,0);
});

test('a bad older page is not appended or allowed to advance the cursor, and can be retried',async t=>{
 const h=setup(t);h.result={data:{rows:[event('20')],has_more:true},error:null};await h.open();h.result={data:{rows:[event('20')],has_more:false},error:null};assert.equal(await h.run('fqLoadQuoteHistoryMore()'),false);assert.equal(h.w.document.querySelectorAll('.fq-history-event').length,1);assert.equal(h.run('fqQuoteHistory.cursor'),'20');assert.equal(h.w.document.getElementById('fqHistoryMore').disabled,false);
 h.result={data:{rows:[event('19')],has_more:false},error:null};assert.equal(await h.run('fqLoadQuoteHistoryMore()'),true);assert.equal(h.w.document.querySelectorAll('.fq-history-event').length,2);
});

test('forbidden or unknown quote is generic; RPC errors do not expose server details and allow reload',async t=>{
 const h=setup(t);await h.open();assert.match(h.w.document.getElementById('fqHistoryMessage').textContent,/bulunamadı veya bu teklife erişimin yok/);assert.equal(text(h),'');
 h.result={data:null,error:{message:'secret server SQL details'}};assert.equal(await h.run('fqReloadQuoteHistory()'),false);assert.match(h.w.document.getElementById('fqHistoryMessage').textContent,/yüklenemedi/);assert.doesNotMatch(h.w.document.body.textContent,/secret server SQL details/);assert.equal(h.w.document.getElementById('fqHistoryReload').disabled,false);
 h.result={data:{rows:[event()],has_more:false},error:null};assert.equal(await h.run('fqReloadQuoteHistory()'),true);assert.equal(h.calls.length,0);
});

test('late response for a previously opened quote cannot replace the newer quote history',async t=>{
 const h=setup(t),pending=[];h.w.__sb.rpc=(name,args)=>new Promise(resolve=>pending.push({id:args.p_teklif_id,resolve}));const old=h.open(Q1),current=h.open(Q2);pending[1].resolve({data:{rows:[event('40',{degisiklikler:{takip_notu:change(null,'YENI_KAYIT')}})],has_more:false},error:null});assert.equal(await current,true);
 pending[0].resolve({data:{rows:[event('30',{degisiklikler:{takip_notu:change(null,'ESKI_GEC_YANIT')}})],has_more:false},error:null});assert.equal(await old,false);assert.match(text(h),/YENI_KAYIT/);assert.doesNotMatch(text(h),/ESKI_GEC_YANIT/);assert.equal(h.run('fqQuoteHistory.id'),Q2);
});

test('account, epoch, role, brand permissions, membership status, and brand changes discard in-flight history',async t=>{
 for(const mutation of ["authUid='user-b'",'fqEpoch++',"profil.rol='personel'","profil.marka_erisimi=['siemens']","profil.abonelik_durumu='pasif'","brand='siemens'"]){await t.test(mutation,async t=>{const h=setup(t);let release;h.w.__sb.rpc=()=>new Promise(resolve=>{release=resolve;});const pending=h.open();h.run(mutation);release({data:{rows:[event('20',{degisiklikler:{takip_notu:change(null,'PRIVATE_NOTE')}})],has_more:false},error:null});assert.equal(await pending,false);assert.equal(text(h),'');assert.equal(h.run('fqQuoteHistory.id'),null);assert.equal(h.w.document.getElementById('fqQuoteHistoryDialog').open,false);});}
});

test('closing the history dialog cancels pending reads and session cleanup removes loaded history',async t=>{
 const h=setup(t);let release;h.w.__sb.rpc=()=>new Promise(resolve=>{release=resolve;});const pending=h.open();h.run("$('fqQuoteHistoryDialog').close()");release({data:{rows:[event()],has_more:false},error:null});assert.equal(await pending,false);assert.equal(text(h),'');
 h.w.__sb.rpc=async()=>({data:{rows:[event()],has_more:false},error:null});await h.open();assert.match(text(h),/Cuma yeniden aranacak/);h.run('fqResetSession()');assert.equal(text(h),'');assert.equal(h.run('fqQuoteHistory.id'),null);assert.equal(h.w.document.getElementById('fqQuoteHistoryDialog').open,false);
});

test('history opens above a dirty followup and preserves unsaved notes, amount, record, and save capability',async t=>{
 const h=setup(t);const record={id:Q1,bayi_id:'user-a',teklif_no:'TEST-1',durum:'satildi',takip_surumu:3,takip_notu:'Kaydedilmiş not',takip_sorumlusu:'Burak',sonraki_arama:null,kayip_nedeni:'',gercek_satis_tutari:25000,satis_odeme_sekli:'nakit',satis_tarihi:'2026-09-10',satis_banka:null,satis_taksit_sayisi:null};h.respond({data:record,error:null});await h.run(`fqOpenFollowup('${Q1}')`);assert.equal(h.w.document.getElementById('fqFollowHistory').dataset.quote,Q1);assert.equal(h.w.document.getElementById('fqFollowHistory').disabled,false);
 h.run("$('fqFollowNote').value='Henüz kaydedilmemiş not';$('fqSaleAmount').value='24800,25'");let confirms=0;h.w.confirm=()=>{confirms++;return false;};h.result={data:{rows:[event()],has_more:false},error:null};await h.run("fqOpenQuoteHistory($('fqFollowHistory').dataset.quote)");assert.equal(h.w.document.getElementById('fqFollowupDialog').open,true);h.run('fqResetQuoteHistory()');assert.equal(h.w.document.getElementById('fqFollowNote').value,'Henüz kaydedilmemiş not');assert.equal(h.w.document.getElementById('fqSaleAmount').value,'24800,25');assert.equal(h.run('fqFollowupDirty()'),true);assert.equal(h.w.document.getElementById('fqFollowSave').disabled,false);assert.equal(confirms,0);assert.equal(h.calls.length,1);assert.equal(h.calls[0].methods.some(m=>['update','insert','delete'].includes(m[0])),false);
 h.run('fqResetFollowup()');assert.equal(h.w.document.getElementById('fqFollowHistory').disabled,true);assert.equal(h.w.document.getElementById('fqFollowHistory').dataset.quote,'');
});

test('malformed history pages are rejected as a whole, including unsafe identity numbers',async t=>{
 const h=setup(t);for(const data of [{rows:[event(9007199254740992)],has_more:false},{rows:[],has_more:true},{rows:[event('20'),event('21')],has_more:false},{rows:[event('20',{islem:'bilinmeyen'})],has_more:false},{rows:[event('20',{degisiklikler:[]})],has_more:false}]){h.result={data,error:null};assert.equal(await h.open(),false);assert.equal(text(h),'');assert.match(h.w.document.getElementById('fqHistoryMessage').textContent,/yüklenemedi/);}
});

test('unrecognized fields and object values never dump hidden JSON into the internal history',async t=>{
 const h=setup(t);h.result={data:{rows:[event('20',{degisiklikler:{customer_fields:change(null,{tc:'HIDDEN_TC'}),takip_notu:change({secret:'HIDDEN_NOTE'},'Güvenli not'),urunler:change(null,[{model:'ESKI_MODEL',ad:'Eski ürün',adet:1,hesap:{maliyet:'HIDDEN_COST'}}])}})],has_more:false},error:null};await h.open();assert.match(text(h),/Bilgi gösterilemiyor/);assert.match(text(h),/ESKI_MODEL/);assert.doesNotMatch(text(h),/HIDDEN_TC|HIDDEN_NOTE|HIDDEN_COST|0,00 ₺/);
});

test('history follows existing account access, including admin exemption, and buttons escape quote IDs',async t=>{
 const h=setup(t);h.run("profil.abonelik_durumu='pasif'");assert.equal(await h.open(),false);h.run("profil.abonelik_durumu='aktif';authUid=null");assert.equal(await h.open(),false);assert.equal(h.rpc.length,0);
 h.run("authUid='user-a';profil.rol='admin';profil.abonelik_durumu='pasif'");assert.equal(await h.open(),true);assert.equal(h.rpc.length,1);
 const button=h.run("fqQuoteHistoryActionsHTML('x\" onmouseover=\"bad')");const wrapper=h.w.document.createElement('div');wrapper.innerHTML=button;assert.equal(wrapper.firstElementChild.textContent,'Geçmiş');assert.equal(wrapper.firstElementChild.dataset.quote,'x" onmouseover="bad');assert.equal(wrapper.firstElementChild.getAttribute('onmouseover'),null);
});
