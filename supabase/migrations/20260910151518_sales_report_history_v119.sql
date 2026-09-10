SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- v11.9: actual-sales-date report. This adds one read-only RPC only.
-- Existing quote report, price snapshots, follow-up triggers and RLS stay intact.
create or replace function public.fq_satis_raporu(
 p_ara text default '', p_baslangic date default null, p_bitis date default null,
 p_magaza text default null, p_page integer default 0, p_page_size integer default 50
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 result jsonb;
 search_text text := lower(btrim(coalesce(p_ara,'')));
 store_filter text := nullif(btrim(p_magaza),'');
 page_size integer := greatest(1,least(500,coalesce(p_page_size,50)));
 page_number bigint := greatest(0,coalesce(p_page,0));
begin
 -- Protected profile authorization; caller RLS still applies to both tables.
 if auth.uid() is null or not exists (
  select 1 from public.profiller p where p.id=auth.uid()
   and (p.rol='admin' or (p.rol='personel' and p.abonelik_durumu in ('aktif','deneme')))
 ) then raise exception using errcode='42501',message='Satış raporu için yönetim yetkisi gerekli'; end if;
 if (p_baslangic is not null and not isfinite(p_baslangic))
  or (p_bitis is not null and not isfinite(p_bitis)) then
  raise exception using errcode='22023',message='Geçerli bir satış tarihi aralığı seçin';
 end if;
 if p_baslangic is not null and p_bitis is not null and p_baslangic>p_bitis then
  raise exception using errcode='22023',message='Başlangıç tarihi bitiş tarihinden sonra olamaz';
 end if;
 with source as materialized (
  select t.*,case when jsonb_typeof(t.satirlar)='object' then t.satirlar else '{}'::jsonb end as saved,
    p.magaza as profile_store,p.ad as profile_name,p.rol as profile_role
  from public.teklifler t left join public.profiller p on p.id=t.bayi_id
  where t.durum='satildi'
 ), normalized as (
  select s.*,
   coalesce(nullif(btrim(saved->>'magaza'),''),nullif(btrim(profile_store),''),nullif(btrim(profile_name),''),'—') as raw_store,
   case when jsonb_typeof(satirlar)='array' then satirlar
    when jsonb_typeof(saved->'items')='array' then saved->'items'
    else '[]'::jsonb end as item_array
  from source s
 ), scope as materialized (
  select id,
   coalesce(nullif(btrim(saved->>'no'),''),nullif(btrim(teklif_no),''),'—') as no,
   coalesce(nullif(btrim(saved->>'personel'),''),'—') as personel,
   case when position('@' in raw_store)>0 then
    case profile_role when 'admin' then 'Merkez (yönetim)' when 'personel' then 'Merkez' else 'Mağaza' end
    else raw_store end as magaza,
   created_at as tarih,coalesce(musteri_ad,'') as musteri,coalesce(musteri_tel,'') as tel,
   coalesce(marka::text,'') as marka,coalesce(toplam,0) as toplam,durum,
   coalesce((select string_agg(coalesce(nullif(x.value->>'model',''),nullif(x.value->>'kod','')),', ' order by x.ordinality)
    from jsonb_array_elements(item_array) with ordinality x(value,ordinality)), '') as urunler,
   gercek_satis_tutari,satis_odeme_sekli,satis_banka,satis_taksit_sayisi,satis_tarihi
  from normalized
 ), matched as materialized (
  select s.* from scope s
  where (store_filter is null or s.magaza=store_filter)
   and (search_text='' or position(search_text in lower(concat_ws(' ',s.no,s.musteri,s.tel,s.personel,s.magaza,s.urunler)))>0)
 ), dated as materialized (
  -- Sale date is a stored Istanbul business calendar date, not a timestamp.
  -- NULL/nonfinite legacy dates cannot be assigned to a reporting period.
  select s.* from matched s
  where s.satis_tarihi is not null and isfinite(s.satis_tarihi)
   and (p_baslangic is null or s.satis_tarihi>=p_baslangic)
   and (p_bitis is null or s.satis_tarihi<=p_bitis)
 ), undated as (
  select count(*) as sales_count from matched
  where satis_tarihi is null or not isfinite(satis_tarihi)
 ), page_rows as (
  select * from dated order by satis_tarihi desc,tarih desc nulls last,id desc
  limit page_size offset page_number*page_size
 ), summary as (
  select count(*) as sale_count,coalesce(sum(gercek_satis_tutari),0) as actual_sale_total,
   coalesce(avg(gercek_satis_tutari),0) as average_actual_sale
  from dated
 )
 select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(to_jsonb(p) order by satis_tarihi desc,tarih desc nulls last,id desc) from page_rows p),'[]'::jsonb),
  'total_count',(select count(*) from dated),
  'summary',(select to_jsonb(s) from summary s),
  'undated_sales_count',(select sales_count from undated),
  'stores',coalesce((select jsonb_agg(magaza order by magaza) from (select distinct magaza from scope where magaza<>'—') m),'[]'::jsonb),
  -- Export retries if any projected dated row or the separate unknown count
  -- changes. This is change detection, not a cross-request database snapshot.
  'report_revision',md5(jsonb_build_object(
   'dated',(select md5(coalesce(string_agg(md5(to_jsonb(d)::text),'' order by id),'')) from dated d),
   'undated_sales_count',(select sales_count from undated)
  )::text)
 ) into result;
 return result;
end;
$$;
revoke all on function public.fq_satis_raporu(text,date,date,text,integer,integer) from public,anon;
grant execute on function public.fq_satis_raporu(text,date,date,text,integer,integer) to authenticated;
comment on function public.fq_satis_raporu(text,date,date,text,integer,integer) is 'Management-only actual sales report under caller RLS. Inclusive stored sale dates; no conversion metric or inferred legacy actuals. Undated sold count ignores period, applies search/store. 0-based pages with full-cohort export revision.';
notify pgrst, 'reload schema';


-- v11.9: server-created, append-only quote history; no historic reconstruction.
-- Existing quotes are read once as a labelled baseline and are never updated here.
-- A short table lock makes baseline capture + trigger installation atomic.
lock table public.teklifler in share row exclusive mode;

create schema if not exists fq_private;
revoke all on schema fq_private from public,anon,authenticated;

create table public.fq_teklif_gecmisi (
 id bigint generated always as identity primary key,
 teklif_id uuid not null references public.teklifler(id) on delete restrict,
 olusturuldu_at timestamptz not null default clock_timestamp(),
 islem text not null check (islem in ('baslangic','olusturuldu','degisti')),
 actor_id uuid,
 islem_yapan text not null,
 degisiklikler jsonb not null check (jsonb_typeof(degisiklikler)='object' and degisiklikler<>'{}'::jsonb)
);
create index fq_teklif_gecmisi_teklif_cursor on public.fq_teklif_gecmisi(teklif_id,id desc);
alter table public.fq_teklif_gecmisi enable row level security;
revoke all on public.fq_teklif_gecmisi from public,anon,authenticated,service_role;
revoke all on sequence public.fq_teklif_gecmisi_id_seq from public,anon,authenticated,service_role;
grant select on public.fq_teklif_gecmisi to authenticated;
create policy fq_teklif_gecmisi_read on public.fq_teklif_gecmisi
 for select to authenticated using (
  (select auth.uid()) is not null and exists (
   select 1 from public.teklifler t where t.id=fq_teklif_gecmisi.teklif_id
  )
 );
comment on table public.fq_teklif_gecmisi is 'Immutable to API clients. RLS follows current access to the underlying quote. baslangic records current state at migration time, not reconstructed past actions. Quote deletion is restricted while history exists.';
comment on column public.fq_teklif_gecmisi.actor_id is 'Authenticated account UUID at write time, not individual employee attribution. NULL identifies baseline/system maintenance; no FK so account removal does not alter historical events.';

-- Safe scalar normalization: malformed/legacy snapshots must not break saves.
-- Strings containing objects/arrays are not parsed; unknown keys are never copied.
create function fq_private.fq_history_number(p_value jsonb,p_round boolean default false)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare n numeric;
begin
 if jsonb_typeof(p_value)='number' then n:=(p_value#>>'{}')::numeric;
 elsif jsonb_typeof(p_value)='string' and (p_value#>>'{}') ~ '^-?[0-9]{1,16}([.][0-9]{1,8})?$' then n:=(p_value#>>'{}')::numeric;
 else return 'null'::jsonb; end if;
 if p_round then n:=round(n); end if;
 return to_jsonb(n);
end;
$$;
revoke all on function fq_private.fq_history_number(jsonb,boolean) from public,anon,authenticated,service_role;

create function fq_private.fq_history_text(p_value jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(p_value)='string' then p_value else 'null'::jsonb end;
$$;
revoke all on function fq_private.fq_history_text(jsonb) from public,anon,authenticated,service_role;

create function fq_private.fq_history_state(p_quote public.teklifler)
returns jsonb language plpgsql immutable security invoker set search_path='' set timezone='UTC' as $$
declare
 saved jsonb:=case when jsonb_typeof(p_quote.satirlar)='object' then p_quote.satirlar else '{}'::jsonb end;
 source jsonb;
 item jsonb;
 items jsonb:='[]'::jsonb;
 modern boolean:=false;
 value jsonb;
begin
 if jsonb_typeof(saved->'net_items')='array' then
  if jsonb_array_length(saved->'net_items')>0 then source:=saved->'net_items'; modern:=true; end if;
 end if;
 if modern then null;
 elsif jsonb_typeof(p_quote.satirlar)='array' then source:=p_quote.satirlar;
 elsif jsonb_typeof(saved->'items')='array' then source:=saved->'items';
 else source:='[]'::jsonb; end if;
 for item in select x.value from jsonb_array_elements(source) x loop
  if jsonb_typeof(item)<>'object' then continue; end if;
  value:=jsonb_build_object(
   'model',coalesce(nullif(fq_private.fq_history_text(item->'model'),'null'::jsonb),fq_private.fq_history_text(item->'kod')),
   'ad',fq_private.fq_history_text(item->'ad'),'adet',fq_private.fq_history_number(item->'adet')
  );
  if modern then
   value:=value||jsonb_build_object('toplam_nakit',fq_private.fq_history_number(item->'net_nakit'),
    'toplam_taksit',fq_private.fq_history_number(item->'net_taksit'));
  end if;
  items:=items||jsonb_build_array(value);
 end loop;
 return jsonb_build_object(
  'teklif_no',coalesce(nullif(p_quote.teklif_no,''),case when jsonb_typeof(saved->'no')='string' then saved->>'no' end),
  'marka',p_quote.marka,'musteri_ad',p_quote.musteri_ad,'musteri_tel',p_quote.musteri_tel,
  'personel',fq_private.fq_history_text(saved->'personel'),'magaza',fq_private.fq_history_text(saved->'magaza'),
  'teklif_tarihi',p_quote.created_at,'gecerlilik_bitis',fq_private.fq_history_text(saved#>'{gecerlilik,valid_until}'),
  'toplam',p_quote.toplam,'taksitli_toplam',fq_private.fq_history_number(saved#>'{hesap,finalTaksit}',true),
  'banka',fq_private.fq_history_text(saved->'banka'),'taksit',fq_private.fq_history_number(saved->'taksit'),
  'urunler',items,'durum',p_quote.durum,'takip_notu',p_quote.takip_notu,
  'takip_sorumlusu',p_quote.takip_sorumlusu,'sonraki_arama',p_quote.sonraki_arama,'kayip_nedeni',p_quote.kayip_nedeni,
  'gercek_satis_tutari',p_quote.gercek_satis_tutari,'satis_odeme_sekli',p_quote.satis_odeme_sekli,
  'satis_banka',p_quote.satis_banka,'satis_taksit_sayisi',p_quote.satis_taksit_sayisi,'satis_tarihi',p_quote.satis_tarihi
 );
end;
$$;
revoke all on function fq_private.fq_history_state(public.teklifler) from public,anon,authenticated,service_role;

-- SECURITY DEFINER is limited to this private, non-callable trigger. It is needed
-- solely to append events while client INSERT/UPDATE/DELETE on history are denied.
create function fq_private.fq_quote_history_capture()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); actor_name text; actor_store text; actor_role text;
 before_state jsonb:='{}'::jsonb; after_state jsonb; changes jsonb; event_type text;
begin
 if tg_relid<>'public.teklifler'::regclass or tg_when<>'AFTER' or tg_op not in ('INSERT','UPDATE') then
  raise exception using errcode='42501',message='Geçmiş kaydı yalnız teklif işlemiyle oluşturulur';
 end if;
 -- API callers without a subject cannot manufacture system-attributed events.
 -- Database owners and service maintenance without a JWT remain supported.
 if actor is null and (current_setting('role',true) in ('anon','authenticated') or session_user in ('anon','authenticated')) then
  raise exception using errcode='42501',message='Geçmiş kaydı için geçerli oturum gerekli';
 end if;
 after_state:=fq_private.fq_history_state(new);
 if tg_op='UPDATE' then before_state:=fq_private.fq_history_state(old); event_type:='degisti';
 else event_type:='olusturuldu'; end if;
 select coalesce(jsonb_object_agg(x.key,jsonb_build_object('once',before_state->x.key,'sonra',x.value)),'{}'::jsonb)
 into changes from jsonb_each(after_state) x
 where tg_op='INSERT' or before_state->x.key is distinct from x.value;
 if changes='{}'::jsonb then return new; end if;
 if actor is null then actor_name:='Sistem işlemi';
 else
  select nullif(btrim(p.ad),''),nullif(btrim(p.magaza),''),p.rol::text
  into actor_name,actor_store,actor_role from public.profiller p where p.id=actor;
  actor_name:=coalesce(actor_store,actor_name,'Kayıtlı hesap');
  if position('@' in actor_name)>0 then actor_name:='Kayıtlı hesap'; end if;
  actor_name:=left(regexp_replace(actor_name,'[[:cntrl:]]',' ','g'),160)||
   case actor_role when 'admin' then ' · yönetim hesabı' when 'personel' then ' · merkez hesabı' else ' · mağaza hesabı' end;
 end if;
 insert into public.fq_teklif_gecmisi(teklif_id,islem,actor_id,islem_yapan,degisiklikler)
 values(new.id,event_type,actor,actor_name,changes);
 return new;
end;
$$;
revoke all on function fq_private.fq_quote_history_capture() from public,anon,authenticated,service_role;

-- Baseline timestamp intentionally defaults to NOW of this migration, not the
-- older quote creation date. It records current state only, with no prior actor.
insert into public.fq_teklif_gecmisi(teklif_id,islem,actor_id,islem_yapan,degisiklikler)
select t.id,'baslangic',null,'Sistem · geçmiş kaydı başlangıcı',
 (select jsonb_object_agg(x.key,jsonb_build_object('once',null,'sonra',x.value))
  from jsonb_each(fq_private.fq_history_state(t)) x)
from public.teklifler t;

create trigger fq_quote_history_capture after insert or update on public.teklifler
 for each row execute function fq_private.fq_quote_history_capture();

create function public.fq_teklif_gecmisi_oku(p_teklif_id uuid,p_before_id bigint default null,p_page_size integer default 30)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; page_size integer:=greatest(1,least(100,coalesce(p_page_size,30)));
begin
 if auth.uid() is null or p_teklif_id is null or not exists(select 1 from public.teklifler t where t.id=p_teklif_id) then
  return jsonb_build_object('rows','[]'::jsonb,'has_more',false);
 end if;
 with candidates as materialized (
  select h.id,h.olusturuldu_at,h.islem,h.islem_yapan,h.degisiklikler
  from public.fq_teklif_gecmisi h
  where h.teklif_id=p_teklif_id and (p_before_id is null or h.id<p_before_id)
  order by h.id desc limit page_size+1
 ), page_rows as (select * from candidates order by id desc limit page_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object(
  'id',p.id::text,'olusturuldu_at',p.olusturuldu_at,'islem',p.islem,'islem_yapan',p.islem_yapan,'degisiklikler',p.degisiklikler
 ) order by p.id desc) from page_rows p),'[]'::jsonb),
 'has_more',(select count(*)>page_size from candidates)) into result;
 return result;
end;
$$;
revoke all on function public.fq_teklif_gecmisi_oku(uuid,bigint,integer) from public,anon,service_role;
grant execute on function public.fq_teklif_gecmisi_oku(uuid,bigint,integer) to authenticated;
comment on function public.fq_teklif_gecmisi_oku(uuid,bigint,integer) is 'Read-only quote history under current quote RLS; cursor is bigint but IDs are JSON strings to avoid browser precision loss; inaccessible and unknown quotes return the same empty response.';
notify pgrst,'reload schema';
