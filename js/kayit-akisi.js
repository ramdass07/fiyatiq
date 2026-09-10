/* Signup requests and the administrator's actual access grants are separate. */
'use strict';
const fqSignup={busy:false};
const fqApproval={id:null,saving:false,owner:null};

function fqSignupMessage(text,bad=false){const m=$('suMsg');m.className=bad?'err':'ok-msg';m.textContent=text;}
async function fqSubmitSignup(){
 if(fqSignup.busy)return;
 const ad=$('suAd').value.trim(),magaza=$('suMagaza').value.trim(),email=$('suEmail').value.trim(),password=$('suPass').value;
 const choice=$('suMarka').value,markalar=choice==='both'?['siemens','bosch']:['siemens','bosch'].includes(choice)?[choice]:[];
 if(!ad||ad.length>60||!magaza||magaza.length>60){fqSignupMessage('Ad soyad ve mağaza adı gerekli; her biri en fazla 60 karakter olabilir.',true);return;}
 if(!email||!$('suEmail').checkValidity()){fqSignupMessage('Geçerli bir e-posta adresi yaz.',true);return;}
 if(password.length<8){fqSignupMessage('Şifren en az 8 karakter olmalı.',true);return;}
 if(!markalar.length){fqSignupMessage('Başvuracağın markayı seç.',true);return;}
 fqSignup.busy=true;$('suSubmit').disabled=true;fqSignupMessage('Başvurun gönderiliyor…');
 try{
  const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:'https://fiyatiq.com/',data:{ad,magaza,basvuru_markalari:markalar}}});
  if(error)throw error;
  $('suPass').value='';
  fqSignupMessage(data&&data.session?'Kaydın alındı. Mağaza ve marka erişimin yönetici onayından sonra açılacak.':'E-posta adresini doğrulamak için gelen kutunu ve gereksiz klasörünü kontrol et. Yeni hesabın yönetici onayından sonra açılır. Zaten kayıtlıysan giriş yap veya Şifremi unuttum seçeneğini kullan.');
 }catch(e){
  const duplicate=['user_already_exists','email_exists'].includes(e&&e.code);
  fqSignupMessage(duplicate?'Bu adresle zaten hesap olabilir. Giriş yap veya Şifremi unuttum seçeneğini kullan.':fqAuthError(e),true);
 }finally{fqSignup.busy=false;$('suSubmit').disabled=false;}
}

function fqApprovalMessage(text,bad=false){const m=$('fqApprovalMessage');m.textContent=text;m.className=bad?'msg bad':'mut';}
function fqOpenApproval(id){
 if(profil.rol!=='admin'||fqApproval.saving)return;
 const p=(window._bayiCache||{})[id];if(!p||p.rol==='admin')return;
 fqApproval.id=id;fqApproval.owner=p.bayi_sahibi||null;
 $('fqApproveAd').value=p.ad||'';$('fqApproveStore').value=p.magaza||'';
 const requested=(p.basvuru_markalari||[]).filter(m=>['siemens','bosch'].includes(m));
 $('fqApprovalRequest').textContent=requested.length?'Başvuruda istenen markalar: '+requested.map(m=>m==='bosch'?'Bosch':'Siemens').join(', '):'Eski kayıtta marka talebi bulunmuyor. Erişimi aşağıdan seç.';
 const initial=requested;
 $('fqApproveSiemens').checked=initial.includes('siemens');$('fqApproveBosch').checked=initial.includes('bosch');
 const select=$('fqApproveModel');select.replaceChildren();
 for(const [value,text] of [['','Mağazanın çalışma şeklini seç'],['shared','Şubem · ortak stok ve merkez fiyat listesi'],['independent','Bağımsız bayi · kendi stoku ve bağımsız fiyat listesi']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}
 if(p.bayi_sahibi&&p.bayi_sahibi!==authUid){const o=document.createElement('option');o.value='existing';o.textContent='Mevcut ortak stok bağlantısını koru';select.append(o);}
 // Every activation requires a deliberate stock/pricing choice.
 select.value='';
 $('fqApprovalRole').textContent=p.rol==='personel'?'Bu hesap Merkez editörü rolünde: tüm mağazaların tekliflerini ve merkez verilerini yönetebilir.':'Hesap, mağazaya ait bayi erişimiyle açılacak.';
 fqApprovalMessage('Onayladığında bu bilgiler birlikte kaydedilir ve hesap aktif olur.');
 const d=$('fqApprovalDialog');if(!d.open)d.showModal();$('fqApproveStore').focus();
}
function fqApprovalReset(){
 fqApproval.id=null;fqApproval.owner=null;
 const d=$('fqApprovalDialog');if(d&&d.open)d.close();
}
async function fqApproveSignup(){
 if(fqApproval.saving||profil.rol!=='admin'||!fqApproval.id)return;
 const id=fqApproval.id,epoch=fqEpoch,uid=authUid;
 const ad=$('fqApproveAd').value.trim(),magaza=$('fqApproveStore').value.trim(),model=$('fqApproveModel').value;
 const marka_erisimi=['siemens','bosch'].filter(m=>$(m==='siemens'?'fqApproveSiemens':'fqApproveBosch').checked);
 if(!ad||!magaza||ad.length>60||magaza.length>60){fqApprovalMessage('Ad soyad ve mağaza adı gerekli; en fazla 60 karakter kullan.',true);return;}
 if(!marka_erisimi.length){fqApprovalMessage('En az bir marka erişimi seç.',true);return;}
 if(!['shared','independent','existing'].includes(model)||model==='existing'&&!fqApproval.owner){fqApprovalMessage('Ortak stok veya bağımsız bayi seçimini yap.',true);return;}
 const bayi_sahibi=model==='shared'?uid:model==='existing'?fqApproval.owner:null;
 fqApproval.saving=true;$('fqApproveSave').disabled=true;$('fqApproveCancel').disabled=true;fqApprovalMessage('Kaydediliyor…');
 try{
  const {data,error}=await sb.from('profiller').update({ad,magaza,marka_erisimi,bayi_sahibi,abonelik_durumu:'aktif'}).eq('id',id).select('id').single();
  if(error||!data||data.id!==id)throw error||Error('not_saved');
  if(epoch!==fqEpoch||uid!==authUid)return;
  fqApprovalReset();await loadBayiler();
 }catch(e){if(epoch===fqEpoch&&uid===authUid)fqApprovalMessage('Onay kaydedilemedi. Bağlantını ve yönetici erişimini kontrol ederek tekrar dene.',true);}
 finally{fqApproval.saving=false;$('fqApproveSave').disabled=false;$('fqApproveCancel').disabled=false;}
}
async function fqChangeBayiStatus(id,durum){
 if(profil.rol!=='admin')return;
 if(durum==='aktif'){fqOpenApproval(id);return;}
 if(durum!=='pasif')return;
 try{const {data,error}=await sb.from('profiller').update({abonelik_durumu:'pasif'}).eq('id',id).select('id').single();if(error||!data||data.id!==id)throw error||Error('not_saved');await loadBayiler();}
 catch(e){alert('Erişim durumu kaydedilemedi. Tekrar dene.');}
}

document.body.insertAdjacentHTML('beforeend',`
 <dialog id="fqApprovalDialog" class="fq-dialog" aria-labelledby="fqApprovalTitle" style="max-width:620px">
 <h2 id="fqApprovalTitle">Mağaza başvurusunu onayla</h2>
 <p id="fqApprovalRequest"></p>
 <div class="fq-approval-fields" style="display:grid;gap:12px">
 <label for="fqApproveAd">Ad soyad<input id="fqApproveAd" maxlength="60" style="display:block;width:100%"></label>
 <label for="fqApproveStore">Mağaza adı<input id="fqApproveStore" maxlength="60" style="display:block;width:100%"></label>
 <fieldset style="border:1px solid var(--bd);border-radius:8px;padding:12px"><legend>Açılacak marka erişimi</legend>
 <label><input id="fqApproveSiemens" type="checkbox"> Siemens</label> <label><input id="fqApproveBosch" type="checkbox"> Bosch</label></fieldset>
 <label for="fqApproveModel">Stok ve fiyat listesi<select id="fqApproveModel" style="display:block;width:100%"></select></label>
 </div><p id="fqApprovalRole" class="mut"></p><p id="fqApprovalMessage" role="status"></p>
 <div class="fq-actions"><button id="fqApproveCancel" class="ghost" onclick="fqApprovalReset()">Vazgeç</button><button id="fqApproveSave" onclick="fqApproveSignup()">Kaydet ve erişimi aç</button></div>
 </dialog>`);
$('fqApprovalDialog').addEventListener('cancel',e=>{if(fqApproval.saving)e.preventDefault();});
