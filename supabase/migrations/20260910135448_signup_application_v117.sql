-- FiyatIQ v11.7 signup/profile proposal. Review and copy into a CLI-created migration.
-- Applicant-controlled metadata is descriptive application data, never authorization.
-- Existing profile roles, subscription status, granted brands and stock ownership stay unchanged.

alter table public.profiller
  add column if not exists basvuru_markalari public.marka_tipi[] not null
  default '{}'::public.marka_tipi[];

comment on column public.profiller.basvuru_markalari is
  'Untrusted signup brand request for administrator review. Never used for authorization; granted brands are marka_erisimi.';

-- Defaults affect future inserts only. Existing granted brands are preserved.
alter table public.profiller alter column marka_erisimi
  set default '{}'::public.marka_tipi[];

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_json jsonb;
  requested public.marka_tipi[];
  applicant_name text;
  applicant_store text;
begin
  -- New clients send an explicit array; old clients send the single `marka` string.
  if jsonb_typeof(meta->'basvuru_markalari') = 'array' then
    requested_json := meta->'basvuru_markalari';
  elsif jsonb_typeof(meta->'marka') = 'string' then
    requested_json := jsonb_build_array(meta->>'marka');
  else
    requested_json := '[]'::jsonb;
  end if;

  select coalesce(array_agg(distinct lower(btrim(e.value))::public.marka_tipi
                           order by lower(btrim(e.value))::public.marka_tipi),
                  '{}'::public.marka_tipi[])
  into requested
  from jsonb_array_elements_text(requested_json) as e(value)
  where lower(btrim(e.value)) in ('bosch', 'siemens');

  applicant_name := case when jsonb_typeof(meta->'ad') = 'string'
    then nullif(left(btrim(meta->>'ad'),120),'') end;
  applicant_store := case when jsonb_typeof(meta->'magaza') = 'string'
    then nullif(left(btrim(meta->>'magaza'),160),'') end;

  insert into public.profiller
    (id, ad, magaza, rol, abonelik_durumu, marka_erisimi,
     bayi_sahibi, basvuru_markalari)
  values
    (new.id, coalesce(applicant_name,new.email), applicant_store,
     'bayi', 'pasif', '{}'::public.marka_tipi[], null, requested)
  on conflict (id) do nothing;
  return new;
end
$function$;

-- Trigger-only function: no public RPC entry point is needed.
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Production already has this trigger; Deneme currently has only the function.
do $block$
begin
  if not exists (select 1 from pg_trigger
                 where tgrelid='auth.users'::regclass
                   and tgname='on_auth_user_created'
                   and not tgisinternal) then
    create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.handle_new_user();
  elsif not exists (select 1 from pg_trigger
                    where tgrelid='auth.users'::regclass
                      and tgname='on_auth_user_created'
                      and tgfoid='public.handle_new_user()'::regprocedure
                      and tgenabled in ('O','A')) then
    raise exception 'Existing signup trigger differs from the inspected configuration';
  end if;
end
$block$;

-- Descriptive repair for legacy passive bayi applications only. Authorization
-- fields are intentionally absent from this UPDATE. Active users are not touched.
-- Existing nonempty application/store data is preserved, including admin edits.
with pending as (
  select p.id,
    case when jsonb_typeof(u.raw_user_meta_data->'magaza')='string'
      then nullif(left(btrim(u.raw_user_meta_data->>'magaza'),160),'') end as requested_store,
    case when jsonb_typeof(u.raw_user_meta_data->'basvuru_markalari')='array'
      then u.raw_user_meta_data->'basvuru_markalari'
      when jsonb_typeof(u.raw_user_meta_data->'marka')='string'
      then jsonb_build_array(u.raw_user_meta_data->>'marka')
      else '[]'::jsonb end as requested_json
  from public.profiller p join auth.users u on u.id=p.id
  where p.rol='bayi' and p.abonelik_durumu='pasif'
), normalized as (
  select p.id, p.requested_store,
    coalesce((select array_agg(distinct lower(btrim(e.value))::public.marka_tipi
                              order by lower(btrim(e.value))::public.marka_tipi)
              from jsonb_array_elements_text(p.requested_json) as e(value)
              where lower(btrim(e.value)) in ('bosch','siemens')),
             '{}'::public.marka_tipi[]) as requested_brands
  from pending p
)
update public.profiller p
set magaza=coalesce(nullif(btrim(p.magaza),''),n.requested_store),
    basvuru_markalari=case when cardinality(p.basvuru_markalari)=0
                          then n.requested_brands else p.basvuru_markalari end
from normalized n
where p.id=n.id
  and ((nullif(btrim(p.magaza),'') is null and n.requested_store is not null)
    or (cardinality(p.basvuru_markalari)=0 and cardinality(n.requested_brands)>0));

notify pgrst, 'reload schema';
