const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

const record=(extra={})=>({
 id:'historical-sale',bayi_id:'user-a',teklif_no:'FQ-OLD-42',created_at:'2026-09-01T10:00:00Z',
 musteri_ad:'Eski müşteri',marka:'bosch',durum:'satildi',toplam:30000,satis_tutari:98765,
 gercek_satis_tutari:32500.25,satis_odeme_sekli:'kart',satis_banka:'Satış bankası',satis_taksit_sayisi:6,satis_tarihi:'2026-09-10',
 satirlar:{no:'FQ-OLD-42',magaza:'Kayıtlı mağaza',personel:'Kayıtlı satıcı',banka:'Teklif bankası',taksit:6,
  net_items:[{model:'OLD1',ad:'Kayıtlı ürün',adet:1,net_nakit:30000,net_taksit:33000}],hesap:{finalNakit:30000,finalTaksit:33000}},
 ...extra
});
function render(h,value){
 h.w.__detailRecord=value;
 h.run("$('quoteDetailBody').innerHTML=teklifDetayHTML(__detailRecord)");
 return h.w.document.getElementById('quoteDetailBody');
}
function field(body,label){
 const row=[...body.querySelectorAll('.detail-field')].find(element=>element.querySelector('span').textContent===label);
 return row?row.querySelector('strong').textContent:null;
}

test('historical detail preserves actual-sale cents separately from both recorded quote totals',t=>{
 const h=harness(t);h.seed();h.run("lastTot.finalNakit=999999;lastTot.finalTaksit=999999");
 const saved=record(),before=JSON.stringify(saved),body=render(h,saved);
 assert.equal(field(body,'Gerçekleşen satış tutarı'),'32.500,25 ₺');
 assert.equal(field(body,'Kayıtlı peşin toplam'),'30.000 ₺');
 assert.equal(field(body,'Kayıtlı taksitli toplam'),'33.000 ₺');
 assert.equal(field(body,'Ödeme seçeneği'),'Kart');
 assert.equal(field(body,'Satış tarihi'),'10.09.2026');
 assert.equal(field(body,'Satış bankası'),'Satış bankası');
 assert.equal(field(body,'Banka'),'Teklif bankası');
 assert.equal(JSON.stringify(saved),before);
 assert.doesNotMatch(body.textContent,/999\.999|98\.765/);
});

test('historical detail distinguishes a confirmed zero actual sale from absent values without a quote fallback',t=>{
 const h=harness(t);
 assert.equal(field(render(h,record({gercek_satis_tutari:0})),'Gerçekleşen satış tutarı'),'0 ₺');
 for(const missing of [null,undefined,'']){
  const body=render(h,record({gercek_satis_tutari:missing}));
  assert.equal(field(body,'Gerçekleşen satış tutarı'),'Kaydedilmemiş');
  assert.equal(field(body,'Kayıtlı peşin toplam'),'30.000 ₺');
 }
});

test('historical detail exposes recorded-print and WhatsApp actions for the original quote identity',t=>{
 const h=harness(t),body=render(h,record()),buttons=[...body.querySelectorAll('.fq-actions button')];
 assert.deepEqual(buttons.map(button=>button.textContent),['Kayıtlı teklifi yazdır','Kayıtlı teklifi WhatsApp’ta aç']);
 assert.ok(buttons.every(button=>button.dataset.quote==='historical-sale'));
 assert.equal(buttons[0].getAttribute('onclick'),'fqPrintSavedQuote(this.dataset.quote)');
 assert.equal(buttons[1].getAttribute('onclick'),'fqShareSavedQuote(this.dataset.quote)');
 assert.equal(field(body,'Teklif no'),'FQ-OLD-42');
});

test('nonsold historical details show quote totals without presenting actual-sale data',t=>{
 const h=harness(t);
 for(const durum of ['teklif','kaybedildi']){
  const body=render(h,record({durum}));
  assert.equal(field(body,'Gerçekleşen satış tutarı'),null);
  assert.equal(field(body,'Satış tarihi'),null);
  assert.equal([...body.querySelectorAll('h3')].some(heading=>heading.textContent==='Gerçekleşen satış'),false);
  assert.doesNotMatch(body.textContent,/32\.500,25|Satış bankası/);
  assert.equal(field(body,'Kayıtlı peşin toplam'),'30.000 ₺');
 }
});
