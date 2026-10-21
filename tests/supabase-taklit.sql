-- Supabase ortamının bu migration için gereken asgari taklidi (YALNIZ YEREL TEST)
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant usage on schema public to authenticated;
create table public.profiller (id uuid primary key, rol text, abonelik_durumu text, bayi_sahibi uuid);
create or replace function public.erisebilir() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiller where id = auth.uid() and (rol = 'admin' or abonelik_durumu in ('aktif','deneme'))); $$;
create or replace function public.fq_stok_sahibi() returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(bayi_sahibi, id) from profiller where id = auth.uid(); $$;
create table public.fq_schema_versions(version text primary key);
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
-- kullanıcılar: A admin (merkez), B admin başka işletme, P personel, S şube (A'ya bağlı bayi), X pasif admin değil
insert into public.profiller values
 ('aaaaaaaa-0000-0000-0000-000000000001','admin',null,null),
 ('bbbbbbbb-0000-0000-0000-000000000002','admin',null,null),
 ('cccccccc-0000-0000-0000-000000000003','personel','aktif',null),
 ('dddddddd-0000-0000-0000-000000000004','bayi','aktif','aaaaaaaa-0000-0000-0000-000000000001'),
 ('eeeeeeee-0000-0000-0000-000000000005','bayi','pasif',null);
