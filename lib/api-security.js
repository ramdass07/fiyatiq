'use strict';
const Core=require('../js/fiyat-core');
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
async function authorize(req,res,service){
 if(req.method!=='POST')throw new HttpError(405,'Sadece POST');
 const token=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers&&req.headers.authorization||'');
 if(!token)throw new HttpError(401,'Oturum açmanız gerekiyor.');
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!url||!key)throw new HttpError(503,'Servis yapılandırması tamamlanmamış.');
 let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>700000)throw new HttpError(413,'İstek çok büyük.');try{body=JSON.parse(body);}catch{throw new HttpError(400,'Geçersiz JSON.');}}
 if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>700000)throw new HttpError(400,'Geçersiz istek.');
 if(!['bosch','siemens'].includes(body.marka))throw new HttpError(400,'Geçerli marka seçin.');
 if(service==='asistan'){if(typeof body.soru!=='string'||!body.soru.trim()||body.soru.length>4000)throw new HttpError(400,'Soru 1–4000 karakter olmalı.');
 try{body.komisyon=Core.commission(body.komisyon||0);body.kar=Core.money(body.kar||0);if(body.kar>1000)throw Error();}catch{throw new HttpError(400,'Geçersiz fiyat oranı.');}}
 else if(typeof body.metin!=='string'||body.metin.length<20||body.metin.length>150000)throw new HttpError(400,'Belge metni 20–150000 karakter olmalı.');
 const headers={apikey:key,Authorization:'Bearer '+token[1],'Content-Type':'application/json'};
 async function request(path,options={}){let r;try{r=await fetch(url.replace(/\/$/,'')+path,{...options,headers,signal:AbortSignal.timeout(15000)});}catch{throw new HttpError(503,'Yetki/veri servisine ulaşılamadı.');}let data;try{data=await r.json();}catch{throw new HttpError(503,'Veri servisi yanıtı okunamadı.');}if(!r.ok)throw new HttpError(r.status===401?401:r.status===403?403:503,'Yetki veya servis kontrolü başarısız.');return data;}
 const user=await request('/auth/v1/user');if(!user||!user.id)throw new HttpError(401,'Oturum geçersiz.');
 const profiles=await request('/rest/v1/profiller?select=id,rol,abonelik_durumu,marka_erisimi&id=eq.'+encodeURIComponent(user.id));const profile=profiles[0];
 if(!profile||(profile.rol!=='admin'&&!['aktif','deneme'].includes(profile.abonelik_durumu)))throw new HttpError(403,'Hesabınızın erişimi açık değil.');
 const editor=['admin','personel'].includes(profile.rol);if(!editor&&!(profile.marka_erisimi||[]).includes(body.marka))throw new HttpError(403,'Bu markaya erişim yok.');
 if(service!=='asistan'&&!editor)throw new HttpError(403,'Bu işlem için yönetim yetkisi gerekir.');
 const quota=await request('/rest/v1/rpc/fq_ai_kota_al',{method:'POST',body:JSON.stringify({p_servis:service,p_marka:body.marka})});if(quota!==true)throw new HttpError(429,'Kullanım sınırına ulaşıldı. Daha sonra deneyin.');
 req.body=body;res.setHeader&&res.setHeader('Cache-Control','no-store');return {body,profile,request};
}
function fail(res,e){res.status(e.status||503).json({error:e.status?e.message:'Servis geçici olarak kullanılamıyor.'});}
async function assistantCatalog(ctx){const rows=await ctx.request('/rest/v1/rpc/fq_ai_catalog',{method:'POST',body:JSON.stringify({p_marka:ctx.body.marka})});
 if(!Array.isArray(rows))throw new HttpError(503,'Stok listesi okunamadı.');
 return rows.filter(r=>r&&r.adet>0&&r.toptan>0).map(r=>{const price=Core.calcParts({...r,adet:1},ctx.body.kar,ctx.body.komisyon);return {k:r.k,ad:String(r.ad||'').slice(0,120),adet:r.adet,pesin:Math.round(price.unitNakit*100)/100,toptan:r.toptan};});
}
module.exports={authorize,fail,assistantCatalog,HttpError};
