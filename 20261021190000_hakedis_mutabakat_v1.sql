-- ================================================================
-- HAKEDİŞ MUTABAKATI v1 (Faz 1A) — 21 Ekim 2026
-- BSH BİP / bundle hakedişlerinin Diva ve BSH kayıtlarıyla karşılaştırılması.
-- Referans: Desktop\BSH HAKEDİŞ KONTROL\_sistem\hakedis_kontrol.py (Python, Eylül 2026'da doğrulandı)
--
-- İLKELER
--  * Mevcut tablolara, fiyat/kampanya/stok fonksiyonlarına DOKUNMAZ. Yalnız yeni hakedis_* nesneleri.
--  * Veri İŞLETME kimliğine bağlıdır (isletme_id = fq_stok_sahibi(): şube → merkez).
--  * Yetki: şimdilik yalnız rol='admin' (Burak kararı 21.10). is_editor() KULLANILMAZ — personel rolü
--    bu verileri göremez. Bayi patronuna açılış ayrı migration'la (fq_hakedis_yetkili() genişletilir).
--  * Ham dosya satırları saklanır (Burak kararı). Aynı dosya (SHA-256) ikinci kez yüklenmez.
--    Aynı kapsamı (tür + marka + şube + tarih aralığı) içine alan yeni yükleme eskisini PASİFLEŞTİRİR, silmez.
--  * Hesap istemcide (js/hakedis-core.js) yapılır; veritabanı yalnız saklar.
-- Bu dosya SIRAYLA ve TEK BAŞINA çalıştırılır; eski SQL dosyaları topluca çalıştırılmaz.
-- ================================================================
begin;

create table if not exists public.fq_schema_versions(version text primary key);

-- 1) Yetki --------------------------------------------------------------
create or replace function public.fq_hakedis_yetkili() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiller
                 where id = auth.uid() and rol = 'admin' and public.erisebilir());
$$;
revoke all on function public.fq_hakedis_yetkili() from public;
grant execute on function public.fq_hakedis_yetkili() to authenticated;

-- 2) Yüklemeler (dosya başına bir kayıt) -------------------------------
create table if not exists public.hakedis_yukleme (
  id           uuid primary key default gen_random_uuid(),
  isletme_id   uuid not null default public.fq_stok_sahibi(),
  tur          text not null check (tur in ('diva_kampanya','diva_fatura','bsh_detay','fiyat_fark')),
  marka        text not null check (marka in ('bosch','siemens')),
  dosya_adi    text not null check (length(dosya_adi) between 1 and 300),
  dosya_hash   text not null check (dosya_hash ~ '^[0-9a-f]{64}$'),
  sube_kodu    text,                      -- diva_fatura: şube şube çekilir
  kapsam_bas   date,                      -- satırlardaki en erken tarih
  kapsam_bit   date,                      -- satırlardaki en geç tarih
  donemler     int[] not null default '{}',  -- bsh_detay: hakediş dönemleri (YYYYAA); fiyat_fark: ay
  satir_sayisi int not null default 0 check (satir_sayisi between 0 and 50000),
  aktif        boolean not null default true,
  pasif_nedeni text,
  yukleyen     uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (isletme_id, dosya_hash)
);
create index if not exists hakedis_yukleme_aktif_ix on public.hakedis_yukleme (isletme_id, tur, marka) where aktif;

-- 3) Ham satırlar (tür fark etmeksizin tek tablo; asıl sütunlar jsonb'de korunur) ----
create table if not exists public.hakedis_satir (
  id          bigint generated always as identity primary key,
  yukleme_id  uuid not null references public.hakedis_yukleme(id) on delete cascade,
  isletme_id  uuid not null default public.fq_stok_sahibi(),
  sira        int  not null,              -- dosyadaki satır sırası (kaynak gösterimi)
  sayfa       text,
  fatura_no   text,
  urun_kodu   text,
  tarih       date,
  veri        jsonb not null              -- dosyadaki başlık → değer (asıl yazım)
);
create index if not exists hakedis_satir_yukleme_ix on public.hakedis_satir (yukleme_id);
create index if not exists hakedis_satir_fatura_ix  on public.hakedis_satir (isletme_id, fatura_no, urun_kodu);

-- 4) Kampanya (paket) tanımları — marka + kampanya ayı bazında sürümlenir ----
create table if not exists public.hakedis_paket (
  id              uuid primary key default gen_random_uuid(),
  isletme_id      uuid not null default public.fq_stok_sahibi(),
  marka           text not null check (marka in ('bosch','siemens')),
  paket_adi       text not null,
  paket_norm      text not null,           -- karşılaştırma anahtarı (istemcide norm())
  kampanya_ayi    int,                     -- paket adındaki YYYYAA
  tur             text not null default 'BİLİNMİYOR'
                  check (tur in ('TEKİL','FIRSAT','AİLE','KEA','BUNDLE','HARİÇ','BİLİNMİYOR')),
  oran_sayfasi    text check (oran_sayfasi in ('ANA','FIRSAT','AİLE')),
  bundle_hakedis_kdv_dahil numeric check (bundle_hakedis_kdv_dahil is null or bundle_hakedis_kdv_dahil >= 0),
  set_urun_sayisi int check (set_urun_sayisi is null or set_urun_sayisi between 1 and 20),
  kampanya_bas    date,
  kampanya_bit    date,
  hakedis_son     date,
  adet_limiti     int check (adet_limiti is null or adet_limiti between 0 and 99),
  kaynak_not      text,
  durum           text not null default 'KONTROL ET' check (durum in ('ONAYLI','KONTROL ET')),
  onaylayan       uuid,
  onay_tarihi     timestamptz,
  updated_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  unique (isletme_id, marka, paket_norm)
);

-- 5) Elle eklenen oranlar (mailden gelen tekil fiyat farkları) ------------
create table if not exists public.hakedis_oran_ek (
  id             uuid primary key default gen_random_uuid(),
  isletme_id     uuid not null default public.fq_stok_sahibi(),
  marka          text not null check (marka in ('bosch','siemens')),
  urun_kodu      text not null,
  oran_sayfasi   text not null default 'ANA' check (oran_sayfasi in ('ANA','FIRSAT','AİLE')),
  birim_fark_kdv_haric numeric not null check (birim_fark_kdv_haric >= 0),
  gecerlilik_bas date not null,
  kaynak         text,
  updated_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  unique (isletme_id, marka, urun_kodu, oran_sayfasi, gecerlilik_bas)
);

-- 6) Şube → mağaza → BSH bayi kodu (Python'daki sabit MAGAZA_ANAHTAR'ın yerine) ----
create table if not exists public.hakedis_sube (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null default public.fq_stok_sahibi(),
  marka       text not null check (marka in ('bosch','siemens')),
  anahtar     text not null,               -- Diva şube kodu ya da adındaki parça (örn. şube kodu)
  magaza      text not null,               -- rapordaki mağaza adı (örn. kısa mağaza adı)
  bayi_kodu   text,                        -- BSH formundaki kısa bayi kodu
  oncelik     int not null default 100,    -- küçük olan önce denenir
  unique (isletme_id, marka, anahtar)
);

-- 7) Ayarlar (milat, eşleşme gün aralığı vb.) -----------------------------
create table if not exists public.hakedis_ayar (
  isletme_id  uuid not null default public.fq_stok_sahibi(),
  marka       text not null check (marka in ('bosch','siemens')),
  anahtar     text not null,
  deger       text,
  updated_at  timestamptz not null default now(),
  primary key (isletme_id, marka, anahtar)
);

-- 8) BSH'nin kestirdiği hakediş faturaları (DSY…) ---------------------------
create table if not exists public.hakedis_bsh_fatura (
  id          uuid primary key default gen_random_uuid(),
  isletme_id  uuid not null default public.fq_stok_sahibi(),
  marka       text not null check (marka in ('bosch','siemens')),
  fatura_no   text not null,
  fatura_tarihi date,
  tur         text,
  tutar_kdv_haric numeric,
  hakedis_donemi int,
  not_        text,
  unique (isletme_id, marka, fatura_no)
);

-- 9) Gönderilmiş itirazlar (BOSCH İTİRAZ klasörünün karşılığı) ---------------
create table if not exists public.hakedis_itiraz (
  id              uuid primary key default gen_random_uuid(),
  isletme_id      uuid not null default public.fq_stok_sahibi(),
  marka           text not null check (marka in ('bosch','siemens')),
  fatura_no       text not null,
  degisen_fatura_no text,
  urun_kodu       text not null,
  kampanya_adi    text not null,
  kampanya_norm   text not null,
  tutar_kdv_haric numeric,
  kaynak          text,                    -- 'Diva'da kampanya var, BSH ödememiş' vb.
  form_adi        text,
  gonderim_tarihi date not null,
  olusturan       uuid not null default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (isletme_id, marka, fatura_no, urun_kodu, kampanya_norm)
);

-- 10) RLS: yalnız kendi işletmesi + yetkili ------------------------------------
do $$
declare t text;
begin
  foreach t in array array['hakedis_yukleme','hakedis_satir','hakedis_paket','hakedis_oran_ek',
                           'hakedis_sube','hakedis_ayar','hakedis_bsh_fatura','hakedis_itiraz'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_oku', t);
    execute format('create policy %I on public.%I for select using (public.fq_hakedis_yetkili() and isletme_id = public.fq_stok_sahibi())', t||'_oku', t);
  end loop;
  -- Tanım tabloları doğrudan düzenlenir (ekrandaki tablolar). İşletme kimliği sunucuda zorlanır.
  foreach t in array array['hakedis_paket','hakedis_oran_ek','hakedis_sube','hakedis_ayar',
                           'hakedis_bsh_fatura','hakedis_itiraz'] loop
    execute format('drop policy if exists %I on public.%I', t||'_yaz', t);
    execute format('create policy %I on public.%I for all using (public.fq_hakedis_yetkili() and isletme_id = public.fq_stok_sahibi()) with check (public.fq_hakedis_yetkili() and isletme_id = public.fq_stok_sahibi())', t||'_yaz', t);
  end loop;
  -- hakedis_yukleme / hakedis_satir için YAZMA POLİTİKASI YOK: yalnız aşağıdaki fonksiyonlarla.
end $$;

-- 11) Yükleme — atomik, idempotent --------------------------------------------
--  p_kapsam: {"sube_kodu":..,"bas":"YYYY-MM-DD","bit":"YYYY-MM-DD","donemler":[202609]}
--  p_satirlar: [{"sira":1,"sayfa":"Sheet1","fatura_no":"..","urun_kodu":"..","tarih":"YYYY-MM-DD","veri":{...}}, ...]
create or replace function public.fq_hakedis_yukle(
  p_tur text, p_marka text, p_dosya_adi text, p_hash text, p_kapsam jsonb, p_satirlar jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_isletme uuid; v_var record; v_id uuid; v_n int; v_pasif int := 0;
  v_bas date; v_bit date; v_sube text; v_don int[];
begin
  if not public.fq_hakedis_yetkili() then raise exception 'Hakediş modülü için yetkin yok.' using errcode = '42501'; end if;
  v_isletme := public.fq_stok_sahibi();
  if v_isletme is null then raise exception 'Profil bulunamadı.'; end if;
  if p_tur not in ('diva_kampanya','diva_fatura','bsh_detay','fiyat_fark') then raise exception 'Geçersiz dosya türü.'; end if;
  if p_marka not in ('bosch','siemens') then raise exception 'Geçersiz marka.'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Geçersiz dosya özeti.'; end if;
  if jsonb_typeof(p_satirlar) <> 'array' or jsonb_array_length(p_satirlar) not between 1 and 50000
     or octet_length(p_satirlar::text) > 30000000 then
    raise exception 'Satır sayısı 1-50.000 arası olmalı.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_isletme::text || ':hakedis', 7));

  select id, aktif, created_at into v_var from hakedis_yukleme
   where isletme_id = v_isletme and dosya_hash = p_hash;
  if found then
    return jsonb_build_object('durum','ayni_dosya','yukleme_id',v_var.id,'aktif',v_var.aktif,'tarih',v_var.created_at);
  end if;

  v_bas  := nullif(p_kapsam->>'bas','')::date;
  v_bit  := nullif(p_kapsam->>'bit','')::date;
  v_sube := nullif(p_kapsam->>'sube_kodu','');
  select coalesce(array_agg(x::int order by x::int), '{}') into v_don
    from jsonb_array_elements_text(coalesce(p_kapsam->'donemler','[]'::jsonb)) x;

  insert into hakedis_yukleme(isletme_id,tur,marka,dosya_adi,dosya_hash,sube_kodu,kapsam_bas,kapsam_bit,donemler,satir_sayisi)
  values (v_isletme,p_tur,p_marka,left(p_dosya_adi,300),p_hash,v_sube,v_bas,v_bit,v_don,jsonb_array_length(p_satirlar))
  returning id into v_id;

  insert into hakedis_satir(yukleme_id,isletme_id,sira,sayfa,fatura_no,urun_kodu,tarih,veri)
  select v_id, v_isletme, coalesce((s->>'sira')::int, 0), left(s->>'sayfa',100),
         nullif(left(s->>'fatura_no',40),''), nullif(upper(left(s->>'urun_kodu',40)),''),
         nullif(s->>'tarih','')::date, coalesce(s->'veri','{}'::jsonb)
    from jsonb_array_elements(p_satirlar) s;
  get diagnostics v_n = row_count;

  -- Kapsamı tamamen içine alınan eski yüklemeler pasifleşir (fiyat_fark dosyaları hariç: tarihli sürümlerin hepsi gerekir).
  if p_tur <> 'fiyat_fark' and v_bas is not null and v_bit is not null then
    update hakedis_yukleme set aktif = false,
           pasif_nedeni = 'Yerine yeni dosya: ' || left(p_dosya_adi,120) || ' (' || to_char(now() at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI') || ')'
     where isletme_id = v_isletme and tur = p_tur and marka = p_marka and aktif and id <> v_id
       and coalesce(sube_kodu,'') = coalesce(v_sube,'')
       and kapsam_bas >= v_bas and kapsam_bit <= v_bit
       and (p_tur <> 'bsh_detay' or donemler <@ v_don);
    get diagnostics v_pasif = row_count;
  end if;

  return jsonb_build_object('durum','yuklendi','yukleme_id',v_id,'satir',v_n,'pasiflesen',v_pasif);
end $$;
revoke all on function public.fq_hakedis_yukle(text,text,text,text,jsonb,jsonb) from public;
grant execute on function public.fq_hakedis_yukle(text,text,text,text,jsonb,jsonb) to authenticated;

-- 12) Yüklemeyi elle pasifleştir / yeniden etkinleştir ------------------------------
create or replace function public.fq_hakedis_yukleme_durum(p_id uuid, p_aktif boolean)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.fq_hakedis_yetkili() then raise exception 'Hakediş modülü için yetkin yok.' using errcode = '42501'; end if;
  update hakedis_yukleme set aktif = p_aktif,
         pasif_nedeni = case when p_aktif then null else 'Elle pasifleştirildi' end
   where id = p_id and isletme_id = public.fq_stok_sahibi();
  if not found then raise exception 'Yükleme bulunamadı.'; end if;
end $$;
revoke all on function public.fq_hakedis_yukleme_durum(uuid,boolean) from public;
grant execute on function public.fq_hakedis_yukleme_durum(uuid,boolean) to authenticated;

insert into public.fq_schema_versions(version) values('20261021190000_hakedis_mutabakat_v1') on conflict do nothing;
commit;
