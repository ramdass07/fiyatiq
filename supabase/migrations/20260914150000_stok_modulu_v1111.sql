-- ================================================================
-- STOK MODÜLÜ v11.11 — 14 Eylül 2026
-- Satışta düşüm + süreli rezerve + az stok altyapısı.
--
-- TASARIM İLKESİ: Sabah stok yüklemesi AYNEN DEVAM EDER ve bu tabloya
-- DOKUNMAZ. Yükleme "stok" tablosundaki fotoğrafı tazeler; stok_hareket
-- fotoğraf SONRASI gün içi hareketleri tutar.
--   NET = fotoğraf(mevcut − ayrılmış)
--         − fotoğraf tarihinden itibaren yapılan satış düşümleri
--         − süresi dolmamış rezerveler
-- Fotoğraftan ÖNCEKİ satışlar sayılmaz: sabah dosyası gerçeği zaten getirir.
-- ================================================================

-- 1) Havuz sahibi: şubeler merkezin stok havuzunu paylaşır (istemcideki
--    stokSahibi() ile birebir aynı kural).
create or replace function public.fq_stok_sahibi() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(bayi_sahibi, id) from profiller where id = auth.uid();
$$;

-- 2) Hareket defteri
create table if not exists public.stok_hareket (
  id            bigint generated always as identity primary key,
  bayi_id       uuid not null,
  model_kodu    text not null,
  marka         text not null check (marka in ('bosch','siemens')),
  depo          text not null check (depo in ('mars','horoz','kadikoy')),
  tip           text not null check (tip in ('satis','rezerve')),
  adet          int  not null check (adet between 1 and 999),
  teklif_id     uuid,
  rezerve_bitis timestamptz,
  notu          text check (notu is null or length(notu) <= 500),
  ekleyen       uuid not null default auth.uid(),
  ekleyen_ad    text,
  created_at    timestamptz not null default now(),
  aktif         boolean not null default true,
  check (tip <> 'rezerve' or rezerve_bitis is not null),
  check (tip <> 'satis'   or teklif_id is not null)
);
create index if not exists stok_hareket_kod_ix    on public.stok_hareket (bayi_id, marka, model_kodu) where aktif;
create index if not exists stok_hareket_teklif_ix on public.stok_hareket (teklif_id) where aktif;

alter table public.stok_hareket enable row level security;
-- Okuma: kendi havuzu veya editör. YAZMA POLİTİKASI YOK — yazma yalnız
-- aşağıdaki SECURITY DEFINER fonksiyonlarla yapılır (kontrollü, atomik).
drop policy if exists stok_hareket_oku on public.stok_hareket;
create policy stok_hareket_oku on public.stok_hareket for select
  using (public.erisebilir() and (bayi_id = public.fq_stok_sahibi() or public.is_editor()));

-- 3) Depo bazında net (fonksiyonların ortak hesabı)
create or replace function public.fq_stok_net_depo(p_bayi uuid, p_kod text, p_marka text)
returns table(depo text, foto_net int, satis_dusum int, rezerve int, net int)
language sql stable security definer set search_path = public as $$
  with depolar as (select unnest(array['mars','horoz','kadikoy']) as depo),
  foto as (
    select s.depo,
           sum(case when s.tip = 'ayrilmis' then -s.adet else s.adet end)::int as foto_net,
           max(case when s.tip <> 'ayrilmis' then s.stok_tarihi end)           as son_tarih,
           count(*) filter (where s.tip <> 'ayrilmis')                          as mevcut_kayit
    from stok s
    where s.bayi_id = p_bayi and upper(s.model_kodu) = upper(p_kod) and s.marka::text = lower(p_marka)
    group by s.depo
  ),
  hareket as (
    select h.depo,
           coalesce(sum(h.adet) filter (where h.tip = 'satis'
             and (f.son_tarih is null
                  or (h.created_at at time zone 'Europe/Istanbul')::date >= f.son_tarih)), 0)::int as satis_dusum,
           coalesce(sum(h.adet) filter (where h.tip = 'rezerve' and h.rezerve_bitis > now()), 0)::int as rezerve
    from stok_hareket h
    left join foto f on f.depo = h.depo
    where h.bayi_id = p_bayi and upper(h.model_kodu) = upper(p_kod) and h.marka = lower(p_marka) and h.aktif
    group by h.depo, f.son_tarih
  )
  select d.depo,
         coalesce(f.foto_net, 0),
         coalesce(hk.satis_dusum, 0),
         coalesce(hk.rezerve, 0),
         coalesce(f.foto_net, 0)
           - coalesce(hk.satis_dusum, 0) - coalesce(hk.rezerve, 0)
  from depolar d
  left join foto    f  on f.depo  = d.depo
  left join hareket hk on hk.depo = d.depo;
$$;

-- 4) SATIŞTA DÜŞÜM — teklif bazlı, İDEMPOTENT ve ATOMİK.
--    Aynı teklif ikinci kez işaretlenirse eski düşümler pasifleşir, yenisi
--    yazılır (çift düşüm imkânsız). Yetersiz stokta hiçbir şey yazılmaz;
--    p_zorla=true ile bilerek eksiye düşülebilir (kayıtlar eski olabilir).
create or replace function public.fq_stok_satis_kaydet(
  p_teklif_id uuid, p_satirlar jsonb, p_zorla boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_havuz uuid; v_teklif record; v_item jsonb; v_net int; v_ad text;
  v_eksik jsonb := '[]'::jsonb;
begin
  if not public.erisebilir() then raise exception 'Erişim yok.'; end if;
  v_havuz := public.fq_stok_sahibi();
  if v_havuz is null then raise exception 'Profil bulunamadı.'; end if;
  if p_satirlar is null or jsonb_typeof(p_satirlar) <> 'array'
     or jsonb_array_length(p_satirlar) < 1 or jsonb_array_length(p_satirlar) > 50 then
    raise exception 'Satır listesi 1-50 arası olmalı.';
  end if;

  select id, bayi_id into v_teklif from teklifler where id = p_teklif_id;
  if not found then raise exception 'Teklif bulunamadı.'; end if;
  if not public.is_editor() and
     coalesce((select coalesce(bayi_sahibi, id) from profiller where id = v_teklif.bayi_id), v_teklif.bayi_id) <> v_havuz then
    raise exception 'Bu teklif senin mağaza havuzuna ait değil.';
  end if;

  -- Havuz bazlı kilit: iki satıcı aynı son ürünü aynı anda düşemez.
  perform pg_advisory_xact_lock(hashtextextended(v_havuz::text, 42));

  -- İdempotens: bu teklifin önceki satış düşümleri pasifleşir.
  update stok_hareket set aktif = false
   where teklif_id = p_teklif_id and tip = 'satis' and aktif;

  for v_item in select * from jsonb_array_elements(p_satirlar) loop
    if (v_item->>'depo') not in ('mars','horoz','kadikoy')
       or (v_item->>'marka') not in ('bosch','siemens')
       or coalesce((v_item->>'adet')::int, 0) not between 1 and 999
       or length(coalesce(v_item->>'model_kodu','')) not between 3 and 40 then
      raise exception 'Geçersiz satır: %', v_item::text;
    end if;
    select n.net into v_net
      from public.fq_stok_net_depo(v_havuz, v_item->>'model_kodu', v_item->>'marka') n
     where n.depo = v_item->>'depo';
    if coalesce(v_net, 0) < (v_item->>'adet')::int then
      v_eksik := v_eksik || jsonb_build_object(
        'model_kodu', upper(v_item->>'model_kodu'), 'depo', v_item->>'depo',
        'net', coalesce(v_net, 0), 'istenen', (v_item->>'adet')::int);
    end if;
  end loop;

  if jsonb_array_length(v_eksik) > 0 and not p_zorla then
    raise exception 'YETERSIZ_STOK %', v_eksik::text;
    -- exception her şeyi (pasifleştirme dahil) geri alır; eski düşümler korunur.
  end if;

  select ad into v_ad from profiller where id = auth.uid();
  insert into stok_hareket (bayi_id, model_kodu, marka, depo, tip, adet, teklif_id, ekleyen, ekleyen_ad)
  select v_havuz, upper(x->>'model_kodu'), lower(x->>'marka'), x->>'depo', 'satis',
         (x->>'adet')::int, p_teklif_id, auth.uid(), v_ad
    from jsonb_array_elements(p_satirlar) x;

  return jsonb_build_object('ok', true,
    'satir', jsonb_array_length(p_satirlar),
    'zorlanan', case when p_zorla then v_eksik else '[]'::jsonb end);
end $$;

-- 5) Satıldı GERİ alınırsa düşümler serbest kalır.
create or replace function public.fq_stok_satis_geri_al(p_teklif_id uuid)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare v_havuz uuid; v_teklif record; v_n int;
begin
  if not public.erisebilir() then raise exception 'Erişim yok.'; end if;
  v_havuz := public.fq_stok_sahibi();
  select id, bayi_id into v_teklif from teklifler where id = p_teklif_id;
  if not found then return 0; end if;
  if not public.is_editor() and
     coalesce((select coalesce(bayi_sahibi, id) from profiller where id = v_teklif.bayi_id), v_teklif.bayi_id) <> v_havuz then
    raise exception 'Bu teklif senin mağaza havuzuna ait değil.';
  end if;
  update stok_hareket set aktif = false
   where teklif_id = p_teklif_id and tip = 'satis' and aktif;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 6) REZERVE: süreli, otomatik düşer (varsayılan 48 saat), uzatılabilir.
create or replace function public.fq_rezerve_koy(
  p_model_kodu text, p_marka text, p_depo text, p_adet int,
  p_saat int default 48, p_not text default null)
returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_havuz uuid; v_net int; v_ad text; v_id bigint;
begin
  if not public.erisebilir() then raise exception 'Erişim yok.'; end if;
  v_havuz := public.fq_stok_sahibi();
  if p_depo not in ('mars','horoz','kadikoy') then raise exception 'Geçersiz depo.'; end if;
  if p_marka not in ('bosch','siemens') then raise exception 'Geçersiz marka.'; end if;
  if coalesce(p_adet,0) not between 1 and 99 then raise exception 'Adet 1-99 arası olmalı.'; end if;
  if coalesce(p_saat,0) not between 1 and 336 then raise exception 'Süre 1-336 saat arası olmalı.'; end if;
  if length(coalesce(p_model_kodu,'')) not between 3 and 40 then raise exception 'Geçersiz ürün kodu.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_havuz::text, 42));
  select n.net into v_net from public.fq_stok_net_depo(v_havuz, p_model_kodu, p_marka) n where n.depo = p_depo;
  if coalesce(v_net, 0) < p_adet then
    raise exception 'YETERSIZ_STOK [{"model_kodu":"%","depo":"%","net":%,"istenen":%}]',
      upper(p_model_kodu), p_depo, coalesce(v_net,0), p_adet;
  end if;

  select ad into v_ad from profiller where id = auth.uid();
  insert into stok_hareket (bayi_id, model_kodu, marka, depo, tip, adet, rezerve_bitis, notu, ekleyen, ekleyen_ad)
  values (v_havuz, upper(p_model_kodu), lower(p_marka), p_depo, 'rezerve',
          p_adet, now() + make_interval(hours => p_saat), nullif(trim(p_not),''), auth.uid(), v_ad)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.fq_rezerve_kaldir(p_id bigint)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_havuz uuid;
begin
  if not public.erisebilir() then raise exception 'Erişim yok.'; end if;
  v_havuz := public.fq_stok_sahibi();
  -- Havuzdaki herkes kaldırabilir: mağaza içi pratiklik (satıcı A'nın rezervesini
  -- kapanışta satıcı B çözebilmeli). Kayıt silinmez, pasifleşir.
  update stok_hareket set aktif = false
   where id = p_id and tip = 'rezerve' and aktif and bayi_id = v_havuz;
  return found;
end $$;

create or replace function public.fq_rezerve_uzat(p_id bigint, p_saat int default 48)
returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare v_havuz uuid; v_yeni timestamptz;
begin
  if not public.erisebilir() then raise exception 'Erişim yok.'; end if;
  if coalesce(p_saat,0) not between 1 and 336 then raise exception 'Süre 1-336 saat arası olmalı.'; end if;
  v_havuz := public.fq_stok_sahibi();
  update stok_hareket
     set rezerve_bitis = greatest(rezerve_bitis, now()) + make_interval(hours => p_saat)
   where id = p_id and tip = 'rezerve' and aktif and bayi_id = v_havuz
  returning rezerve_bitis into v_yeni;
  if v_yeni is null then raise exception 'Rezerve bulunamadı.'; end if;
  return v_yeni;
end $$;

-- 7) Havuzun aktif rezerve listesi (süresi geçenler otomatik görünmez).
create or replace function public.fq_rezerve_listesi(p_marka text)
returns table(id bigint, model_kodu text, depo text, adet int,
              rezerve_bitis timestamptz, kalan_dakika int, notu text,
              ekleyen_ad text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select h.id, h.model_kodu, h.depo, h.adet, h.rezerve_bitis,
         greatest(0, floor(extract(epoch from (h.rezerve_bitis - now())) / 60))::int,
         h.notu, h.ekleyen_ad, h.created_at
  from stok_hareket h
  where public.erisebilir()
    and h.bayi_id = public.fq_stok_sahibi()
    and h.marka = lower(p_marka)
    and h.tip = 'rezerve' and h.aktif and h.rezerve_bitis > now()
  order by h.rezerve_bitis;
$$;

-- 8) İzinler: yalnız oturumlu kullanıcı; anonim çağrı yok.
revoke all on function public.fq_stok_sahibi()                                   from public, anon;
revoke all on function public.fq_stok_net_depo(uuid,text,text)                   from public, anon;
revoke all on function public.fq_stok_satis_kaydet(uuid,jsonb,boolean)           from public, anon;
revoke all on function public.fq_stok_satis_geri_al(uuid)                        from public, anon;
revoke all on function public.fq_rezerve_koy(text,text,text,int,int,text)        from public, anon;
revoke all on function public.fq_rezerve_kaldir(bigint)                          from public, anon;
revoke all on function public.fq_rezerve_uzat(bigint,int)                        from public, anon;
revoke all on function public.fq_rezerve_listesi(text)                           from public, anon;
grant execute on function public.fq_stok_sahibi()                                 to authenticated;
grant execute on function public.fq_stok_net_depo(uuid,text,text)                 to authenticated;
grant execute on function public.fq_stok_satis_kaydet(uuid,jsonb,boolean)         to authenticated;
grant execute on function public.fq_stok_satis_geri_al(uuid)                      to authenticated;
grant execute on function public.fq_rezerve_koy(text,text,text,int,int,text)      to authenticated;
grant execute on function public.fq_rezerve_kaldir(bigint)                        to authenticated;
grant execute on function public.fq_rezerve_uzat(bigint,int)                      to authenticated;
grant execute on function public.fq_rezerve_listesi(text)                         to authenticated;

-- ================================================================
-- KONTROL
-- ================================================================
select 'stok_hareket tablosu' as kontrol, count(*)::text as sonuc from stok_hareket
union all
select 'fq_ stok fonksiyonları', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('fq_stok_sahibi','fq_stok_net_depo','fq_stok_satis_kaydet','fq_stok_satis_geri_al',
   'fq_rezerve_koy','fq_rezerve_kaldir','fq_rezerve_uzat','fq_rezerve_listesi');
