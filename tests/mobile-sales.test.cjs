const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

function setup(t,mobile=true){
 const h=harness(t);let narrow=mobile;
 h.w.matchMedia=()=>({matches:narrow});
 h.setMobile=value=>{narrow=value;};
 h.seed();h.run("basitMod=false;localStorage.setItem('fq_sade_v10','0');applyGorunum();renderRows()");
 return h;
}
function cost(h,key){return h.w.document.querySelector('[data-cost="'+key+'"]').textContent;}
function simple(h){return h.w.document.getElementById('salesWorkspace').classList.contains('simple-sale');}
function financialState(h){return h.run('JSON.stringify({totals:lastTot,prices:quoteRows.map(r=>({kod:r.kod,adet:r.adet,nakit:r.nakit,taksit:r.taksit}))})');}

test('mobile overrides a saved detailed desktop view and preserves visible BIP cost with cents',t=>{
 const h=setup(t);h.run('quoteRows[0].toptan=12345.67;quoteRows[0].bip=2345.12;quoteRows[0].adet=2;renderRows()');
 assert.equal(simple(h),true);assert.equal(h.w.document.getElementById('grid').classList.contains('basit'),true);
 assert.equal(h.run('basitMod'),false);assert.equal(h.w.localStorage.getItem('fq_sade_v10'),'0');
 assert.equal(cost(h,'cost'),'12.345,67 ₺');assert.equal(cost(h,'bip'),'2.345,12 ₺');assert.equal(cost(h,'net'),'10.000,55 ₺');
 assert.equal(h.run('lastTot.tMaliyet'),24691.34);assert.equal(h.run('lastTot.dip'),20001.1);
 assert.match(h.w.document.getElementById('salePriceHint').textContent,/Maliyetler birim tutardır/);
});

test('the mobile manual cost editor stays singular and returns to the desktop cost cell',t=>{
 const h=setup(t);h.run('quoteRows[0].bip=2000;toggleManuel(0)');
 let fields=h.w.document.querySelectorAll('[data-fq-field="etToptan"]');
 assert.equal(fields.length,1);assert.ok(fields[0].closest('.sale-cost-breakdown.is-manual'));
 assert.equal(cost(h,'bip'),'Uygulanmıyor');assert.equal(cost(h,'net'),'10.000,00 ₺');
 const before=financialState(h);h.setMobile(false);h.run('fqMobileLayoutChanged()');
 fields=h.w.document.querySelectorAll('[data-fq-field="etToptan"]');
 assert.equal(simple(h),false);assert.equal(fields.length,1);assert.equal(fields[0].closest('.sale-cost-breakdown'),null);
 assert.equal(financialState(h),before);assert.equal(h.run('basitMod'),false);
 h.setMobile(true);h.run('fqMobileLayoutChanged()');
 assert.equal(h.w.document.querySelectorAll('[data-fq-field="etToptan"]').length,1);
 assert.equal(cost(h,'net'),'10.000,00 ₺');assert.equal(financialState(h),before);
});

test('mobile retains a retail reference when cost is missing without using it as a sale price',t=>{
 const h=setup(t);h.run('quoteRows[0].toptan=null;quoteRows[0].isET=true;quoteRows[0].etiket=28450.75;quoteRows[0].manuelFiyat=25000;quoteRows[0].adet=2;renderRows()');
 assert.equal(cost(h,'retail'),'28.450,75 ₺');assert.equal(h.w.document.querySelector('[data-fq-field="etToptan"]').value,'');assert.equal(cost(h,'net'),'—');
 assert.equal(h.run('lastTot.tMaliyet'),0);assert.equal(h.run('lastTot.finalNakit'),50000);
 const before=financialState(h);h.setMobile(false);h.run('fqMobileLayoutChanged()');
 h.setMobile(true);h.run('fqMobileLayoutChanged()');assert.equal(cost(h,'retail'),'28.450,75 ₺');assert.equal(financialState(h),before);
});

test('menu choices survive calculation rerenders and switch defaults only at the viewport boundary',t=>{
 const h=setup(t),header=h.w.document.getElementById('fqHeaderMenu'),tools=h.w.document.getElementById('fqSaleTools');
 assert.equal(header.open,false);assert.equal(tools.open,false);
 header.open=true;tools.open=true;h.run('applyGorunum();renderRows()');
 assert.equal(header.open,true);assert.equal(tools.open,true);
 header.open=false;h.run('renderRows();applyGorunum()');assert.equal(header.open,false);assert.equal(tools.open,true);
 h.setMobile(false);h.run('fqMobileLayoutChanged()');assert.equal(header.open,true);assert.equal(tools.open,true);
 h.setMobile(true);h.run('fqMobileLayoutChanged()');assert.equal(header.open,false);assert.equal(tools.open,false);
 assert.equal(h.w.document.getElementById('adminBtn').style.display,'none');
});

test('adding a mobile product reuses the first blank while desktop still adds a fresh row',t=>{
 const h=setup(t);h.run('quoteRows.push(bosSatir(),bosSatir(),bosSatir());renderRows()');
 const length=h.run('quoteRows.length');h.run('addRow(true)');
 assert.equal(h.run('quoteRows.length'),length);assert.equal(h.w.document.activeElement.dataset.fqRow,'1');
 assert.equal(h.w.document.querySelectorAll('#rows > .fq-empty-row:not(.fq-spare-row)').length,1);
 assert.equal(h.w.document.querySelectorAll('#rows > .fq-spare-row').length,2);
 h.w.document.activeElement.blur();h.setMobile(false);h.run('fqMobileLayoutChanged();addRow(false)');
 assert.equal(h.run('quoteRows.length'),length+1);
});

test('adding a mobile product with no blank creates one usable input without changing existing items',t=>{
 const h=setup(t),before=financialState(h);h.run('addRow(true)');
 assert.equal(h.run('quoteRows.length'),2);assert.equal(h.w.document.activeElement.dataset.fqRow,'1');
 assert.equal(h.run('quoteRows[0].kod'),'TEST123');assert.equal(h.run('quoteRows[0].ad'),'Test ürün');
 assert.equal(JSON.parse(financialState(h)).totals.finalNakit,JSON.parse(before).totals.finalNakit);
});

test('rotation preserves a focused control and its draft value then refreshes after blur',async t=>{
 const h=setup(t),input=h.w.document.getElementById('karOrani');
 input.focus();input.value='5.5';const product=h.w.document.querySelector('#rows > tr');
 h.setMobile(false);h.run('fqMobileLayoutChanged();fqMobileLayoutChanged()');
 assert.equal(h.w.document.activeElement,input);assert.equal(input.value,'5.5');
 assert.equal(h.w.document.querySelector('#rows > tr'),product);assert.equal(simple(h),true);
 input.blur();await Promise.resolve();
 assert.equal(input.value,'5.5');assert.equal(simple(h),false);assert.notEqual(h.w.document.querySelector('#rows > tr'),product);
 assert.equal(h.run('fqMobileBlurTarget'),null);assert.equal(h.run('lastTot.finalNakit'),10550);
});

test('a native quantity change after rotation commits the input before replacing its row',t=>{
 const h=setup(t);h.run('toggleManuel(0)');const input=h.w.document.querySelector('[data-fq-field="adet"]');
 input.focus();input.value='3';h.setMobile(false);h.run('fqMobileLayoutChanged()');
 assert.equal(h.w.document.activeElement,input);assert.equal(h.run('quoteRows[0].adet'),1);
 h.w.__changedInput=input;
 h.run('(function(){'+input.getAttribute('onchange')+'}).call(__changedInput)');
 assert.equal(h.run('quoteRows[0].adet'),3);assert.equal(h.run('lastTot.finalNakit'),31200);
 assert.equal(simple(h),false);assert.equal(h.w.document.querySelectorAll('[data-fq-field="etToptan"]').length,1);
 assert.equal(h.w.document.querySelector('[data-fq-field="etToptan"]').closest('.sale-cost-breakdown'),null);
 assert.equal(h.w.document.querySelector('[data-fq-field="adet"]').value,'3');
});

test('viewport layout changes preserve negotiated prices, bank commission, customer and totals',t=>{
 const h=setup(t,false);h.run("quoteRows[0].adet=2;quoteRows[0].bip=1750.25;komisOran=4.25;manuelToplamPesin=17450.75;manuelToplamTaksit=19000.25;renderRows()");
 const before=financialState(h),customer=h.run('JSON.stringify({ad:$("mAd").value,tel:$("mTel").value,personel:$("satisPersonel").value,commission:komisOran})');
 for(const narrow of [true,false,true]){h.setMobile(narrow);h.run('fqMobileLayoutChanged()');assert.equal(financialState(h),before);}
 assert.equal(h.run('JSON.stringify({ad:$("mAd").value,tel:$("mTel").value,personel:$("satisPersonel").value,commission:komisOran})'),customer);
 assert.equal(h.w.localStorage.getItem('fq_sade_v10'),'0');
});
