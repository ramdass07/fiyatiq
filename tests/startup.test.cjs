const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

test('quote actions cannot interrupt delayed initial catalog loading',async t=>{
 const h=harness(t);
 let finishCatalog,notifyCatalogStarted;
 h.w.__initialCatalog=new Promise(resolve=>{finishCatalog=resolve;});
 const catalogStarted=new Promise(resolve=>{notifyCatalogStarted=resolve;});
 h.w.__notifyCatalogStarted=notifyCatalogStarted;
 h.run(`
  fqFlow.ready=false;appReady=false;loadProfil=async()=>{};
  loadAktifDonem=async()=>{window.__notifyCatalogStarted();await window.__initialCatalog;};
  for(const name of ['loadPrimli','loadBagimsizToptan','loadKampFiyat','loadHasarli','loadPhaseOut','loadIkili','loadBanks','loadAktifKampanyalar'])window[name]=async()=>{};
  hkInit=()=>{};hsInit=()=>{};
 `);
 const startup=h.run("showApp({user:{id:'user-a'}})");
 await catalogStarted;
 assert.equal(h.run('appReady'),true);
 assert.equal(h.run('fqDataReady'),false);
 const state=()=>h.run('JSON.stringify({epoch:fqEpoch,brand,rows:quoteRows.map(row=>Object.fromEntries(FQ_ROW_KEYS.map(key=>[key,row[key]]))),fields:fqCustomerFields(),savedTeklifId,currentTeklifNo})');
 const before=state(),actions=[];
 try{
  h.run('fqRequestNew()');
  actions.push(h.run("fqRestoreDraft('ignored')"));
  actions.push(h.run("fqCopyQuote('ignored')"));
  actions.push(h.run("setBrand('siemens')"));
  await Promise.resolve();
  assert.equal(state(),before,'startup actions must not alter the epoch, brand, customer or quote');
  assert.equal(h.calls.length,0,'startup actions must not query saved quotes');
  assert.equal(h.w.localStorage.length,0,'startup actions must not persist partial drafts');
  assert.equal(h.run("$('fqNewDialog').open"),false);
  assert.equal(h.run("$('fqDraftMessage').textContent"),'');
  assert.equal(h.run('fqFlow.busy'),false);
 }finally{
  finishCatalog();
  await Promise.all([startup,...actions]);
 }
 assert.equal(h.run('fqDataReady'),true);
 assert.equal(h.run('fqFlow.ready'),true);
 assert.equal(state(),before,'successful initial loading keeps the original workspace');
});
