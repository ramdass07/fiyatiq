const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
// v11.21 Satıcı Modu: tek arama kutusu + hızlı WhatsApp (yalnız telefon) + kâr % satıcıda kalır

test('WhatsApp requires only the customer phone; printing and manual save keep the three fields',t=>{
 const h=harness(t);h.seed();
 h.run("$('mAd').value='';$('satisPersonel').value='';$('mTel').value='5551112233'");
 assert.equal(h.run("customerMissing('whatsapp')"),null);
 assert.equal(h.run("customerMissing('teklif')[0]"),'satisPersonel');
 assert.equal(h.run("customerMissing('save')[0]"),'satisPersonel');
 h.run("fqQuickShare=true");assert.equal(h.run("customerMissing('save')"),null);h.run("fqQuickShare=false");
 h.run("$('mTel').value='555'");assert.equal(h.run("customerMissing('whatsapp')[0]"),'mTel');
});

test('the WhatsApp dialog hint says only the phone is required and focuses the phone field',t=>{
 const h=harness(t);h.seed();h.run("$('mAd').value='';$('mTel').value=''");
 h.run("openCustomerDialog('whatsapp')");
 assert.match(h.w.document.getElementById('customerDialogHint').textContent,/yalnız müşteri telefonu/);
 assert.equal(h.w.document.activeElement.id,'mTel');
 h.run("closeCustomerDialog()");
});

test('a quick share saves the quote without a customer name and never leaves the quick flag on',async t=>{
 const h=harness(t);h.seed();h.run("$('mAd').value='';$('satisPersonel').value='';$('mTel').value='5551112233';window.open=()=>({close(){},location:{set href(v){window.__url=v;}}});");
 h.respond({data:[{id:'q1'}],error:null});
 await h.run('shareWhatsApp()');
 assert.equal(h.run('fqQuickShare'),false);
 const kayit=h.calls.find(c=>c.table==='teklifler');
 assert.ok(kayit,'quote saved');
 assert.match(String(h.w.__url||''),/api\.whatsapp\.com\/send\?phone=905551112233/);
});

test('the seller search box lists both brands, prefers the active brand, and adds the pick to the first blank row',async t=>{
 const h=harness(t);
 h.respond({data:[{model_kodu:'WG64K2Z0TR',urun_adi:'Siemens çamaşır',marka:'siemens'},{model_kodu:'WGA254Z0TR',urun_adi:'Bosch çamaşır',marka:'bosch'}],error:null});
 await h.run("fqAraSorgula('W')");
 const items=[...h.w.document.querySelectorAll('.fq-ara-item .k')].map(e=>e.textContent);
 assert.deepEqual(items,['WGA254Z0TR','WG64K2Z0TR']); // aktif marka bosch önce
 assert.equal(h.w.document.querySelector('.fq-ara-item .m').textContent,'bosch');
 h.run("quoteRows=[bosSatir(),bosSatir()];renderRows();__sb.rpc=async()=>({data:[{urun_adi:'Bosch çamaşır',toptan_fiyat:30000,bip_tutar:0,nakit_fiyat:40000,taksit_fiyat:43000,net_stok:3}],error:null});");
 h.respond({data:[],error:null});
 await h.run('fqAraSec(0)');
 assert.equal(h.run('quoteRows[0].kod'),'WGA254Z0TR');
 assert.equal(h.run('brand'),'bosch');
 assert.equal(h.w.document.getElementById('fqAra').value,'');
 assert.equal(h.w.document.getElementById('fqAraSonuc').style.display,'none');
});

test('the search box is shown in the seller view and hidden in the manager view; profit % stays visible in both',t=>{
 const h=harness(t);
 h.run("basitMod=true;applyGorunum();");
 assert.equal(h.w.document.getElementById('fqAraKutu').style.display,'');
 assert.equal(h.w.document.getElementById('gorunumBtn').textContent,'Yönetici görünümü');
 assert.notEqual(h.w.getComputedStyle(h.w.document.getElementById('karFld')).display,'none');
 h.run("basitMod=false;applyGorunum();");
 assert.equal(h.w.document.getElementById('fqAraKutu').style.display,'none');
 assert.equal(h.w.document.getElementById('gorunumBtn').textContent,'Satıcı görünümü');
 assert.notEqual(h.w.getComputedStyle(h.w.document.getElementById('karFld')).display,'none');
});
