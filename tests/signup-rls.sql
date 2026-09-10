-- Run AFTER the v11.7 signup migration in DENEME only (sbdrbneforrsqahwxadl).
-- Synthetic auth rows have no password and no email is sent. Everything rolls back.
-- Any failed assertion aborts the transaction; never change ROLLBACK to COMMIT.
begin;
set local statement_timeout = '30s';
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);

create temporary table fq_signup_existing on commit drop as
  select * from public.profiller;

do $test$
begin
  if exists (select 1 from auth.users where id::text like '11700000-0000-4000-8000-%') then
    raise exception 'Synthetic signup IDs already exist; choose unused fixture IDs';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='auth.users'::regclass
    and tgname='on_auth_user_created'
    and tgfoid='public.handle_new_user()'::regprocedure
    and tgenabled in ('O','A')) then
    raise exception 'Signup trigger is missing or disabled';
  end if;
end
$test$;

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
 ('11700000-0000-4000-8000-000000000001','authenticated','authenticated',
  'fiyatiq-signup-admin@example.invalid','{"ad":"Test Admin","magaza":"Test Central"}'),
 ('11700000-0000-4000-8000-000000000002','authenticated','authenticated',
  'fiyatiq-signup-applicant@example.invalid',
  '{"ad":"  Test Applicant  ","magaza":"  Test Store  ","basvuru_markalari":["bosch","siemens","bosch","UNKNOWN",null,1,{}],"rol":"admin","abonelik_durumu":"aktif","marka_erisimi":["bosch","siemens"],"bayi_sahibi":"11700000-0000-4000-8000-000000000001"}'),
 ('11700000-0000-4000-8000-000000000003','authenticated','authenticated',
  'fiyatiq-signup-legacy@example.invalid',
  '{"ad":"Legacy Applicant","magaza":"Legacy Store","marka":" Bosch "}'),
 ('11700000-0000-4000-8000-000000000004','authenticated','authenticated',
  'fiyatiq-signup-malformed@example.invalid',
  '{"ad":{},"magaza":[],"basvuru_markalari":"admin","marka":{"name":"bosch"}}'),
 ('11700000-0000-4000-8000-000000000005','authenticated','authenticated',
  'fiyatiq-signup-empty@example.invalid','{}');

do $test$
declare p public.profiller%rowtype;
begin
  select * into strict p from public.profiller
    where id='11700000-0000-4000-8000-000000000002';
  if p.ad <> 'Test Applicant' or p.magaza <> 'Test Store'
    or p.basvuru_markalari <> array['bosch','siemens']::public.marka_tipi[] then
    raise exception 'Applicant fields or normalized multi-brand request were lost';
  end if;
  if exists(select 1 from public.profiller
     where id::text like '11700000-0000-4000-8000-%'
       and (rol<>'bayi' or abonelik_durumu<>'pasif'
         or cardinality(marka_erisimi)<>0 or bayi_sahibi is not null)) then
    raise exception 'Signup metadata elevated a profile';
  end if;
  select * into strict p from public.profiller
    where id='11700000-0000-4000-8000-000000000003';
  if p.magaza <> 'Legacy Store'
    or p.basvuru_markalari <> array['bosch']::public.marka_tipi[] then
    raise exception 'Legacy single-brand metadata is incompatible';
  end if;
  select * into strict p from public.profiller
    where id='11700000-0000-4000-8000-000000000004';
  if p.ad <> 'fiyatiq-signup-malformed@example.invalid' or p.magaza is not null
    or cardinality(p.basvuru_markalari)<>0 then
    raise exception 'Malformed metadata was not handled safely';
  end if;
  select * into strict p from public.profiller
    where id='11700000-0000-4000-8000-000000000005';
  if p.ad <> 'fiyatiq-signup-empty@example.invalid'
    or cardinality(p.basvuru_markalari)<>0 then
    raise exception 'Empty metadata failed signup';
  end if;
end
$test$;

-- Only the synthetic administrator is elevated by the database owner for this test.
update public.profiller set rol='admin',abonelik_durumu='aktif'
  where id='11700000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','11700000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',
  '{"sub":"11700000-0000-4000-8000-000000000002","role":"authenticated"}',true);

do $test$
declare affected integer;
begin
  if public.fq_marka_izin('bosch') or public.fq_marka_izin('siemens') then
    raise exception 'Pending applicant can access prices from requested brands';
  end if;
  if (select count(*) from public.profiller) <> 1 then
    raise exception 'Applicant can see another profile or cannot see own request';
  end if;
  begin
    update public.profiller set rol='admin',abonelik_durumu='aktif',
      marka_erisimi=array['bosch','siemens']::public.marka_tipi[],
      bayi_sahibi='11700000-0000-4000-8000-000000000001'
      where id='11700000-0000-4000-8000-000000000002';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Applicant self-approved'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiller set basvuru_markalari=array['siemens']::public.marka_tipi[]
      where id='11700000-0000-4000-8000-000000000002';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Applicant bypassed admin-only profile writes'; end if;
  exception when insufficient_privilege then null;
  end;
end
$test$;

-- An authenticated administrator approves brand + stock pool + identity + status
-- in one SQL statement, matching the frontend's single UPDATE request.
select set_config('request.jwt.claim.sub','11700000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',
  '{"sub":"11700000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $test$
declare affected integer;
begin
  update public.profiller set ad='Approved Applicant',magaza='Approved Store',
    marka_erisimi=array['bosch']::public.marka_tipi[],
    bayi_sahibi='11700000-0000-4000-8000-000000000001',abonelik_durumu='aktif'
    where id='11700000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Admin atomic approval was denied'; end if;
end
$test$;

select set_config('request.jwt.claim.sub','11700000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',
  '{"sub":"11700000-0000-4000-8000-000000000002","role":"authenticated"}',true);

do $test$
declare p public.profiller%rowtype; affected integer;
begin
  select * into strict p from public.profiller
    where id='11700000-0000-4000-8000-000000000002';
  if p.ad <> 'Approved Applicant' or p.magaza <> 'Approved Store'
    or p.bayi_sahibi <> '11700000-0000-4000-8000-000000000001'::uuid
    or p.abonelik_durumu <> 'aktif' or p.rol <> 'bayi'
    or p.marka_erisimi <> array['bosch']::public.marka_tipi[]
    or p.basvuru_markalari <> array['bosch','siemens']::public.marka_tipi[] then
    raise exception 'Approval did not preserve the request or selected scope';
  end if;
  if not public.fq_marka_izin('bosch') or public.fq_marka_izin('siemens') then
    raise exception 'Granted access does not match administrator-selected brand';
  end if;
  update public.profiller set abonelik_durumu='aktif'
    where id='11700000-0000-4000-8000-000000000003';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Ordinary bayi approved another applicant'; end if;
end
$test$;

-- Simulate user-editable Auth metadata changing after approval. The INSERT-only
-- trigger must never translate this into profile authorization changes.
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
update auth.users set raw_user_meta_data=
  '{"rol":"admin","abonelik_durumu":"aktif","marka_erisimi":["siemens"],"basvuru_markalari":["siemens"]}'::jsonb
  where id='11700000-0000-4000-8000-000000000002';

do $test$
begin
  if not exists(select 1 from public.profiller
    where id='11700000-0000-4000-8000-000000000002' and rol='bayi'
      and marka_erisimi=array['bosch']::public.marka_tipi[]
      and basvuru_markalari=array['bosch','siemens']::public.marka_tipi[]) then
    raise exception 'Auth metadata update changed profile grants or application record';
  end if;
  if exists(select 1 from fq_signup_existing e left join public.profiller p on p.id=e.id
    where to_jsonb(p) is distinct from to_jsonb(e)) then
    raise exception 'Existing profiles were changed during synthetic signup tests';
  end if;
  if (select count(*) from public.profiller)
      <> (select count(*)+5 from fq_signup_existing) then
    raise exception 'Unexpected profile side effect';
  end if;
  if has_function_privilege('anon','public.handle_new_user()','EXECUTE')
    or has_function_privilege('authenticated','public.handle_new_user()','EXECUTE') then
    raise exception 'Trigger function exposed as a public RPC';
  end if;
end
$test$;

select 'SIGNUP_TRIGGER_AND_RLS_OK' as result,
  'metadata mapping; empty initial grants; pending isolation; self-approval denied; atomic admin approval; granted-brand isolation; legacy/malformed compatibility; existing profiles preserved' as checked;
rollback;
