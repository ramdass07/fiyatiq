const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness}=require('./harness.cjs');
function setup(t){const h=harness(t);h.seed();h.run('basitMod=true;applyGorunum();renderRows()');return h;}
function field(h,key){return h.w.document.querySelector('.sale-cost-breakdown [data-cost="'+key+'"]').textContent;}

test('the ordinary store screen shows unit cost, BIP and net cost with cents for multiple units',t=>{
 const h=setup(t);h.run('quoteRows[0].toptan=12345.67;quoteRows[0].bip=2345.12;quoteRows[0].adet=2;renderRows()');
 const card=h.w.document.querySelector('.sale-cost-breakdown');
 assert.equal(h.w.getComputedStyle(card).display,'block');assert.match(card.textContent,/Birim tutarlar · 1 adet/);
 assert.equal(field(h,'cost'),'12.345,67 ₺');assert.equal(field(h,'bip'),'2.345,12 ₺');assert.equal(field(h,'net'),'10.000,55 ₺');
 assert.equal(h.run('lastTot.tMaliyet'),24691.34);assert.equal(h.run('lastTot.dip'),20001.1);
 assert.equal(h.run('Math.round(lastTot.finalNakit*100)'),2080114);
 for(const role of ['bayi','personel','admin']){h.w.__role=role;h.run('profil.rol=__role;renderRows()');assert.equal(field(h,'net'),'10.000,55 ₺');}
});

test('manual unit cost remains a single editable field and moves safely between views',t=>{
 const h=setup(t);h.run("quoteRows[0].bip=2000;toggleManuel(0)");
 let inputs=h.w.document.querySelectorAll('[data-fq-field="etToptan"]');assert.equal(inputs.length,1);
 assert.ok(inputs[0].closest('.sale-cost-breakdown'));assert.equal(field(h,'bip'),'Uygulanmıyor');assert.equal(field(h,'net'),'10.000,00 ₺');
 assert.match(h.w.document.querySelector('.sale-cost-note').textContent,/BİP ayrıca düşülmez/);
 inputs[0].value='8.750,25';h.run("quoteRows[0].etToptan=trSayi(document.querySelector('[data-fq-field=etToptan]').value);recalc()");
 assert.equal(field(h,'net'),'8.750,25 ₺');assert.equal(h.run('lastTot.dip'),8750.25);
 h.run('toggleGorunum()');inputs=h.w.document.querySelectorAll('[data-fq-field="etToptan"]');assert.equal(inputs.length,1);
 assert.equal(inputs[0].closest('.sale-cost-breakdown'),null);assert.equal(h.w.document.querySelector('.sale-cost-breakdown'),null);
 h.run('toggleGorunum()');assert.equal(h.w.document.querySelectorAll('[data-fq-field="etToptan"]').length,1);assert.equal(field(h,'net'),'8.750,25 ₺');
 h.run(fs.readFileSync(path.join(__dirname,'../js/musteri-gorunumu.js'),'utf8'));assert.equal(h.run('fqShowCustomerView()'),true);
});

test('zero support and zero net cost are visible while missing cost remains unknown',t=>{
 const h=setup(t);assert.equal(field(h,'bip'),'0,00 ₺');
 h.run('quoteRows[0].bip=10000;renderRows()');assert.equal(field(h,'net'),'0,00 ₺');
 h.run('toggleGorunum()');assert.equal(h.w.document.querySelector('#rows>tr').children[5].textContent,'0');
 h.run('toggleGorunum();quoteRows[0].toptan=null;renderRows()');assert.equal(field(h,'cost'),'Girilmedi');assert.equal(field(h,'net'),'—');
 h.run('quoteRows=[bosSatir()];renderRows()');assert.equal(h.w.document.querySelector('.sale-cost-breakdown'),null);
});

test('loading, errors and a changed model do not present the previous product cost',t=>{
 const h=setup(t);h.run("quoteRows[0].veriHata='Fiyat sorgulanamadı';renderRows()");
 for(const key of ['cost','bip','net'])assert.equal(field(h,key),'—');
 h.run("quoteRows[0].veriHata=null;renderRows();fqSetCode(quoteRows[0],'NEW123')");
 assert.equal(h.w.document.querySelector('.sale-cost-breakdown'),null);
 h.run('renderRows()');assert.equal(field(h,'net'),'—');
 h.seed();h.run('fqDataReady=false;renderRows()');assert.equal(field(h,'cost'),'—');
 h.run('fqDataReady=true;renderRows();sb.rpc=()=>new Promise(()=>{});refetch(quoteRows[0]);');
 assert.equal(h.run('quoteRows[0].veriHata'),'Ürün verisi yükleniyor');assert.equal(h.w.document.querySelector('.sale-cost-breakdown'),null);
});

test('negotiated sale prices do not change BIP net cost or imply bundle support was already deducted',t=>{
 const h=setup(t);h.run('quoteRows[0].bip=2000;manuelToplamPesin=7000;renderRows()');
 assert.equal(field(h,'net'),'8.000,00 ₺');assert.equal(h.run('lastTot.finalNakit'),7000);
 assert.match(h.w.document.querySelector('.sale-cost-note').textContent,/Hakediş ayrıca hesaplanır/);
});

test('customer presentation contains sale prices while the store retains its internal cost breakdown',t=>{
 const h=setup(t);h.run('quoteRows[0].toptan=12345.67;quoteRows[0].bip=2345.12;renderRows()');
 h.run(fs.readFileSync(path.join(__dirname,'../js/musteri-gorunumu.js'),'utf8'));assert.equal(h.run('fqShowCustomerView()'),true);
 const customer=h.w.document.getElementById('fqCustomerView');
 assert.doesNotMatch(customer.textContent,/maliyet|BİP|12\.345|2\.345|10\.000,55/i);assert.equal(customer.querySelector('.sale-cost-breakdown'),null);
 h.run('fqCloseCustomerView()');assert.equal(field(h,'net'),'10.000,55 ₺');
});

test('a retail-only price response remains usable and shows the unit list price without inventing cost or sale amounts',async t=>{
 const h=setup(t);h.run('quoteRows[0].adet=2;quoteRows[0].toptan=null;quoteRows[0].etiket=null');
 h.w.__sb.rpc=async()=>({data:[{urun_adi:null,toptan_fiyat:null,nakit_fiyat:'28450.75',bip_tutar:0}],error:null});
 await h.run('refetch(quoteRows[0])');
 assert.equal(h.run('quoteRows[0].ad'),'TEST123');assert.equal(field(h,'retail'),'28.450,75 ₺');
 assert.equal(field(h,'net'),'—');assert.equal(h.run('quoteRows[0].etToptan'),null);
 assert.equal(h.run('quoteRows[0].manuelFiyat'),null);assert.equal(h.run('lastTot.tMaliyet'),0);assert.equal(h.run('lastTot.finalNakit'),0);
 assert.match(h.w.document.querySelector('.sale-cost-note').textContent,/Maliyet girilmeden kâr hesaplanamaz/);
 h.run('quoteRows[0].manuelFiyat=25000;renderRows()');assert.equal(field(h,'retail'),'28.450,75 ₺');assert.equal(h.run('lastTot.finalNakit'),50000);
});

test('a retail reference disappears when cost is supplied, data is pending or the retail value is unavailable',t=>{
 const h=setup(t),retail=()=>h.w.document.querySelector('[data-cost="retail"]');
 assert.equal(retail(),null);h.run('quoteRows[0].toptan=null;renderRows()');assert.equal(field(h,'retail'),'14.000,00 ₺');
 h.run('quoteRows[0].isET=true;quoteRows[0].etToptan=9000;renderRows()');assert.equal(retail(),null);assert.equal(field(h,'net'),'9.000,00 ₺');
 h.run("quoteRows[0].etToptan=null;quoteRows[0].veriHata='Ürün verisi yükleniyor';renderRows()");assert.equal(retail(),null);
 for(const value of [null,undefined,'',0,-1,NaN,Infinity,true,{},'geçersiz']){h.w.__retail=value;h.run('quoteRows[0].veriHata=null;quoteRows[0].etiket=__retail;renderRows()');assert.equal(retail(),null);}
});

test('a refreshed missing retail field clears the earlier reference and leaves a manually entered sale intact',async t=>{
 const h=setup(t);h.run('quoteRows[0].isET=true;quoteRows[0].toptan=null;quoteRows[0].etToptan=null;quoteRows[0].manuelFiyat=12000;renderRows()');
 assert.equal(field(h,'retail'),'14.000,00 ₺');
 h.w.__sb.rpc=async()=>({data:[{urun_adi:'Test ürün',toptan_fiyat:null}],error:null});
 await h.run('refetch(quoteRows[0])');
 assert.equal(h.run('quoteRows[0].etiket'),null);assert.equal(h.w.document.querySelector('[data-cost="retail"]'),null);
 assert.equal(h.run('quoteRows[0].manuelFiyat'),12000);assert.equal(h.run('lastTot.finalNakit'),12000);
});
