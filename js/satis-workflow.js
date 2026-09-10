/* FiyatIQ v11.5: account recovery and store-scoped quote workflow. */
'use strict';
const fqFlow={ready:false,restoring:false,busy:false,review:false,timer:null,baseline:'',savedCustomer:null,draftId:null,listRequest:0,page:0,starting:null};
const FQ_CUSTOMER_IDS=['mAd','mTel','satisPersonel','mGsm2','mTC','mEmail','mSipT','mSevkT','mTesT','mIleriT','mOdeme','mCikisDepo','mIlceIl','mSevkAdres','mUnvan','mFaturaAdres','mVergiNo','mVergiD'];
const FQ_INPUT_IDS=['karOrani','banka','taksit','elleBanka','elleOran','mtPesin','mtTaksit'];
const FQ_ROW_KEYS=['kod','adet','isET','etToptan','manuelFiyat','manuelTaksit','nakitSecili'];
const FQ_DRAFT_PREFIX='fq_draft_v115:';
let fqRecoveryMode=false,fqRecoveryVerified=false,fqRecoveryUid=null,fqResetBusy=false;

document.head.insertAdjacentHTML('beforeend',`<style>
 .fq-dialog{width:min(880px,94vw);max-height:88vh;overflow:auto;background:var(--panel);color:var(--txt);border:1px solid var(--line);border-radius:14px;padding:22px}
 .fq-dialog::backdrop{background:#020617b8}.fq-dialog h2{margin-top:0}.fq-dialog p{line-height:1.55}.fq-dialog button,.fq-dialog input{font-size:14px}
 .fq-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:18px}.fq-list{display:grid;gap:10px;margin-top:14px}
 .fq-item{padding:14px;border:1px solid var(--line);border-radius:10px;overflow-wrap:anywhere}.fq-item .row{justify-content:space-between}
 #fqDraftStatus{min-height:18px}#fqReviewBox[hidden]{display:none}.fq-auth-label{display:block;font-size:14px}
 @media(max-width:600px){.fq-dialog{padding:16px}.fq-item .fq-actions{justify-content:flex-start}.sale-tools{flex-wrap:wrap}#myQuotesSearch{width:100%!important}}
 </style>`);
document.body.insertAdjacentHTML('beforeend',`
 <dialog id="fqResetDialog" class="fq-dialog" aria-labelledby="fqResetTitle" style="max-width:460px">
 <h2 id="fqResetTitle">Şifremi unuttum</h2><p>Kayıtlı e-posta adresine şifre yenileme bağlantısı iste.</p>
 <label class="fq-auth-label" for="fqResetEmail">E-posta</label><input id="fqResetEmail" type="email" autocomplete="email" style="width:100%">
 <p id="fqResetMessage" role="status"></p><div class="fq-actions"><button class="ghost" onclick="$('fqResetDialog').close()">Kapat</button><button id="fqResetSend" onclick="fqSendReset()">Bağlantı iste</button></div></dialog>
 <div id="fqRecoveryView" class="login" style="display:none"><h1 class="brand">fiyat<span class="q">iq</span></h1>
 <div class="card"><h2>Yeni şifre belirle</h2><p id="fqRecoveryMessage" role="status">Bağlantı doğrulanıyor…</p>
 <label for="fqNewPassword">Yeni şifre (en az 8 karakter)</label><input id="fqNewPassword" type="password" autocomplete="new-password" minlength="8">
 <label for="fqNewPasswordAgain">Yeni şifre tekrar</label><input id="fqNewPasswordAgain" type="password" autocomplete="new-password" minlength="8">
 <button id="fqPasswordSave" onclick="fqUpdatePassword()" disabled>Şifreyi yenile</button>
 <button class="ghost" onclick="fqLeaveRecovery()">Giriş ekranına dön</button>
 <button class="ghost" onclick="fqShowReset()">Yeni bağlantı iste</button></div></div>
 <dialog id="fqNewDialog" class="fq-dialog" aria-labelledby="fqNewTitle" style="max-width:540px"><h2 id="fqNewTitle">Yeni teklif</h2>
 <p>Mevcut müşteri ve sipariş bilgileri temizlenir. Yeni teklif ayrı bir numarayla açılır.</p><p id="fqNewMessage" role="status"></p>
 <div class="fq-actions"><button class="ghost" onclick="$('fqNewDialog').close()">Vazgeç</button><button id="fqKeepNew" onclick="fqNewWithDraft()">Taslağı tut ve yeni aç</button><button class="ghost" onclick="fqNewDiscard()">Bu çalışmayı bırak ve yeni aç</button></div></dialog>
 <dialog id="fqMyQuotes" class="fq-dialog" aria-labelledby="fqMyQuotesTitle" onclose="fqFlow.listRequest++"><div class="sale-heading"><h2 id="fqMyQuotesTitle">Tekliflerim</h2><button class="ghost" onclick="$('fqMyQuotes').close()">Kapat</button></div>
 <p class="mut">Bu mağaza hesabıyla kaydedilen teklifler. İncele, kayıtlı fiyatları gösterir; yeni kopya güncel fiyatlarla hesaplanır.</p>
 <div class="row"><label for="myQuotesSearch">Müşteri / telefon / teklif no</label><input id="myQuotesSearch" style="width:280px" maxlength="100" onkeydown="if(event.key==='Enter')fqMySearch()"><button onclick="fqMySearch()">Ara</button></div>
 <p id="fqMyMessage" role="status"></p><div id="fqMyList" class="fq-list"></div><div class="fq-actions"><button id="fqMyPrev" class="ghost" onclick="fqMyPage(-1)">Önceki</button><span id="fqMyPage"></span><button id="fqMyNext" class="ghost" onclick="fqMyPage(1)">Sonraki</button></div></dialog>
 <dialog id="fqDraftDialog" class="fq-dialog" aria-labelledby="fqDraftTitle"><div class="sale-heading"><h2 id="fqDraftTitle">Taslaklar</h2><button class="ghost" onclick="$('fqDraftDialog').close()">Kapat</button></div>
 <p>Bu tarayıcıda, bu mağaza hesabına ait son 7 günlük çalışmalar. Başka cihazda görünmez; tarayıcı verileri silinirse kaybolur. Kalıcı kayıt için Teklifi Kaydet kullan.</p>
 <p class="mut">TC kimlik numarası taslakta tutulmaz. Geri yüklemede fiyat, stok ve kampanyalar yeniden sorgulanır.</p><p id="fqDraftMessage" role="status"></p><div id="fqDraftList" class="fq-list"></div></dialog>
`);

function fqAuthMessage(text){$('loginErr').textContent=text;}
function fqAuthError(error){
 const code=error&&error.code;
 if(code==='invalid_credentials')return 'E-posta veya şifre doğru değil. Kontrol et ya da Şifremi unuttum seçeneğini kullan.';
 if(code==='email_not_confirmed')return 'E-posta adresin henüz doğrulanmamış. Gelen kutunu kontrol et.';
 if(code==='over_request_rate_limit'||code==='over_email_send_rate_limit'||error&&error.status===429)return 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.';
 if(code==='same_password')return 'Öncekinden farklı bir şifre belirle.';
 if(code==='weak_password')return 'Daha güçlü bir şifre seç: uzunluğu artır, harf ve rakam kullan.';
 return 'İşlem tamamlanamadı. Bilgilerini ve internet bağlantını kontrol ederek tekrar dene.';
}
function fqShowReset(){const d=$('fqResetDialog');$('fqResetEmail').value=$('email').value.trim();$('fqResetMessage').textContent='';if(!d.open)d.showModal();$('fqResetEmail').focus();}
async function fqSendReset(){
 if(fqResetBusy)return;const input=$('fqResetEmail'),msg=$('fqResetMessage'),button=$('fqResetSend');
 if(!input.value.trim()||!input.checkValidity()){msg.textContent='Geçerli bir e-posta adresi yaz.';input.focus();return;}
 fqResetBusy=true;button.disabled=true;msg.textContent='Bağlantı isteniyor…';
 try{const {error}=await sb.auth.resetPasswordForEmail(input.value.trim(),{redirectTo:'https://fiyatiq.com/'});if(error)throw error;
 msg.textContent='Bu adresle bir hesap varsa şifre yenileme bağlantısı gönderilecek. Gelen kutunu ve gereksiz klasörünü kontrol et.';
 }catch(e){msg.textContent=fqAuthError(e);}finally{fqResetBusy=false;button.disabled=false;}
}
function fqShowRecovery(){show('fqRecoveryView');$('fqRecoveryView').style.display='block';}
function fqAuthPrepare(){const hash=new URLSearchParams(location.hash.slice(1));fqRecoveryMode=hash.get('type')==='recovery'||hash.has('error');if(fqRecoveryMode)fqShowRecovery();}
function fqCleanAuthUrl(){history.replaceState(null,'',location.pathname+location.search);}
function fqRecoverySession(session){
 fqRecoveryMode=true;fqRecoveryVerified=!!session;fqRecoveryUid=session&&session.user.id;
 fqDraftFlush();fqResetSession();appReady=false;
 if(fqRecoveryUid)try{sessionStorage.setItem('fq_recovery_pending',fqRecoveryUid);}catch(e){}
 fqShowRecovery();fqRecoveryReady(session);fqCleanAuthUrl();
}
function fqRecoveryReady(session,error){
 let marker=null;try{marker=sessionStorage.getItem('fq_recovery_pending');}catch(e){}
 if(session&&marker===session.user.id){fqRecoveryMode=true;fqRecoveryVerified=true;fqRecoveryUid=session.user.id;}
 if(!fqRecoveryMode)return;
 fqShowRecovery();const ok=!error&&!!session&&fqRecoveryVerified&&fqRecoveryUid===session.user.id;
 $('fqPasswordSave').disabled=!ok;
 $('fqRecoveryMessage').textContent=ok?'Yeni şifreni iki alana da yaz.':'Bağlantı geçersiz veya süresi dolmuş. Yeni bir şifre yenileme bağlantısı iste.';
 fqCleanAuthUrl();
}
async function fqUpdatePassword(){
 const button=$('fqPasswordSave');if(button.disabled)return;
 const password=$('fqNewPassword').value,again=$('fqNewPasswordAgain').value,msg=$('fqRecoveryMessage');
 if(password.length<8){msg.textContent='Şifren en az 8 karakter olmalı.';return;}if(password!==again){msg.textContent='İki şifre aynı olmalı.';return;}
 button.disabled=true;
 try{const {data:{user},error:authError}=await sb.auth.getUser();if(authError||!fqRecoveryVerified||!user||user.id!==fqRecoveryUid)throw Error('expired');
 const {error}=await sb.auth.updateUser({password});if(error)throw error;
 $('fqNewPassword').value='';$('fqNewPasswordAgain').value='';await fqLeaveRecovery();fqAuthMessage('Şifren yenilendi. Yeni şifrenle giriş yapabilirsin.');
 }catch(e){msg.textContent=e.message==='expired'?'Bağlantı geçersiz. Yeni bağlantı iste.':fqAuthError(e);button.disabled=false;}
}
async function fqLeaveRecovery(){
 fqRecoveryVerified=false;fqRecoveryUid=null;try{sessionStorage.removeItem('fq_recovery_pending');}catch(e){}
 await sb.auth.signOut({scope:'local'});fqRecoveryMode=false;appReady=false;fqResetSession();$('fqRecoveryView').style.display='none';$('fqNewPassword').value='';$('fqNewPasswordAgain').value='';showLogin();show('loginView');fqCleanAuthUrl();
}
async function fqStartSession(session){
 if(fqRecoveryMode)return;
 let marker=null;try{marker=sessionStorage.getItem('fq_recovery_pending');}catch(e){}
 if(marker===session.user.id){fqRecoveryMode=true;fqRecoveryReady(session);return;}
 if(appReady&&authUid===session.user.id)return;
 if(fqFlow.starting)return fqFlow.starting;
 fqFlow.starting=showApp(session).catch(fqLoadFail);try{await fqFlow.starting;}finally{fqFlow.starting=null;}
}

function fqCustomerFields(){return Object.fromEntries(FQ_CUSTOMER_IDS.map(id=>[id,($(id)||{}).value||'']));}
function fqCustomerKey(){return JSON.stringify([$('mAd').value.trim(),$('mTel').value.replace(/\D/g,'')]);}
function fqClearCustomer(){for(const id of FQ_CUSTOMER_IDS){if(id!=='satisPersonel'&&$(id))$(id).value='';}if($('mSipT'))$('mSipT').value=_bugun();}
function fqCapture(){
 const fields=fqCustomerFields();delete fields.mTC;
 // Preserve the focused field even if the browser closes before its change/blur event.
 const rows=quoteRows.map(r=>({...r})),active=document.activeElement;
 if(active&&active.dataset.fqRow!=null){const row=rows[Number(active.dataset.fqRow)],key=active.dataset.fqField;
  if(row&&FQ_ROW_KEYS.includes(key)){const value=key==='kod'?active.value.trim().toUpperCase():trSayi(active.value);
   if(key==='kod'||Number.isFinite(value)&&(key!=='adet'||value>0))row[key]=value;}}

 return {version:1,brand,fields,inputs:Object.fromEntries(FQ_INPUT_IDS.map(id=>[id,($(id)||{}).value||''])),rows:rows.filter(r=>r.kod).map(r=>Object.fromEntries(FQ_ROW_KEYS.map(k=>[k,r[k]??null]))),campaigns:[...secilenKampanya],total:lastTot?lastTot.finalNakit:null};
}
function fqFingerprint(d){const {total,...state}=d;return JSON.stringify(state);}
function fqHasWork(){return fqCapture().rows.length>0||FQ_CUSTOMER_IDS.some(id=>!['satisPersonel','mSipT'].includes(id)&&($(id)||{}).value);}
function fqDraftKey(id=fqFlow.draftId){return FQ_DRAFT_PREFIX+authUid+':'+id;}
function fqDraftId(){return crypto.randomUUID();}
function fqDraftStatus(text,bad=false){const el=$('fqDraftStatus');if(el){el.textContent=text;el.className=bad?'msg bad':'mut';}}
function fqDraftSchedule(){
 if(!fqFlow.ready||fqFlow.restoring||!authUid||fqRecoveryMode)return;
 clearTimeout(fqFlow.timer);fqFlow.timer=setTimeout(fqDraftFlush,600);
}
function fqDraftFlush(){
 clearTimeout(fqFlow.timer);
 if(!fqFlow.ready||fqFlow.restoring||!authUid||!fqHasWork())return true;
 try{const draft=fqCapture(),fingerprint=fqFingerprint(draft);if(fingerprint===fqFlow.baseline)return true;
 if(!fqFlow.draftId)fqFlow.draftId=fqDraftId();
 localStorage.setItem(fqDraftKey(),JSON.stringify({...draft,owner:authUid,id:fqFlow.draftId,updatedAt:Date.now()}));
 fqDraftStatus('Taslak bu tarayıcıda saklandı · '+new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}));return true;
 }catch(e){fqDraftStatus('Taslak saklanamadı. Bu sayfadan ayrılmadan Teklifi Kaydet kullan.',true);return false;}
}
function fqDraftReadAll(){
 const out=[],prefix=FQ_DRAFT_PREFIX+authUid+':';if(!authUid)return out;
 for(const key of Object.keys(localStorage)){if(!key.startsWith(prefix))continue;
 try{const d=JSON.parse(localStorage.getItem(key));if(!fqValidDraft(d)||d.owner!==authUid)continue;
 if(Date.now()-d.updatedAt>7*86400000){localStorage.removeItem(key);continue;}out.push(d);
 }catch(e){} }
 return out.sort((a,b)=>b.updatedAt-a.updatedAt);
}
function fqValidDraft(d){return !!d&&d.version===1&&typeof d.id==='string'&&['bosch','siemens'].includes(d.brand)&&Array.isArray(d.rows)&&d.rows.length<=1000&&d.rows.every(r=>r&&typeof r.kod==='string'&&r.kod.length<=100&&/^[A-Z0-9._/-]+$/i.test(r.kod)&&Number.isFinite(Number(r.adet))&&Number(r.adet)>0)&&d.fields&&typeof d.fields==='object'&&d.inputs&&typeof d.inputs==='object'&&Array.isArray(d.campaigns)&&Number.isFinite(d.updatedAt);}
function fqWorkflowReady(){
 fqFlow.ready=true;fqFlow.baseline=fqFingerprint(fqCapture());fqFlow.savedCustomer=null;fqFlow.review=false;fqFlow.draftId=null;
 $('fqReviewBox').hidden=true;
 try{const count=fqDraftReadAll().length;fqDraftStatus(count?count+' taslak bulundu · Taslaklar düğmesinden devam edebilirsin.':'Değişiklikler bu tarayıcıda otomatik taslak olarak tutulur.');}catch(e){fqDraftStatus('Tarayıcı taslak kaydına izin vermiyor. Teklifini kaydetmeyi unutma.',true);}
}
function fqWorkflowEnd(){
 fqDraftFlush();clearTimeout(fqFlow.timer);fqFlow.ready=false;fqFlow.review=false;fqFlow.savedCustomer=null;fqFlow.draftId=null;fqFlow.listRequest++;
 for(const id of ['fqMyQuotes','fqDraftDialog','fqNewDialog']){const d=$(id);if(d&&d.open)d.close();}
 for(const id of ['fqMyList','fqDraftList'])if($(id))$(id).innerHTML='';
 for(const id of FQ_CUSTOMER_IDS)if($(id))$(id).value='';
}
function fqClearWorkspace(){
 clearTimeout(fqFlow.timer);fqFlow.restoring=true;fqEpoch++;
 fqClearCustomer();savedTeklifId=null;currentTeklifNo=null;fqFlow.savedCustomer=null;fqFlow.draftId=null;secilenKampanya.clear();
 quoteRows=Array.from({length:5},bosSatir);manuelToplamPesin=null;manuelToplamTaksit=null;lastTot=null;
 $('banka').value='';$('taksit').innerHTML='<option value="">—</option>';komisOran=0;$('elleBanka').value='';$('elleOran').value='';$('elleKomFld').style.display='none';ticariKontrol();
 if(fqDataReady)fqPricingError='';
 for(const id of ['mtPesin','mtTaksit'])$(id).value='';$('saveMsg').textContent='';fqFlow.review=false;$('fqReviewBox').hidden=true;
 renderRows();fqFlow.restoring=false;fqFlow.baseline=fqFingerprint(fqCapture());fqDraftStatus('Yeni teklif · müşteri bilgileri temizlendi.');
}
function fqRequestNew(){if(fqSaving||fqFlow.busy){alert('Devam eden işlemin bitmesini bekle.');return;}if(!fqHasWork()){fqClearWorkspace();return;}$('fqNewMessage').textContent='';$('fqNewDialog').showModal();}
function fqNewWithDraft(){if(!fqDraftFlush()){$('fqNewMessage').textContent='Taslak saklanamadı. Önce teklifi kaydet veya Vazgeç seçeneğini kullan.';return;}$('fqNewDialog').close();fqClearWorkspace();focusCodeRow(0);}
function fqNewDiscard(){if(fqFlow.draftId)try{localStorage.removeItem(fqDraftKey());}catch(e){}$('fqNewDialog').close();fqClearWorkspace();focusCodeRow(0);}
function fqSaved(fingerprint,customerKey){
 fqFlow.savedCustomer=customerKey;fqFlow.baseline=fingerprint;
 if(fqFingerprint(fqCapture())===fingerprint){if(fqFlow.draftId)try{localStorage.removeItem(fqDraftKey());}catch(e){}fqFlow.draftId=null;fqDraftStatus('Teklif kalıcı olarak kaydedildi.');}else fqDraftFlush();
}
function fqConfirmReview(){if(fqFlow.busy||!fqDataReady||fqPricingError||quoteRows.some(r=>r.kod&&r.veriHata)){alert('Ürün ve fiyatların yüklenmesini bekle.');return;}fqFlow.review=false;$('fqReviewBox').hidden=true;fqDraftSchedule();}
function fqOpenDrafts(){
 if(!authUid||fqFlow.busy)return;fqDraftFlush();const dialog=$('fqDraftDialog');$('fqDraftMessage').textContent='';
 try{const drafts=fqDraftReadAll();$('fqDraftList').innerHTML=drafts.map(d=>`<article class="fq-item"><b>${esc(d.fields.mAd||'İsimsiz müşteri')} · ${esc(markaAd(d.brand))}</b><p>${esc(new Date(d.updatedAt).toLocaleString('tr-TR'))} · ${d.rows.length} ürün satırı</p><div class="fq-actions"><button data-draft="${esc(d.id)}" onclick="fqRestoreDraft(this.dataset.draft)">Devam et</button><button class="ghost" data-draft="${esc(d.id)}" onclick="fqDeleteDraft(this.dataset.draft)">Sil</button></div></article>`).join('')||'<p>Bu hesap için taslak bulunamadı.</p>';
 }catch(e){$('fqDraftMessage').textContent='Taslaklar okunamadı. Tarayıcı depolama ayarlarını kontrol et.';}if(!dialog.open)dialog.showModal();
}
function fqDeleteDraft(id){if(!authUid||!confirm('Bu taslak silinsin mi? Kaydedilmiş teklifler etkilenmez.'))return;try{localStorage.removeItem(fqDraftKey(id));if(fqFlow.draftId===id){fqFlow.draftId=null;fqFlow.baseline=fqFingerprint(fqCapture());}fqOpenDrafts();}catch(e){$('fqDraftMessage').textContent='Taslak silinemedi.';}}
async function fqRestoreDraft(id){
 if(!authUid||fqFlow.busy||fqSaving)return;
 try{const d=JSON.parse(localStorage.getItem(fqDraftKey(id)));if(!fqValidDraft(d)||d.owner!==authUid||Date.now()-d.updatedAt>7*86400000)throw Error('invalid');
 if(fqHasWork()&&!confirm('Mevcut çalışma taslakta tutularak seçilen taslak açılsın mı?'))return;
 if(!fqDraftFlush())return;
 await fqRestoreInputs(d);$('fqDraftDialog').close();
 }catch(e){$('fqDraftMessage').textContent='Taslak açılamadı. Kaydı, marka erişimini ve bağlantını kontrol et.';}
}
async function fqRestoreInputs(d){
 if(!allowedBrands().includes(d.brand))throw Error('brand');
 const user=authUid;fqFlow.busy=true;fqClearWorkspace();fqFlow.restoring=true;fqFlow.review=true;$('fqReviewBox').hidden=false;
 try{
 if(brand!==d.brand)await setBrand(d.brand);else await fqReloadData();
 if(user!==authUid)throw Error('session');
 for(const id of FQ_CUSTOMER_IDS)if(id!=='mTC'&&$(id))$(id).value=typeof d.fields[id]==='string'?d.fields[id]:'';
 for(const id of ['karOrani','elleBanka','elleOran'])if(d.inputs[id]!=null)$(id).value=String(d.inputs[id]);
 const wanted=d.inputs.banka||'';const bankExists=[...$('banka').options].some(o=>o.value===wanted);$('banka').value=bankExists?wanted:'';
 await loadTaksit();if(user!==authUid)throw Error('session');
 if([...$('taksit').options].some(o=>o.value===String(d.inputs.taksit)))$('taksit').value=String(d.inputs.taksit);await setKomis();
 if(user!==authUid)throw Error('session');
 quoteRows=d.rows.map(r=>({...bosSatir(),...Object.fromEntries(FQ_ROW_KEYS.map(k=>[k,r[k]??null]))}));
 const epoch=fqEpoch;await Promise.all(quoteRows.map(refetch));if(user!==authUid||epoch!==fqEpoch)throw Error('session');
 // Catalog refresh can switch manual mode off. Restore the user's explicit inputs after fresh data arrives.
 quoteRows.forEach((row,i)=>{if(d.rows[i].isET){for(const key of ['isET','etToptan','manuelFiyat','manuelTaksit'])row[key]=d.rows[i][key]??null;}});
 secilenKampanya=new Set(d.campaigns.filter(id=>aktifKampanyalar.some(k=>k.id===id)));
 manuelToplamPesin=trSayi(d.inputs.mtPesin);manuelToplamTaksit=trSayi(d.inputs.mtTaksit);$('mtPesin').value=d.inputs.mtPesin||'';$('mtTaksit').value=d.inputs.mtTaksit||'';
 savedTeklifId=null;currentTeklifNo=null;fqFlow.savedCustomer=null;fqFlow.draftId=null;fqFlow.review=true;$('fqReviewBox').hidden=false;
 const previous=Number(d.total);renderRows();
 $('fqReviewBox').firstChild.textContent='Güncel fiyat, stok ve kampanyalar sorgulandı. '+(Number.isFinite(previous)&&previous>0?'Önceki peşin toplam '+fmt(previous)+' ₺; güncel '+fmt(lastTot&&lastTot.finalNakit)+' ₺. ':'')+(bankExists?'':'Önceki banka bulunamadı; banka seçimini yenile. ')+'Kontrol ettikten sonra onayla. ';
 fqFlow.baseline='';
 }catch(e){if(user===authUid){fqPricingError='Geri yükleme tamamlanamadı. Bağlantıyı kontrol edip taslağı yeniden aç.';fqFlow.review=true;$('fqReviewBox').hidden=false;}throw e;
 }finally{fqFlow.restoring=false;fqFlow.busy=false;if(user===authUid){fqDraftSchedule();}}
}

async function fqOpenMyQuotes(){if(!authUid)return;fqFlow.page=0;$('myQuotesSearch').value='';if(!$('fqMyQuotes').open)$('fqMyQuotes').showModal();await fqLoadMyQuotes();}
function fqMySearch(){fqFlow.page=0;fqLoadMyQuotes();}
function fqMyPage(delta){fqFlow.page=Math.max(0,fqFlow.page+delta);fqLoadMyQuotes();}
async function fqLoadMyQuotes(){
 if(!authUid)return;const request=++fqFlow.listRequest,user=authUid,page=fqFlow.page;
 const current=()=>request===fqFlow.listRequest&&user===authUid&&$('fqMyQuotes').open;
 $('fqMyMessage').textContent='Teklifler yükleniyor…';$('fqMyList').innerHTML='';$('fqMyPrev').disabled=true;$('fqMyNext').disabled=true;
 try{
 let q=sb.from('teklifler').select('id,teklif_no,created_at,musteri_ad,musteri_tel,marka,toplam,durum',{count:'exact'}).eq('bayi_id',user);
 const term=$('myQuotesSearch').value.trim().replace(/[^\p{L}\p{N}\s+\-]/gu,' ').trim();
 if(term)q=q.or(`musteri_ad.ilike.%${term}%,musteri_tel.ilike.%${term}%,teklif_no.ilike.%${term}%`);
 const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*20,page*20+19);if(!current())return;if(error)throw error;
 $('fqMyMessage').textContent=(count||0)+' teklif bulundu.';$('fqMyPage').textContent='Sayfa '+(page+1);$('fqMyPrev').disabled=page===0;$('fqMyNext').disabled=(page+1)*20>=(count||0);
 $('fqMyList').innerHTML=(data||[]).map(t=>`<article class="fq-item"><div class="row"><b>${esc(t.musteri_ad||'Müşteri')} · ${esc(t.teklif_no||'—')}</b><span>${esc(DURUM_AD[t.durum]||'Teklif')}</span></div><p>${esc(new Date(t.created_at).toLocaleString('tr-TR'))} · ${esc(markaAd(t.marka))} · Peşin ${fmt(t.toplam)} ₺</p><div class="fq-actions"><button class="ghost" data-quote="${esc(t.id)}" onclick="openTeklifDetay(this.dataset.quote)">İncele</button><button data-quote="${esc(t.id)}" onclick="fqCopyQuote(this.dataset.quote)">Güncel fiyatla yeni kopya</button></div></article>`).join('')||'<p>Aramana uyan teklif bulunamadı.</p>';
 }catch(e){if(current())$('fqMyMessage').textContent='Teklifler yüklenemedi. Bağlantını kontrol edip Ara düğmesiyle tekrar dene.';}
}
async function fqCopyQuote(id){
 if(fqFlow.busy||fqSaving||!authUid)return;
 const user=authUid,request=++fqFlow.listRequest;fqFlow.busy=true;
 try{const {data:t,error}=await sb.from('teklifler').select('id,bayi_id,marka,musteri_ad,musteri_tel,satirlar,toplam').eq('id',id).eq('bayi_id',user).single();
 if(request!==fqFlow.listRequest||user!==authUid||!$('fqMyQuotes').open)return;if(error||!t)throw Error('missing');
 if(fqHasWork()&&!confirm('Mevcut çalışma taslakta tutularak bu teklifin yeni kopyası açılsın mı?'))return;if(!fqDraftFlush())return;
 const s=t.satirlar&&!Array.isArray(t.satirlar)?t.satirlar:{};
 const saved=s.workflow_inputs,items=Array.isArray(t.satirlar)?t.satirlar:(s.items||[]);
 const d=saved&&Array.isArray(saved.rows)?{...saved,brand:t.marka,fields:{...saved.fields,mAd:t.musteri_ad||'',mTel:t.musteri_tel||''}}:{brand:t.marka,fields:{mAd:t.musteri_ad||'',mTel:t.musteri_tel||'',satisPersonel:s.personel||''},inputs:{karOrani:'4',banka:s.banka||'',taksit:String(s.taksit||''),mtPesin:'',mtTaksit:''},rows:items.map(r=>({kod:r.model||r.kod,adet:r.adet||1,isET:false})),campaigns:[],total:t.toplam};
 await fqRestoreInputs(d);$('fqMyQuotes').close();$('adminView').style.display='none';$('bayiView').style.display='block';
 }catch(e){if(user===authUid)$('fqMyMessage').textContent='Teklif kopyalanamadı. Erişimini ve bağlantını kontrol et.';}finally{fqFlow.busy=false;}
}

document.addEventListener('input',event=>{if(event.target.closest('#salesWorkspace,#customerDialog'))fqDraftSchedule();});
document.addEventListener('change',event=>{if(event.target.closest('#salesWorkspace,#customerDialog'))fqDraftSchedule();});
window.addEventListener('pagehide',fqDraftFlush);
document.addEventListener('visibilitychange',()=>{if(document.hidden)fqDraftFlush();});
window.addEventListener('beforeunload',event=>{if(fqHasWork()&&fqFlow.ready){const ok=fqDraftFlush();if(!ok||fqSaving){event.preventDefault();event.returnValue='';}}});
