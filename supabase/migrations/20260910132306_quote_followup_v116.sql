-- Additive quote follow-up fields. Existing offer snapshots and RLS stay in place.
alter table public.teklifler
 add column if not exists takip_notu text not null default '' check (char_length(takip_notu)<=2000),
 add column if not exists sonraki_arama timestamptz,
 add column if not exists takip_sorumlusu text not null default '' check (char_length(takip_sorumlusu)<=100),
 add column if not exists kayip_nedeni text not null default '' check (char_length(kayip_nedeni)<=500),
 add column if not exists takip_surumu integer not null default 0,
 add column if not exists takip_guncellendi_at timestamptz,
 add column if not exists takip_guncelleyen uuid;

create or replace function public.fq_takip_damga()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 new.takip_notu := btrim(coalesce(new.takip_notu,''));
 new.takip_sorumlusu := btrim(coalesce(new.takip_sorumlusu,''));
 new.kayip_nedeni := btrim(coalesce(new.kayip_nedeni,''));
 if new.durum in ('satildi','kaybedildi') then new.sonraki_arama := null; end if;
 if new.durum is distinct from 'kaybedildi' then new.kayip_nedeni := ''; end if;
 if new.durum='kaybedildi' and new.kayip_nedeni='' then
  if tg_op='INSERT' then raise exception 'Kaybedilen teklif için kayıp nedeni gerekli';
  elsif old.durum is distinct from 'kaybedildi' then raise exception 'Kaybedilen teklif için kayıp nedeni gerekli';
  end if;
 end if;
 if tg_op='INSERT' then
  new.takip_surumu := 0;
  new.takip_guncellendi_at := null;
  new.takip_guncelleyen := null;
  if new.takip_notu<>'' or new.sonraki_arama is not null or new.takip_sorumlusu<>'' or new.kayip_nedeni<>'' then
   new.takip_surumu := 1; new.takip_guncellendi_at := clock_timestamp(); new.takip_guncelleyen := auth.uid();
  end if;
 elsif row(new.durum,new.takip_notu,new.sonraki_arama,new.takip_sorumlusu,new.kayip_nedeni)
  is distinct from row(old.durum,old.takip_notu,old.sonraki_arama,old.takip_sorumlusu,old.kayip_nedeni) then
  new.takip_surumu := old.takip_surumu+1;
  new.takip_guncellendi_at := clock_timestamp(); new.takip_guncelleyen := auth.uid();
 else
  new.takip_surumu := old.takip_surumu;
  new.takip_guncellendi_at := old.takip_guncellendi_at;
  new.takip_guncelleyen := old.takip_guncelleyen;
 end if;
 return new;
end;
$$;
revoke all on function public.fq_takip_damga() from public, anon, authenticated;
create trigger fq_takip_damga before insert or update on public.teklifler
for each row execute function public.fq_takip_damga();
create index if not exists fq_teklif_takip_idx on public.teklifler (bayi_id,durum,sonraki_arama) where sonraki_arama is not null;
notify pgrst, 'reload schema';

create or replace function public.fq_takip_damga()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 new.takip_notu := btrim(coalesce(new.takip_notu,''));
 new.takip_sorumlusu := btrim(coalesce(new.takip_sorumlusu,''));
 new.kayip_nedeni := btrim(coalesce(new.kayip_nedeni,''));
 if new.durum in ('satildi','kaybedildi') then new.sonraki_arama := null; end if;
 if new.durum is distinct from 'kaybedildi' then new.kayip_nedeni := ''; end if;
 if new.durum='kaybedildi' and new.kayip_nedeni='' then
  if tg_op='INSERT' then raise exception 'Kaybedilen teklif için kayıp nedeni gerekli';
  elsif old.durum is distinct from 'kaybedildi' or btrim(coalesce(old.kayip_nedeni,''))<>'' then raise exception 'Kaybedilen teklif için kayıp nedeni gerekli';
  end if;
 end if;
 if tg_op='INSERT' then
  new.takip_surumu := 0;
  new.takip_guncellendi_at := null;
  new.takip_guncelleyen := null;
  if new.takip_notu<>'' or new.sonraki_arama is not null or new.takip_sorumlusu<>'' or new.kayip_nedeni<>'' then
   new.takip_surumu := 1; new.takip_guncellendi_at := clock_timestamp(); new.takip_guncelleyen := auth.uid();
  end if;
 elsif row(new.durum,new.takip_notu,new.sonraki_arama,new.takip_sorumlusu,new.kayip_nedeni)
  is distinct from row(old.durum,old.takip_notu,old.sonraki_arama,old.takip_sorumlusu,old.kayip_nedeni) then
  new.takip_surumu := old.takip_surumu+1;
  new.takip_guncellendi_at := clock_timestamp(); new.takip_guncelleyen := auth.uid();
 else
  new.takip_surumu := old.takip_surumu;
  new.takip_guncellendi_at := old.takip_guncellendi_at;
  new.takip_guncelleyen := old.takip_guncelleyen;
 end if;
 return new;
end;
$$;
