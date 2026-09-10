const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness}=require('./harness.cjs');
function view(t){const h=harness(t);h.run(fs.readFileSync(path.join(__dirname,'../js/musteri-gorunumu.js'),'utf8'));return h;}
test('manual products with optional empty sale prices can be shown after calculation',t=>{const h=view(t);h.seed();h.run('quoteRows[0].isET=true;quoteRows[0].etToptan=10000;renderRows()');assert.equal(h.run('fqShowCustomerView()'),true);h.run("document.querySelector('[data-fq-field=manuelFiyat]').value='abc'");assert.equal(h.run('fqShowCustomerView()'),false);});
test('customer view shows final quantity-weighted prices and excludes internal and personal data',t=>{
 const h=view(t);h.seed();h.run("quoteRows[0].adet=2;quoteRows[0].internalNote='SECRET_INTERNAL';$('mAd').value='SECRET_CUSTOMER';$('mTC').value='12345678901';renderRows();manuelToplamPesin=19000;renderRows();");
 const before=h.run('JSON.stringify({quoteRows,lastTot,savedTeklifId,currentTeklifNo})');assert.equal(h.run('fqShowCustomerView()'),true);
 const dialog=h.w.document.getElementById('fqCustomerView'),text=dialog.textContent;
 assert.match(text,/TEST123/);assert.match(text,/19\.000 ₺/);assert.equal(dialog.querySelector('tbody tr').children[1].textContent,'2');assert.doesNotMatch(text,/maliyet|kâr|komisyon|hakediş|SECRET_|12345678901|20\.000/i);
 assert.equal(h.run('JSON.stringify({quoteRows,lastTot,savedTeklifId,currentTeklifNo})'),before);assert.equal(h.calls.length,0);
});
test('customer view includes a zero-commission installment offer with its bank and count',t=>{
 const h=view(t);h.seed();h.run("$('banka').innerHTML='<option selected>Test Bank</option>';$('taksit').innerHTML='<option selected>6</option>';komisOran=0;renderRows();fqShowCustomerView()");
 const dialog=h.w.document.getElementById('fqCustomerView');assert.match(dialog.textContent,/Test Bank · 6 taksit/);assert.equal(dialog.querySelectorAll('th').length,4);assert.equal(dialog.querySelectorAll('.fq-cv-total-amount').length,2);assert.doesNotMatch(dialog.textContent,/komisyon/i);
});
test('customer view rejects incomplete, unreviewed, invalid and stale input prices',t=>{
 const h=view(t);h.seed();const alerts=[];h.w.alert=m=>alerts.push(m);
 for(const [set,reset] of [["fqDataReady=false","fqDataReady=true"],["fqFlow.review=true","fqFlow.review=false"],["fqFlow.busy=true","fqFlow.busy=false"],["fqPricingError='offline'","fqPricingError=''"],["quoteRows[0].veriHata='loading'","quoteRows[0].veriHata=null"],["quoteRows[0]._codePending=true","quoteRows[0]._codePending=false"],["lastTot.finalNakit=NaN","renderRows()"],["quoteRows[0].ad='— bulunamadı —'","quoteRows[0].ad='Test ürün'"]]){
  h.run(set);assert.equal(h.run('fqShowCustomerView()'),false,set);h.run(reset);
 }
 h.run("document.querySelector('[data-fq-field=adet]').value='3'");assert.equal(h.run('fqShowCustomerView()'),false);assert.equal(alerts.length,9);
});
test('customer view escapes product and bank text, and clears all content on close',t=>{
 const h=view(t);h.seed();h.run("quoteRows[0].ad='<img src=x onerror=alert(1)>';quoteRows[0].kod='<script>bad()</script>';fqShowCustomerView()");
 // The edited model differs from its input; no stale presentation can open.
 assert.equal(h.w.document.getElementById('fqCustomerView'),null);
 h.run("document.querySelector('[data-fq-field=kod]').value=quoteRows[0].kod;$('banka').innerHTML='<option value=\"__elle__\" selected>Elle</option>';$('elleBanka').value='<img src=bank onerror=alert(2)>';$('taksit').innerHTML='<option selected>6</option>';fqShowCustomerView()");
 const dialog=h.w.document.getElementById('fqCustomerView');assert.ok(dialog.open);assert.equal(dialog.querySelector('img,script'),null);assert.match(dialog.textContent,/<img src=x/);assert.match(dialog.textContent,/<script>/);assert.match(dialog.textContent,/<img src=bank/);
 h.run('fqCloseCustomerView()');assert.equal(dialog.open,false);assert.equal(dialog.textContent,'');assert.equal(dialog.children.length,0);
});
test('opening an empty quote clears a previous customer presentation',t=>{
 const h=view(t);h.seed();h.run('fqShowCustomerView()');h.run('quoteRows=[]');assert.equal(h.run('fqShowCustomerView()'),false);
 const dialog=h.w.document.getElementById('fqCustomerView');assert.equal(dialog.open,false);assert.equal(dialog.textContent,'');
});
