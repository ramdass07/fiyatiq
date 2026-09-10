const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness}=require('./harness.cjs');
const row=(id,extra={})=>({id:String(id),no:'FQ-'+id,tarih:'2026-09-10T21:30:00.000Z',magaza:'Test mağaza',personel:'Satıcı',musteri:'Müşteri',tel:'5551112233',marka:'bosch',toplam:1000,durum:'teklif',urunler:'TEST1',gercek_satis_tutari:null,satis_odeme_sekli:null,satis_banka:null,satis_taksit_sayisi:null,satis_tarihi:null,...extra});
const summary=(extra={})=>({quote_count:1201,cash_total:1201000,average_cash:1000,sold_count:12,sold_cash_total:12000,conversion_rate:12/1201*100,actual_sale_count:10,actual_sale_total:11000,missing_actual_count:2,...extra});
const report=(rows=[],extra={})=>({rows,total_count:rows.length,summary:summary(),stores:['Test mağaza'],report_revision:'revision-a',...extra});
const saleReport=(rows=[],extra={})=>({rows,total_count:rows.length,summary:{sale_count:rows.length,actual_sale_total:0,average_actual_sale:0},stores:['Test mağaza'],undated_sales_count:0,report_revision:'sales-revision-a',...extra});
function setup(t){
 const h=harness(t);if(h.run("typeof fqAdminReport==='undefined'"))h.run(fs.readFileSync(path.join(__dirname,'../js/yonetim-raporu.js'),'utf8'));h.run("profil.rol='admin'");
 const calls=[],writes=[],sheets=[];
 h.w.__sb.rpc=async(name,args)=>{calls.push({name,args});return {data:report(),error:null};};
 h.w.XLSX={utils:{book_new:()=>({}),aoa_to_sheet:data=>{sheets.push(data);return {};},book_append_sheet:()=>{}},writeFile:(workbook,name)=>writes.push({workbook,name})};
 return {...h,rpcCalls:calls,writes,sheets,respondRPC:fn=>{h.w.__sb.rpc=async(name,args)=>{calls.push({name,args});return fn(args,calls.length,name);};}};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('admin list uses server pages beyond 1000 with a full-scope summary independent of status',async t=>{
 const h=setup(t);h.run("$('tfDurum').value='satildi';$('tfBas').value='2026-09-01';$('tfBit').value='2026-09-30';fqAdminReport.page=20");
 h.respondRPC(args=>({data:report([row('1001',{durum:'satildi'})],{total_count:1201,summary:summary({quote_count:2000,sold_count:1201,conversion_rate:60.05})}),error:null}));
 await h.run('fqLoadAdminQuotes()');
 assert.deepEqual(plain(h.rpcCalls[0]),{name:'fq_teklif_raporu',args:{p_ara:'',p_baslangic:'2026-09-01',p_bitis:'2026-09-30',p_magaza:null,p_durum:'satildi',p_page:20,p_page_size:50}});
 assert.match(h.run("$('fqAdminPage').textContent"),/1001–1050 \/ 1201/);
 assert.match(h.run("$('tfOzet').textContent"),/2000/);assert.match(h.run("$('tfOzet').textContent"),/%60,1/);assert.doesNotMatch(h.run("$('tfOzet').textContent"),/%100/);
 assert.match(h.run("$('tekliflerList').textContent"),/11\.09\.2026.*00:30/s);assert.equal(h.run("$('fqAdminPrev').disabled"),false);assert.equal(h.run("$('fqAdminNext').disabled"),false);
});
test('failed refresh removes previous customer rows and totals and leaves retry controls usable',async t=>{
 const h=setup(t);h.respondRPC(()=>({data:report([row('old',{musteri:'Özel müşteri'})]),error:null}));await h.run('fqLoadAdminQuotes()');
 h.respondRPC(()=>({data:null,error:{message:'internal detail'}}));await h.run('fqLoadAdminQuotes()');
 assert.equal(h.run("$('tfOzet').textContent"),'');assert.doesNotMatch(h.run("$('tekliflerList').textContent"),/Özel müşteri/);assert.match(h.run("$('tekliflerMsg').textContent"),/Rapor alınamadı/);assert.equal(h.run('fqAdminReport.loading'),false);
 h.respondRPC(()=>({data:report([row('new')]),error:null}));await h.run('fqLoadAdminQuotes()');assert.match(h.run("$('tekliflerList').textContent"),/FQ-new/);
});
test('debounced filters immediately clear stale data and discard older in-flight responses',async t=>{
 const h=setup(t);let release,timer;
 h.respondRPC(()=>new Promise(resolve=>{release=resolve;}));const pending=h.run('fqLoadAdminQuotes()');
 h.w.setTimeout=fn=>{timer=fn;return 10;};h.run("$('tfAra').value='Yeni müşteri';fqAdminReportSearch()");
 release({data:report([row('old',{musteri:'Eski özel müşteri'})]),error:null});await pending;
 assert.doesNotMatch(h.run("$('tekliflerList').textContent"),/Eski özel müşteri/);assert.equal(h.run('fqAdminReport.page'),0);
 h.respondRPC(args=>({data:report([row('new',{musteri:args.p_ara})]),error:null}));await timer();await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.run("$('tekliflerList').textContent"),/Yeni müşteri/);assert.equal(h.rpcCalls[1].args.p_ara,'Yeni müşteri');
});
test('logout and permission change prevent delayed reporting responses from restoring private data',async t=>{
 const h=setup(t);let release;h.respondRPC(()=>new Promise(resolve=>{release=resolve;}));const pending=h.run('fqLoadAdminQuotes()');
 h.run("fqResetAdminReport();authUid=null;profil.rol='bayi'");release({data:report([row('private')]),error:null});await pending;
 assert.equal(h.run("$('tekliflerList').textContent"),'');assert.equal(h.run("$('tfOzet').textContent"),'');assert.equal(h.run('fqAdminReport.rows.length'),0);
 await h.run('fqLoadAdminQuotes()');assert.equal(h.rpcCalls.length,1);assert.equal(h.run("$('tfMagaza').options.length"),1);
});
test('unknown sale amount is distinct from a confirmed zero, and output escapes raw report values',async t=>{
 const h=setup(t);h.respondRPC(()=>({data:report([row('zero',{durum:'satildi',gercek_satis_tutari:0,satis_odeme_sekli:'nakit',satis_tarihi:'2026-09-11'}),row('unknown',{durum:'satildi'}),row('x" onmouseover="evil',{magaza:'<img src=x onerror=evil>',musteri:'<script>evil()</script>',satis_banka:'<img>',urunler:'<svg onload=evil>'})],{stores:['<img src=x onerror=evil>']}),error:null}));
 await h.run('fqLoadAdminQuotes()');const rows=h.w.document.querySelectorAll('#tekliflerList tr');
 assert.equal(rows[0].children[7].textContent,'0 ₺');assert.equal(rows[1].children[7].textContent,'Girilmedi');assert.match(rows[0].children[8].textContent,/Nakit.*11\.09\.2026/);assert.equal(h.run('fqAdminReportMoney(1234.56)'),'1.234,56 ₺');
 assert.equal(h.w.document.querySelectorAll('#tekliflerList img,#tekliflerList script,#tekliflerList svg,#tekliflerList [onmouseover]').length,0);assert.equal(h.w.document.querySelectorAll('#tfMagaza img').length,0);
});
test('invalid date order does not issue a server query and retains an explicit correction message',async t=>{
 const h=setup(t);h.run("$('tfBas').value='2026-09-30';$('tfBit').value='2026-09-01'");await h.run('fqLoadAdminQuotes()');
 assert.equal(h.rpcCalls.length,0);assert.match(h.run("$('tekliflerMsg').textContent"),/başlangıç tarihi bitiş tarihinden sonra/);assert.equal(h.run('fqAdminReport.loading'),false);
});
test('Excel exports all 1201 matches, includes report context and neutralizes formula-like text',async t=>{
 const h=setup(t),records=Array.from({length:1201},(_,i)=>row(i,{musteri:i===0?' =HYPERLINK("bad")':'Müşteri',tel:'+905551112233',durum:i<2?'satildi':'teklif',gercek_satis_tutari:i===0?0:null,satis_odeme_sekli:i===0?'nakit':null,satis_tarihi:i===0?'2026-09-10':null}));
 h.run("$('tfAra').value=' TEST ';$('tfBas').value='2026-09-01';$('tfBit').value='2026-09-30';$('tfDurum').value='satildi'");
 h.respondRPC(args=>({data:report(records.slice(args.p_page*args.p_page_size,(args.p_page+1)*args.p_page_size),{total_count:records.length}),error:null}));await h.run('fqExportAdminQuotes()');
 assert.deepEqual(h.rpcCalls.map(call=>call.args.p_page),[0,1,2,0]);assert.ok(h.rpcCalls.every(call=>call.args.p_page_size===500&&call.args.p_ara==='TEST'&&call.args.p_durum==='satildi'&&call.args.p_baslangic==='2026-09-01'));
 assert.equal(h.writes.length,1);assert.equal(h.sheets[0].length,1202);assert.equal(h.sheets[0][1][4],'\' =HYPERLINK("bad")');assert.equal(h.sheets[0][1][5],"'+905551112233");assert.equal(h.sheets[0][1][10],0);assert.equal(h.sheets[0][2][10],'Girilmedi');
 assert.ok(h.sheets[1].some(row=>String(row[1]).includes('tahsilat bilgisi değildir')));assert.match(h.run("$('tekliflerMsg').textContent"),/1201 teklif Excel dosyasına aktarıldı/);assert.equal(h.run('fqAdminReport.exporting'),false);
});
test('Excel does not create a partial file when a later page fails',async t=>{
 const h=setup(t);h.respondRPC(args=>args.p_page===0?{data:report(Array.from({length:500},(_,i)=>row(i)),{total_count:501}),error:null}:{data:null,error:{message:'network'}});
 await h.run('fqExportAdminQuotes()');assert.equal(h.writes.length,0);assert.equal(h.sheets.length,0);assert.match(h.run("$('tekliflerMsg').textContent"),/Excel hazırlanamadı/);assert.equal(h.run("$('fqAdminExport').disabled"),false);
});
test('Excel rejects same-count mutations detected in the final revision recheck',async t=>{
 const h=setup(t);h.respondRPC((args,call)=>({data:report([row('one')],{report_revision:call===1?'revision-a':'revision-b'}),error:null}));await h.run('fqExportAdminQuotes()');
 assert.equal(h.rpcCalls.length,2);assert.equal(h.writes.length,0);assert.match(h.run("$('tekliflerMsg').textContent"),/Aktarım sırasında teklifler değişti/);
});
test('Excel rejects inconsistent counts and duplicate row identities between pages',async t=>{
 const h=setup(t);h.respondRPC(args=>({data:report(args.p_page===0?Array.from({length:500},(_,i)=>row(i)):[row(0)],{total_count:501}),error:null}));await h.run('fqExportAdminQuotes()');
 assert.equal(h.writes.length,0);assert.match(h.run("$('tekliflerMsg').textContent"),/kayıt sırası değişti/);
 h.respondRPC(args=>({data:report(args.p_page===0?Array.from({length:500},(_,i)=>row(i)):[row(500)],{total_count:args.p_page===0?501:502}),error:null}));await h.run('fqExportAdminQuotes()');assert.equal(h.writes.length,0);assert.match(h.run("$('tekliflerMsg').textContent"),/teklifler değişti/);
});
test('Excel captures the filters and cancels when they change during a request',async t=>{
 const h=setup(t);let release;h.run("$('tfAra').value='ilk arama'");h.respondRPC(()=>new Promise(resolve=>{release=resolve;}));const pending=h.run('fqExportAdminQuotes()');
 h.run("$('tfAra').value='ikinci arama'");release({data:report([row('first')]),error:null});await pending;
 assert.equal(h.rpcCalls[0].args.p_ara,'ilk arama');assert.equal(h.writes.length,0);assert.match(h.run("$('tekliflerMsg').textContent"),/Filtre veya oturum değiştiği/);assert.equal(h.run('fqAdminReport.exporting'),false);
});
test('duplicate export clicks issue one request, and logout clears export state without private results',async t=>{
 const h=setup(t);let release;h.respondRPC(()=>new Promise(resolve=>{release=resolve;}));const pending=h.run('fqExportAdminQuotes()');await h.run('fqExportAdminQuotes()');assert.equal(h.rpcCalls.length,1);
 h.run("fqResetAdminReport();authUid=null");release({data:report([row('private')]),error:null});await pending;
 assert.equal(h.writes.length,0);assert.equal(h.run('fqAdminReport.exporting'),false);assert.equal(h.run("$('tekliflerMsg').textContent"),'');
});

test('sales mode defaults to the Istanbul month and uses only the sales RPC filters',async t=>{
 const h=setup(t);h.run("Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-08-31T21:30:00Z']));}}; $('tfAra').value=' Müşteri ';$('tfDurum').value='kaybedildi';$('tfBas').value='2026-08-01';$('tfBit').value='2026-08-31'");
 h.respondRPC(()=>({data:saleReport([row('sold',{tarih:'2026-08-10T10:00:00Z',durum:'satildi',satis_tarihi:'2026-09-01',gercek_satis_tutari:1000.55,satis_odeme_sekli:'kart'})],{summary:{sale_count:1,actual_sale_total:1000.55,average_actual_sale:1000.55},undated_sales_count:4}),error:null}));
 await h.run("fqAdminReportMode('sales')");
 assert.deepEqual(plain(h.rpcCalls[0]),{name:'fq_satis_raporu',args:{p_ara:'Müşteri',p_baslangic:'2026-09-01',p_bitis:'2026-09-30',p_magaza:null,p_page:0,p_page_size:50}});
 assert.equal(h.run("$('fqAdminMode').value"),'sales');assert.equal(h.run("$('tfDurum').disabled"),true);assert.equal(h.run("$('tfDurum').closest('.fld').hidden"),true);
 assert.equal(h.w.document.querySelector('label[for="tfBas"]').textContent,'Satış başlangıç tarihi');assert.equal(h.w.document.querySelector('#gridWrap2 th:nth-child(2)').textContent,'Satış tarihi');
 assert.equal(h.w.document.querySelector('#tekliflerList td:nth-child(2)').textContent,'01.09.2026');assert.match(h.run("$('tfOzet').textContent"),/1\.000,55 ₺/);assert.doesNotMatch(h.run("$('tfOzet').textContent"),/Dönüşüm|Peşin teklif/);
 assert.match(h.run("$('fqAdminUndatedNote').textContent"),/4 “Satıldı”/);assert.match(h.run("$('fqAdminUndatedNote').textContent"),/tüm dönemlerdeki.*seçili ayın satış sayısı değildir/s);assert.equal(h.run("$('fqAdminUndatedNote').hidden"),false);assert.match(h.run("$('fqAdminPage').textContent"),/1 satış/);
});
test('each report mode preserves its own filters and monthly shortcuts handle year and leap boundaries',async t=>{
 const h=setup(t);h.run("Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-01-10T12:00:00Z']));}}; $('tfAra').value='Teklif müşterisi';$('tfDurum').value='kaybedildi';$('tfBas').value='2025-08-01';$('tfBit').value='2025-08-31';fqAdminReportStores(['Teklif mağazası']);$('tfMagaza').value='Teklif mağazası'");
 h.respondRPC((args,call,name)=>({data:name==='fq_satis_raporu'?saleReport():report(),error:null}));await h.run("fqAdminReportMode('sales')");
 h.run("$('tfAra').value='Satış müşterisi'");await h.run('fqAdminReportMonth(-1)');assert.equal(h.rpcCalls.at(-1).args.p_baslangic,'2025-12-01');assert.equal(h.rpcCalls.at(-1).args.p_bitis,'2025-12-31');
 await h.run("fqAdminReportMode('quotes')");assert.deepEqual(plain(h.run('fqAdminReportFilters()')),{p_ara:'Teklif müşterisi',p_baslangic:'2025-08-01',p_bitis:'2025-08-31',p_magaza:'Teklif mağazası',p_durum:'kaybedildi'});assert.equal(h.run("$('tfDurum').disabled"),false);assert.equal(h.run("$('fqAdminMonths').hidden"),true);
 await h.run("fqAdminReportMode('sales')");assert.equal(h.rpcCalls.at(-1).args.p_ara,'Satış müşterisi');assert.equal(h.rpcCalls.at(-1).args.p_baslangic,'2025-12-01');assert.equal(h.run("$('tfDurum').value"),'');
 assert.deepEqual(plain(h.run("fqAdminReportMonthDates(-1,new Date('2024-03-01T00:00:00Z'))")),{p_baslangic:'2024-02-01',p_bitis:'2024-02-29'});
 await h.run('fqAdminReportMonth(0)');assert.equal(h.rpcCalls.at(-1).args.p_baslangic,'2026-01-01');await h.run('fqAdminReportReset()');assert.equal(h.rpcCalls.at(-1).args.p_ara,'');assert.equal(h.rpcCalls.at(-1).args.p_magaza,null);assert.equal(h.rpcCalls.at(-1).args.p_baslangic,'2026-01-01');
});
test('mode changes discard old quote responses even after returning to the original mode',async t=>{
 const h=setup(t);let release;h.respondRPC(()=>new Promise(resolve=>{release=resolve;}));const pending=h.run('fqLoadAdminQuotes()');
 h.respondRPC((args,call,name)=>({data:name==='fq_satis_raporu'?saleReport([row('sale',{durum:'satildi',satis_tarihi:'2026-09-10'})]):report([row('fresh')]),error:null}));
 await h.run("fqAdminReportMode('sales')");await h.run("fqAdminReportMode('quotes')");release({data:report([row('stale',{musteri:'Eski müşteri'})]),error:null});await pending;
 assert.match(h.run("$('tekliflerList').textContent"),/FQ-fresh/);assert.doesNotMatch(h.run("$('tekliflerList').textContent"),/Eski müşteri|FQ-sale/);assert.equal(h.run('fqAdminReport.loading'),false);
});
test('sales export retrieves all matches with sale dates and cross-period missing-date context',async t=>{
 const h=setup(t),records=Array.from({length:1001},(_,i)=>row(i,{tarih:'2026-08-10T10:00:00Z',durum:'satildi',gercek_satis_tutari:i===0?0:1234.56,satis_odeme_sekli:'nakit',satis_tarihi:'2026-09-05',musteri:i===0?'=FORMULA()':'Müşteri'}));
 h.respondRPC(args=>({data:saleReport(records.slice(args.p_page*args.p_page_size,(args.p_page+1)*args.p_page_size),{total_count:1001,summary:{sale_count:1001,actual_sale_total:1234560,average_actual_sale:1234560/1001},undated_sales_count:3}),error:null}));await h.run("fqAdminReportMode('sales')");h.rpcCalls.length=0;
 h.run("$('tfBas').value='2026-09-01';$('tfBit').value='2026-09-30';$('tfDurum').value='kaybedildi'");await h.run('fqExportAdminQuotes()');
 assert.deepEqual(h.rpcCalls.map(call=>call.args.p_page),[0,1,2,0]);assert.ok(h.rpcCalls.every(call=>call.name==='fq_satis_raporu'&&call.args.p_page_size===500&&!Object.hasOwn(call.args,'p_durum')));assert.equal(h.writes.length,1);assert.match(h.writes[0].name,/^Gerceklesen_Satislar_/);
 const table=h.sheets[0],context=h.sheets[1];assert.equal(table.length,1002);assert.equal(table[0][1],'Satış tarihi');assert.equal(table[1][1],'05.09.2026');assert.equal(table[0][14],'Teklif tarihi (Türkiye)');assert.match(table[1][14],/10\.08\.2026/);assert.equal(table[1][4],"'=FORMULA()");assert.equal(table[1][10],0);assert.equal(table[2][10],1234.56);
 assert.ok(context.some(r=>r[0]==='Satış tarihi eksik veya geçersiz kayıt'&&r[1]===3));assert.ok(context.some(r=>String(r[1]).includes('Tüm dönemlerdeki')));assert.ok(context.some(r=>r[0]==='Tablodaki durum'&&r[1]==='Satıldı'));assert.ok(!context.some(r=>String(r[0]).includes('Dönüşüm')));assert.match(h.run("$('tekliflerMsg').textContent"),/1001 satış Excel dosyasına aktarıldı/);
});
test('switching report modes cancels a pending export without stale status or a file',async t=>{
 const h=setup(t);let release;h.respondRPC(()=>new Promise(resolve=>{release=resolve;}));const pending=h.run('fqExportAdminQuotes()');
 h.respondRPC(()=>({data:saleReport([row('fresh',{durum:'satildi',satis_tarihi:'2026-09-10'})]),error:null}));await h.run("fqAdminReportMode('sales')");assert.equal(h.run('fqAdminReport.exporting'),false);
 release({data:report([row('private')]),error:null});await pending;assert.equal(h.writes.length,0);assert.equal(h.run("$('tekliflerMsg').textContent"),'');assert.match(h.run("$('tekliflerList').textContent"),/FQ-fresh/);assert.equal(h.run("$('fqAdminExport').disabled"),false);
});
test('sales view rejects incomplete summaries, shows confirmed zero amounts, and clears undated notes on errors',async t=>{
 const h=setup(t);h.respondRPC(()=>({data:saleReport([row('zero',{durum:'satildi',gercek_satis_tutari:0,satis_tarihi:'2026-09-10',satis_odeme_sekli:'nakit'})],{undated_sales_count:7}),error:null}));await h.run("fqAdminReportMode('sales')");
 assert.match(h.run("$('tfOzet').textContent"),/Gerçekleşen satış toplamı0 ₺/);assert.equal(h.w.document.querySelector('#tekliflerList td:nth-child(8)').textContent,'0 ₺');
 h.respondRPC(()=>({data:saleReport([],{undated_sales_count:null}),error:null}));await h.run('fqLoadAdminQuotes()');assert.match(h.run("$('tekliflerMsg').textContent"),/Satış tarihi eksik kayıtların sayısı alınamadı/);assert.equal(h.run("$('fqAdminUndatedNote').textContent"),'');assert.equal(h.run("$('fqAdminUndatedNote').hidden"),true);assert.equal(h.run("$('tfOzet').textContent"),'');
 h.respondRPC(()=>({data:saleReport([],{summary:{sale_count:0,actual_sale_total:0}}),error:null}));await h.run('fqExportAdminQuotes()');assert.equal(h.writes.length,0);assert.match(h.run("$('tekliflerMsg').textContent"),/Rapor özeti eksik/);
});
test('sales exports reject a concurrent revision change and role changes hide delayed results',async t=>{
 const h=setup(t);h.respondRPC(()=>({data:saleReport([row('one',{durum:'satildi',satis_tarihi:'2026-09-10'})]),error:null}));await h.run("fqAdminReportMode('sales')");h.rpcCalls.length=0;
 h.respondRPC((args,call)=>({data:saleReport([row('one',{durum:'satildi',satis_tarihi:'2026-09-10'})],{report_revision:call===1?'revision-a':'revision-b'}),error:null}));await h.run('fqExportAdminQuotes()');assert.equal(h.writes.length,0);assert.match(h.run("$('tekliflerMsg').textContent"),/Aktarım sırasında satışlar değişti/);
 let release;h.respondRPC(()=>new Promise(resolve=>{release=resolve;}));const pending=h.run('fqLoadAdminQuotes()');h.run("profil.rol='bayi'");release({data:saleReport([row('private')]),error:null});await pending;assert.doesNotMatch(h.run("$('tekliflerList').textContent"),/private/);
 h.run('fqResetAdminReport()');assert.equal(h.run('fqAdminReport.mode'),'quotes');assert.deepEqual(plain(h.run('fqAdminReport.filters')),{quotes:null,sales:null});assert.equal(h.run("$('fqAdminMode').value"),'quotes');assert.equal(h.run("$('fqAdminUndatedNote').textContent"),'');
});
