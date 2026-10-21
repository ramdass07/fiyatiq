const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
// 9 Eki: primli liste BİP kutusuna düşüp Ekim BİP'lerini ezmişti. Adında "primli" geçen dosya fiyat/BİP olarak alınmaz.
function setup(t){const h=harness(t);h.run("profil.rol='admin';XLSX.read=()=>({SheetNames:['Sayfa1'],Sheets:{Sayfa1:{}}});XLSX.utils.sheet_to_json=()=>[];window.__yazildi=0;parsePriceWb=()=>{window.__yazildi++;return {topRows:[],perRows:[],bipRows:[{model_kodu:'X1',marka:'bosch',donem:'2026-10-01',bip_tutar:1}]};};");return h;}
const dosya=name=>`({name:${JSON.stringify(name)},arrayBuffer:async()=>new ArrayBuffer(0)})`;
test('file names containing primli are classified as a primli list, never as prices or BIP',t=>{
 const h=setup(t);
 for(const n of ['Bosch Ekim 2026 Primli Liste.xlsx','SIEMENS EKİM PRİMLİ ÜRÜNLER.xlsx','bosch_primli_ekim.xlsx'])assert.equal(h.run(`tclassify(${JSON.stringify(n)}).kind`),'primli',n);
 assert.equal(h.run(`tclassify('BOSCH EKİM FİYAT FARKLARI.xlsx').kind`),'fiyat');
 assert.equal(h.run(`tclassify('Bosch Ekim 2026 Phase Out Tav. Ed. Per. Fiyat Listesi.xlsx').kind`),'phaseout');
 assert.equal(h.run(`tclassify('Bosch Mars Stok.xlsx').kind`),'stok');
});
test('monthly update refuses a primli file and keeps the upload button disabled',async t=>{
 const h=setup(t);
 await h.run(`topluTara([${dosya('Bosch Ekim Primli Liste.xlsx')}])`);
 assert.equal(h.run('window.topluItems[0].ok'),false);assert.equal(h.run('window.__yazildi'),0);
 assert.match(h.run('window.topluItems[0].detay'),/PRİMLİ listesi/);
 assert.equal(h.w.document.getElementById('topluYaz').disabled,true);
 assert.match(h.w.document.getElementById('topluSonuc').textContent,/primli listesi/);
 assert.equal(h.w.document.querySelector('#topluSonuc button'),null);
 await h.run(`topluTara([${dosya('BOSCH EKİM FİYAT FARKLARI.xlsx')}])`);
 assert.equal(h.run('window.topluItems[0].ok'),true);assert.equal(h.run('window.__yazildi'),1);
});
test('dealer panel and the separate upload boxes refuse primli files too',async t=>{
 const h=setup(t);
 await h.run(`bpTara([${dosya('Siemens Ekim PRİMLİ.xlsx')}])`);
 assert.equal(h.run('window.bpItems[0].ok'),false);assert.equal(h.run('window.__yazildi'),0);
 assert.match(h.w.document.getElementById('bpSonuc').textContent,/PRİMLİ listesi/);
 assert.equal(h.run(`fqPrimliDosyaVar([{name:'Bosch Ekim Primli.xlsx'}])`),true);
 assert.equal(h.run(`fqPrimliDosyaVar([{name:'BOSCH EKİM FİYAT FARKLARI.xlsx'}])`),false);
 h.run(`(()=>{const b=document.createElement('div');b.innerHTML='<input id="bip_file" type="file"><div id="bip_msg"></div>';document.body.appendChild(b);Object.defineProperty(document.getElementById('bip_file'),'files',{value:[{name:'Bosch Ekim Primli.xlsx'}]});})()`);
 await h.run(`smartScan('bip')`);
 assert.match(h.w.document.getElementById('bip_msg').textContent,/PRİMLİ listesi/);assert.match(h.w.document.getElementById('bip_msg').className,/bad/);
});
