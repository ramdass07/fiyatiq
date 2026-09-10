-- v11.8: additive actual-sale fields and a server-side report over caller-visible rows.
-- Historical quote totals/snapshots and existing RLS policies are unchanged.
alter table public.teklifler
 add column gercek_satis_tutari numeric(14,2),
 add column satis_odeme_sekli text,
 add column satis_banka text,
 add column satis_taksit_sayisi integer,
 add column satis_tarihi date,
 add constraint fq_actual_sale_amount check (gercek_satis_tutari is null or (gercek_satis_tutari>=0 and gercek_satis_tutari<>'NaN'::numeric)),
 add constraint fq_actual_sale_method check (satis_odeme_sekli is null or satis_odeme_sekli in ('nakit','havale','kart','karma','diger')),
 add constraint fq_actual_sale_bank check (satis_banka is null or char_length(satis_banka)<=120),
 add constraint fq_actual_sale_installments check (satis_taksit_sayisi is null or satis_taksit_sayisi between 1 and 60),
 add constraint fq_actual_sale_coherence check (
  (gercek_satis_tutari is null and satis_odeme_sekli is null and satis_banka is null and satis_taksit_sayisi is null and satis_tarihi is null)
  or (durum='satildi' and gercek_satis_tutari is not null and satis_odeme_sekli is not null and satis_tarihi is not null)
 );

comment on column public.teklifler.gercek_satis_tutari is 'Customer-accepted actual sale amount. NULL means not recorded. Never inferred from quote cash equivalent satis_tutari/toplam.';
comment on column public.teklifler.satis_tarihi is 'Actual sale calendar date as entered by the seller (Europe/Istanbul business date).';

create or replace function public.fq_takip_damga()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 new.takip_notu := btrim(coalesce(new.takip_notu,''));
 new.takip_sorumlusu := btrim(coalesce(new.takip_sorumlusu,''));
 new.kayip_nedeni := btrim(coalesce(new.kayip_nedeni,''));
 new.satis_odeme_sekli := nullif(btrim(new.satis_odeme_sekli),'');
 new.satis_banka := nullif(btrim(new.satis_banka),'');
 if new.durum in ('satildi','kaybedildi') then new.sonraki_arama := null; end if;
 if new.durum is distinct from 'kaybedildi' then new.kayip_nedeni := ''; end if;
 if new.durum is distinct from 'satildi' then
  new.gercek_satis_tutari := null; new.satis_odeme_sekli := null;
  new.satis_banka := null; new.satis_taksit_sayisi := null; new.satis_tarihi := null;
 end if;
 if new.durum='kaybedildi' and new.kayip_nedeni='' then
  if tg_op='INSERT' then raise exception 'Kaybedilen teklif için kayıp nedeni gerekli';
  elsif old.durum is distinct from 'kaybedildi' or btrim(coalesce(old.kayip_nedeni,''))<>'' then raise exception 'Kaybedilen teklif için kayıp nedeni gerekli';
  end if;
 end if;
 if tg_op='INSERT' then
  new.takip_surumu := 0; new.takip_guncellendi_at := null; new.takip_guncelleyen := null;
  if new.takip_notu<>'' or new.sonraki_arama is not null or new.takip_sorumlusu<>'' or new.kayip_nedeni<>''
    or new.gercek_satis_tutari is not null or new.satis_odeme_sekli is not null or new.satis_banka is not null
    or new.satis_taksit_sayisi is not null or new.satis_tarihi is not null then
   new.takip_surumu := 1; new.takip_guncellendi_at := clock_timestamp(); new.takip_guncelleyen := auth.uid();
  end if;
 elsif row(new.durum,new.takip_notu,new.sonraki_arama,new.takip_sorumlusu,new.kayip_nedeni,
   new.gercek_satis_tutari,new.satis_odeme_sekli,new.satis_banka,new.satis_taksit_sayisi,new.satis_tarihi)
  is distinct from row(old.durum,old.takip_notu,old.sonraki_arama,old.takip_sorumlusu,old.kayip_nedeni,
   old.gercek_satis_tutari,old.satis_odeme_sekli,old.satis_banka,old.satis_taksit_sayisi,old.satis_tarihi) then
  new.takip_surumu := old.takip_surumu+1;
  new.takip_guncellendi_at := clock_timestamp(); new.takip_guncelleyen := auth.uid();
 else
  new.takip_surumu := old.takip_surumu;
  new.takip_guncellendi_at := old.takip_guncellendi_at; new.takip_guncelleyen := old.takip_guncelleyen;
 end if;
 return new;
end;
$$;
revoke all on function public.fq_takip_damga() from public, anon, authenticated;

create or replace function public.fq_teklif_raporu(
 p_ara text default '', p_baslangic date default null, p_bitis date default null,
 p_magaza text default null, p_durum text default null,
 p_page integer default 0, p_page_size integer default 50
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 result jsonb;
 search_text text := lower(btrim(coalesce(p_ara,'')));
 store_filter text := nullif(btrim(p_magaza),'');
 status_filter text := nullif(btrim(p_durum),'');
 page_size integer := greatest(1,least(500,coalesce(p_page_size,50)));
 page_number bigint := greatest(0,coalesce(p_page,0));
begin
 -- Authorization comes from the protected profile, never editable JWT metadata.
 -- Invoker security leaves both quotes and profile fallbacks under caller RLS.
 if auth.uid() is null or not exists (
  select 1 from public.profiller p where p.id=auth.uid()
   and (p.rol='admin' or (p.rol='personel' and p.abonelik_durumu in ('aktif','deneme')))
 ) then raise exception using errcode='42501',message='Teklif raporu için yönetim yetkisi gerekli'; end if;
 if status_filter is not null and status_filter not in ('teklif','satildi','kaybedildi') then
  raise exception using errcode='22023',message='Geçersiz teklif durumu';
 end if;
 if p_baslangic is not null and p_bitis is not null and p_baslangic>p_bitis then
  raise exception using errcode='22023',message='Başlangıç tarihi bitiş tarihinden sonra olamaz';
 end if;
 with source as materialized (
  select t.*,case when jsonb_typeof(t.satirlar)='object' then t.satirlar else '{}'::jsonb end as saved,
    p.magaza as profile_store,p.ad as profile_name,p.rol as profile_role
  from public.teklifler t left join public.profiller p on p.id=t.bayi_id
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
   coalesce(marka::text,'') as marka,coalesce(toplam,0) as toplam,
   coalesce(nullif(btrim(durum),''),'teklif') as durum,
   coalesce((select string_agg(coalesce(nullif(x.value->>'model',''),nullif(x.value->>'kod','')),', ' order by x.ordinality)
    from jsonb_array_elements(item_array) with ordinality x(value,ordinality)), '') as urunler,
   gercek_satis_tutari,satis_odeme_sekli,satis_banka,satis_taksit_sayisi,satis_tarihi
  from normalized
 ), filtered as materialized (
  select s.* from scope s
  where (store_filter is null or s.magaza=store_filter)
   and (p_baslangic is null or s.tarih>=p_baslangic::timestamp at time zone 'Europe/Istanbul')
   and (p_bitis is null or s.tarih<(p_bitis+1)::timestamp at time zone 'Europe/Istanbul')
   and (search_text='' or position(search_text in lower(concat_ws(' ',s.no,s.musteri,s.tel,s.personel,s.magaza,s.urunler)))>0)
 ), displayed as materialized (
  select f.* from filtered f where status_filter is null or f.durum=status_filter
 ), page_rows as (
  select * from displayed order by tarih desc nulls last,id desc
  limit page_size offset page_number*page_size
 ), summary as (
  select count(*) as quote_count,coalesce(sum(toplam),0) as cash_total,coalesce(avg(toplam),0) as average_cash,
   count(*) filter(where durum='satildi') as sold_count,
   coalesce(sum(toplam) filter(where durum='satildi'),0) as sold_cash_total,
   case when count(*)=0 then 0 else 100.0*count(*) filter(where durum='satildi')/count(*) end as conversion_rate,
   count(*) filter(where durum='satildi' and gercek_satis_tutari is not null) as actual_sale_count,
   coalesce(sum(gercek_satis_tutari) filter(where durum='satildi'),0) as actual_sale_total,
   count(*) filter(where durum='satildi' and gercek_satis_tutari is null) as missing_actual_count
  from filtered
 )
 select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(to_jsonb(p) order by tarih desc nulls last,id desc) from page_rows p),'[]'::jsonb),
  'total_count',(select count(*) from displayed),
  'summary',(select to_jsonb(s) from summary s),
  'stores',coalesce((select jsonb_agg(magaza order by magaza) from (select distinct magaza from scope where magaza<>'—') m),'[]'::jsonb),
  -- All pages use the same fingerprint of the complete report cohort. The client
  -- aborts/retries export if this changes; this is not a cross-request DB snapshot.
  'report_revision',(select md5(coalesce(string_agg(md5(to_jsonb(f)::text),'' order by id),'')) from filtered f)
 ) into result;
 return result;
end;
$$;
revoke all on function public.fq_teklif_raporu(text,date,date,text,text,integer,integer) from public,anon;
grant execute on function public.fq_teklif_raporu(text,date,date,text,text,integer,integer) to authenticated;
comment on function public.fq_teklif_raporu(text,date,date,text,text,integer,integer) is 'Management-only report under caller RLS; summary ignores status filter; Istanbul date boundaries; 0-based paginated rows; full-cohort revision for export change detection.';
notify pgrst, 'reload schema';
