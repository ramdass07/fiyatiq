const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
// v11.20: açık tema varsayılan + perakende 5 taksit

test('light theme is the default and the toggle remembers dark on the device',t=>{
 const h=harness(t);
 assert.equal(h.w.document.body.classList.contains('fq-dark'),false);
 assert.equal(h.w.document.getElementById('fqTemaBtn').textContent,'🌙');
 h.run('fqTemaDegistir()');
 assert.equal(h.w.document.body.classList.contains('fq-dark'),true);
 assert.equal(h.w.localStorage.getItem('fq_tema'),'dark');
 assert.equal(h.w.document.getElementById('fqTemaBtn').textContent,'☀');
 h.run('fqTemaDegistir()');
 assert.equal(h.w.document.body.classList.contains('fq-dark'),false);
 assert.equal(h.w.localStorage.getItem('fq_tema'),'light');
});

test('retail price and the 5-installment total are shown on the simple product card and in the detailed table',t=>{
 const h=harness(t);
 h.run("quoteRows=[{...bosSatir(),kod:'KDN55NWE0N',ad:'Buzdolabı',adet:2,toptan:30000,bip:1000,etiket:41900,etiketTaksit:45260,netStok:5}];basitMod=true;applyGorunum();renderRows();");
 const line=h.w.document.querySelector('[data-retail-line]');
 assert.ok(line,'retail line present in simple view');
 assert.match(line.textContent,/Perakende 41\.900,00 ₺/);
 assert.match(line.textContent,/5 taksit 45\.260,00 ₺/);
 assert.equal(h.w.document.querySelector('[data-cost="retail"]'),null,'cost known → no duplicate retail row in breakdown');
 // detaylı tablo: Perakende hücresi satır toplamı (2 adet) + 5T
 h.run("basitMod=false;applyGorunum();renderRows();");
 const cell=h.w.document.querySelectorAll('#rows>tr')[0].children[6];
 assert.match(cell.textContent,/83\.800/);
 assert.match(cell.querySelector('.fq-per-taksit').textContent,/5T 90\.520/);
});

test('without a 5-installment value only the retail price is written; sale prices are untouched',t=>{
 const h=harness(t);
 h.run("quoteRows=[{...bosSatir(),kod:'TEST123',ad:'Ürün',adet:1,toptan:10000,bip:0,etiket:14000,netStok:8}];basitMod=true;applyGorunum();renderRows();");
 const line=h.w.document.querySelector('[data-retail-line]');
 assert.match(line.textContent,/Perakende 14\.000,00 ₺/);
 assert.doesNotMatch(line.textContent,/5 taksit/);
 assert.equal(h.run("quoteRows[0].nakit"),10400); // %4 hedef kâr → değişmedi
});

test('the perakende importer reads the 2nd option total as taksit_fiyat and never falls back to a random numeric column',t=>{
 const h=harness(t);
 const cfg=JSON.parse(h.run("JSON.stringify(IMPORTERS.perakende.cols.map(c=>c.key))"));
 assert.deepEqual(cfg,['model_kodu','nakit_fiyat','taksit_fiyat']);
 assert.equal(h.run("IMPORTERS.perakende.cols[2].optional"),true);
 // parsePriceWb: BSH perakende sayfa düzeni
 const aoa=[["BOSCH"],["ÜRÜNLER","KAMPANYASIZ PEŞİN FİYAT","PEŞİN FİYAT","Peşinat + 4 Taksit","Toplam Fiyat","Peşinat + 8 Taksit","Toplam Fiyat"],["KDN55NWE0N",43000,41900,9052,45260,5776,51984],["KDN55XWE0N",53000,51500,11036,55180,7020,63180]];
 h.run("window.XLSX={utils:{sheet_to_json:()=>"+JSON.stringify(aoa)+"}};");
 const r=h.run("JSON.stringify(parsePriceWb({SheetNames:['Solo Perakende'],Sheets:{'Solo Perakende':{}}},'bosch','2026-10-01').perRows)");
 assert.deepEqual(JSON.parse(r),[{model_kodu:'KDN55NWE0N',marka:'bosch',donem:'2026-10-01',nakit_fiyat:41900,taksit_fiyat:45260},{model_kodu:'KDN55XWE0N',marka:'bosch',donem:'2026-10-01',nakit_fiyat:51500,taksit_fiyat:55180}]);
});
