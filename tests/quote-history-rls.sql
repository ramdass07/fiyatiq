-- Run ONLY on FiyatIQ-Deneme (sbdrbneforrsqahwxadl), after the v11.9 history migration.
-- No emails/passwords, no real customer data returned; every fixture/write rolls back.
begin;
set local statement_timeout='60s';
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from auth.users where id::text like '11970000-0000-4000-8000-%')
 or exists(select 1 from public.teklifler where id::text like '11971000-0000-4000-8000-%') then
  raise exception 'Synthetic history IDs already exist; choose unused fixtures';
 end if;
 if not exists(select 1 from pg_class where oid='public.fq_teklif_gecmisi'::regclass and relrowsecurity) then
  raise exception 'History RLS is disabled'; end if;
 if has_table_privilege('anon','public.fq_teklif_gecmisi','SELECT')
 or has_table_privilege('authenticated','public.fq_teklif_gecmisi','INSERT')
 or has_table_privilege('authenticated','public.fq_teklif_gecmisi','UPDATE')
 or has_table_privilege('authenticated','public.fq_teklif_gecmisi','DELETE')
 or has_table_privilege('authenticated','public.fq_teklif_gecmisi','TRUNCATE')
 or has_sequence_privilege('authenticated','public.fq_teklif_gecmisi_id_seq','USAGE')
 or has_schema_privilege('authenticated','fq_private','USAGE')
 or has_function_privilege('authenticated','fq_private.fq_quote_history_capture()','EXECUTE')
 or has_function_privilege('anon','public.fq_teklif_gecmisi_oku(uuid,bigint,integer)','EXECUTE') then
  raise exception 'History privilege boundary failed'; end if;
 if exists(select 1 from pg_proc where oid='public.fq_teklif_gecmisi_oku(uuid,bigint,integer)'::regprocedure and prosecdef)
 or not exists(select 1 from pg_proc where oid='fq_private.fq_quote_history_capture()'::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
  raise exception 'History invoker/definer/search_path contract failed'; end if;
 if exists(select 1 from public.teklifler t where not exists(select 1 from public.fq_teklif_gecmisi h where h.teklif_id=t.id)) then
  raise exception 'Existing quote missing baseline/event'; end if;
 if exists(select 1 from public.fq_teklif_gecmisi h where islem='baslangic' and (
  actor_id is not null or islem_yapan<>'Sistem · geçmiş kaydı başlangıcı'
  or exists(select 1 from jsonb_each(degisiklikler) x where x.value->'once' is distinct from 'null'::jsonb)
 )) then raise exception 'Baseline invents earlier values/actor'; end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('11970000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated',
 'fiyatiq-history-'||i||'@example.invalid',jsonb_build_object('ad','Synthetic history account '||i,'magaza','History store '||i)
from generate_series(1,4) i;
update public.profiller set rol=case when id='11970000-0000-4000-8000-000000000003'::uuid then 'admin'::public.rol_tipi else 'bayi'::public.rol_tipi end,
 abonelik_durumu=case when id='11970000-0000-4000-8000-000000000004'::uuid then 'pasif'::public.abonelik_tipi else 'aktif'::public.abonelik_tipi end,
 marka_erisimi=array['bosch']::public.marka_tipi[] where id::text like '11970000-0000-4000-8000-%';

-- System maintenance without an auth subject still works, including malformed
-- legacy snapshots and a current quote with a brand outside the owner's grant.
insert into public.teklifler(id,bayi_id,marka,musteri_ad,musteri_tel,teklif_no,satirlar,toplam,satis_tutari,durum)
select ('11971000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'11970000-0000-4000-8000-000000000001',
 case when i=7 then 'siemens'::public.marka_tipi else 'bosch'::public.marka_tipi end,
 'Synthetic history fixture','0000000000','HISTORY-'||i,
 case i when 1 then 'null'::jsonb when 2 then '"legacy string"'::jsonb when 3 then '17'::jsonb
 when 4 then '[null,7,{"kod":"LEGACY-ITEM","adet":1,"nakit":20,"maliyet":"HISTORY-SECRET-legacy"}]'::jsonb
 when 5 then '{"net_items":{"cost":"HISTORY-SECRET-malformed"},"items":[{"model":{"secret":"HISTORY-SECRET-model"},"ad":"Known model name","adet":"invalid"}],"hesap":{"finalTaksit":{"secret":"HISTORY-SECRET-total"}}}'::jsonb
 when 6 then '{"net_items":[],"items":{},"hesap":{"finalTaksit":"9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999"}}'::jsonb
 else '{}'::jsonb end,20,20,'teklif'
from generate_series(1,7) i;
do $$ begin
 if (select count(*) from public.fq_teklif_gecmisi where teklif_id::text like '11971000-0000-4000-8000-%' and islem='olusturuldu' and actor_id is null and islem_yapan='Sistem işlemi')<>7 then
  raise exception 'System/malformed snapshot inserts did not receive seven events'; end if;
 if exists(select 1 from public.fq_teklif_gecmisi where teklif_id::text like '11971000-0000-4000-8000-%' and degisiklikler::text like '%HISTORY-SECRET-%') then
  raise exception 'Malformed/legacy snapshot leaked disallowed data'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11970000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"11970000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $test$
declare
 q uuid:='11971000-0000-4000-8000-000000000010'; r jsonb; ev jsonb; changes jsonb;
 snap jsonb:='{"no":"HISTORY-10","personel":"Fake individual attribution","magaza":"Quote display store","banka":"Testbank","taksit":6,"gecerlilik":{"valid_until":"2026-09-30"},"customer_fields":{"tc":"HISTORY-SECRET-TC","adres":"HISTORY-SECRET-address"},"workflow_inputs":{"maliyet":"HISTORY-SECRET-workflow"},"hesap":{"finalTaksit":150.4,"finalNakit":100,"tMaliyet":"HISTORY-SECRET-cost","karPct":"HISTORY-SECRET-margin","komis":"HISTORY-SECRET-commission"},"net_items":[{"model":"TEST-MODEL","ad":"Test appliance","adet":1,"net_nakit":100,"net_taksit":150,"toptan":"HISTORY-SECRET-wholesale"}]}'::jsonb;
 n integer; affected integer; version bigint; cursor_id bigint; ids text[]:='{}'; x jsonb; rejected boolean;
begin
 insert into public.teklifler(id,bayi_id,marka,musteri_ad,musteri_tel,teklif_no,satirlar,toplam,satis_tutari,durum,created_at)
 values(q,auth.uid(),'bosch','Synthetic named customer','0000000000','HISTORY-10',snap,100,100,'teklif','2020-01-01T00:00:00Z');
 r:=public.fq_teklif_gecmisi_oku(q); ev:=r->'rows'->0; changes:=ev->'degisiklikler';
 if jsonb_array_length(r->'rows')<>1 or ev->>'islem'<>'olusturuldu' or (r->>'has_more')::boolean
 or jsonb_typeof(ev->'id')<>'string' or ev->>'islem_yapan'<>'History store 1 · mağaza hesabı'
 or (ev->>'olusturuldu_at')::timestamptz<'2026-01-01'::timestamptz
 or changes#>'{toplam,once}' is distinct from 'null'::jsonb or (changes#>>'{toplam,sonra}')::numeric is distinct from 100
 or (changes#>>'{taksitli_toplam,sonra}')::numeric is distinct from 150
 or ev ? 'actor_id' or ev ? 'teklif_id'
 or changes::text like '%HISTORY-SECRET-%' then raise exception 'Created event, actor, ID, timestamp or allowlist failed'; end if;
 if changes#>'{urunler,sonra,0}' is distinct from '{"model":"TEST-MODEL","ad":"Test appliance","adet":1,"toplam_nakit":100,"toplam_taksit":150}'::jsonb then
  raise exception 'Net line allowlist failed'; end if;

 -- API clients cannot forge a baseline, rewrite an event or erase history.
 rejected:=false; begin
  insert into public.fq_teklif_gecmisi(teklif_id,islem,islem_yapan,degisiklikler) values(q,'baslangic','Forged actor','{"durum":{"sonra":"satildi"}}');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Direct history insert accepted'; end if;
 rejected:=false; begin update public.fq_teklif_gecmisi set islem_yapan='Forged actor' where teklif_id=q;
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Direct history update accepted'; end if;
 rejected:=false; begin delete from public.fq_teklif_gecmisi where teklif_id=q;
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Direct history delete accepted'; end if;

 -- One committed note edit = one normalized event. A stale same-account second
 -- editor is rejected by the pre-existing optimistic-lock predicate.
 update public.teklifler set takip_notu='  First conversation  ',takip_sorumlusu='Test seller',sonraki_arama='2026-09-20T12:00:00Z'
 where id=q and takip_surumu=0;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'First conversation update failed'; end if;
 select takip_surumu into version from public.teklifler where id=q;
 update public.teklifler set takip_notu='STALE CONVERSATION' where id=q and takip_surumu=0;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Stale optimistic update accepted'; end if;
 r:=public.fq_teklif_gecmisi_oku(q); changes:=r->'rows'->0->'degisiklikler';
 if jsonb_array_length(r->'rows')<>2 or version<>1
 or changes#>>'{takip_notu,once}'<>'' or changes#>>'{takip_notu,sonra}'<>'First conversation' then
  raise exception 'Conversation edit history or optimistic version failed'; end if;
 update public.teklifler set takip_notu='Second conversation' where id=q and takip_surumu=version;
 r:=public.fq_teklif_gecmisi_oku(q); changes:=r->'rows'->0->'degisiklikler';
 if changes#>>'{takip_notu,once}'<>'First conversation' or changes#>>'{takip_notu,sonra}'<>'Second conversation'
 or jsonb_array_length(r->'rows')<>3 then raise exception 'Previous conversation not retained'; end if;

 -- No-op, forged audit stamps and disallowed snapshot-only changes do not append.
 update public.teklifler set takip_notu='Second conversation',toplam=toplam,
 takip_surumu=999,takip_guncelleyen='11970000-0000-4000-8000-000000000002',takip_guncellendi_at='2000-01-01' where id=q;
 update public.teklifler set satirlar=jsonb_set(satirlar,'{workflow_inputs}','{"ignored":"HISTORY-SECRET-new"}') where id=q;
 if (select count(*) from public.fq_teklif_gecmisi where teklif_id=q)<>3 then raise exception 'No-op/audit/disallowed snapshot produced event'; end if;

 -- Quote prices record saved net prices; history never recalculates from catalog.
 update public.teklifler set toplam=90,satis_tutari=90,
 satirlar=jsonb_set(jsonb_set(jsonb_set(satirlar,'{hesap,finalTaksit}','130.49'),'{net_items,0,net_nakit}','90'),'{net_items,0,net_taksit}','130') where id=q;
 r:=public.fq_teklif_gecmisi_oku(q); changes:=r->'rows'->0->'degisiklikler';
 if (changes#>>'{toplam,once}')::numeric is distinct from 100 or (changes#>>'{toplam,sonra}')::numeric is distinct from 90
 or (changes#>>'{taksitli_toplam,once}')::numeric is distinct from 150 or (changes#>>'{taksitli_toplam,sonra}')::numeric is distinct from 130
 or (changes#>>'{urunler,sonra,0,toplam_nakit}')::numeric is distinct from 90 then raise exception 'Saved quote price change missing'; end if;

 update public.teklifler set durum='satildi',gercek_satis_tutari=0,satis_odeme_sekli='kart',satis_banka='Testbank',satis_taksit_sayisi=6,satis_tarihi='2026-09-10' where id=q;
 r:=public.fq_teklif_gecmisi_oku(q); changes:=r->'rows'->0->'degisiklikler';
 if changes#>>'{durum,once}'<>'teklif' or changes#>>'{durum,sonra}'<>'satildi'
 or (changes#>>'{gercek_satis_tutari,sonra}')::numeric is distinct from 0 or changes#>>'{satis_odeme_sekli,sonra}'<>'kart'
 or changes#>'{sonraki_arama,sonra}' is distinct from 'null'::jsonb then raise exception 'Zero actual sale/status/callback history missing'; end if;
 update public.teklifler set gercek_satis_tutari=125.50 where id=q;
 r:=public.fq_teklif_gecmisi_oku(q); changes:=r->'rows'->0->'degisiklikler';
 if (changes#>>'{gercek_satis_tutari,once}')::numeric<>0 or (changes#>>'{gercek_satis_tutari,sonra}')::numeric<>125.50
 or changes ? 'toplam' then raise exception 'Actual amount confused with quote price'; end if;
 update public.teklifler set durum='teklif' where id=q;
 r:=public.fq_teklif_gecmisi_oku(q); changes:=r->'rows'->0->'degisiklikler';
 if changes#>'{gercek_satis_tutari,sonra}' is distinct from 'null'::jsonb
 or (changes#>>'{gercek_satis_tutari,once}')::numeric<>125.50 then raise exception 'Reopening did not retain removed actual amount'; end if;

 select count(*) into n from public.fq_teklif_gecmisi where teklif_id=q;
 rejected:=false; begin update public.teklifler set durum='kaybedildi',kayip_nedeni='' where id=q;
 exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'Invalid loss unexpectedly accepted'; end if;
 rejected:=false; begin update public.teklifler set durum='satildi',gercek_satis_tutari=-1,satis_odeme_sekli='nakit',satis_tarihi='2026-09-10' where id=q;
 exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'Negative actual sale unexpectedly accepted'; end if;
 begin
  update public.teklifler set takip_notu='ROLLED BACK CONVERSATION' where id=q;
  raise exception 'Synthetic later transaction failure';
 exception when raise_exception then null; end;
 if (select count(*) from public.fq_teklif_gecmisi where teklif_id=q)<>n
 or (select takip_notu from public.teklifler where id=q)<>'Second conversation' then raise exception 'Failed write or rolled-back transaction left an event'; end if;

 -- More than one page; cursor stays stable when a new event arrives between pages.
 for i in 1..105 loop update public.teklifler set takip_notu='Paged conversation '||i where id=q; end loop;
 r:=public.fq_teklif_gecmisi_oku(q,p_page_size=>9999);
 if jsonb_array_length(r->'rows')<>100 or not (r->>'has_more')::boolean then raise exception 'Maximum history page size failed'; end if;
 for x in select value from jsonb_array_elements(r->'rows') loop ids:=array_append(ids,x->>'id'); end loop;
 cursor_id:=(r->'rows'->99->>'id')::bigint;
 update public.teklifler set takip_notu='New event between pages' where id=q;
 r:=public.fq_teklif_gecmisi_oku(q,p_before_id=>cursor_id,p_page_size=>100);
 if (r->>'has_more')::boolean then raise exception 'Last history page has_more wrong'; end if;
 for x in select value from jsonb_array_elements(r->'rows') loop
  if (x->>'id')=any(ids) or (x->>'id')::bigint>=cursor_id then raise exception 'History cursor duplicated/skipped ordering'; end if;
  ids:=array_append(ids,x->>'id');
 end loop;
 if cardinality(ids)<>n+105 then raise exception 'Cursor pagination lost pre-existing history events'; end if;
 r:=public.fq_teklif_gecmisi_oku(q,p_page_size=>0);
 if jsonb_array_length(r->'rows')<>1 then raise exception 'Minimum history page size failed'; end if;
 if public.fq_teklif_gecmisi_oku('11971000-0000-4000-8000-000000000007')<>'{"rows":[],"has_more":false}'::jsonb
 or public.fq_teklif_gecmisi_oku('ffffffff-ffff-4fff-8fff-ffffffffffff')<>'{"rows":[],"has_more":false}'::jsonb then raise exception 'Forbidden brand/unknown quote differs'; end if;
end;
$test$;

-- Another active store with the same brand cannot see/write another store's history.
select set_config('request.jwt.claim.sub','11970000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"11970000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare affected integer; begin
 if exists(select 1 from public.fq_teklif_gecmisi where teklif_id='11971000-0000-4000-8000-000000000010')
 or public.fq_teklif_gecmisi_oku('11971000-0000-4000-8000-000000000010')<>'{"rows":[],"has_more":false}'::jsonb then raise exception 'Cross-store history disclosure'; end if;
 update public.teklifler set takip_notu='OTHER STORE MUST NOT APPLY' where id='11971000-0000-4000-8000-000000000010';
 get diagnostics affected=row_count; if affected<>0 then raise exception 'Cross-store quote update'; end if;
end $$;

-- Admin can inspect store history, but still cannot forge/erase history rows.
select set_config('request.jwt.claim.sub','11970000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"11970000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare r jsonb; begin
 r:=public.fq_teklif_gecmisi_oku('11971000-0000-4000-8000-000000000010');
 if jsonb_array_length(r->'rows')<>30 or not (r->>'has_more')::boolean then raise exception 'Admin quote history scope'; end if;
 update public.teklifler set takip_notu='Admin reviewed' where id='11971000-0000-4000-8000-000000000010';
 r:=public.fq_teklif_gecmisi_oku('11971000-0000-4000-8000-000000000010');
 if r#>>'{rows,0,islem_yapan}'<>'History store 3 · yönetim hesabı' then raise exception 'Admin account attribution failed'; end if;
 update public.profiller set abonelik_durumu='pasif' where id='11970000-0000-4000-8000-000000000001';
end $$;

-- Historical read rights follow CURRENT quote RLS after account deactivation.
select set_config('request.jwt.claim.sub','11970000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"11970000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.fq_teklif_gecmisi where teklif_id='11971000-0000-4000-8000-000000000010')
 or public.fq_teklif_gecmisi_oku('11971000-0000-4000-8000-000000000010')<>'{"rows":[],"has_more":false}'::jsonb then raise exception 'Inactive owner retained history'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare rejected boolean:=false; begin
 begin perform public.fq_teklif_gecmisi_oku('11971000-0000-4000-8000-000000000010');
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Anonymous history RPC allowed'; end if;
end $$;
reset role;
do $$ declare rejected boolean:=false; begin
 begin delete from public.teklifler where id='11971000-0000-4000-8000-000000000010';
 exception when foreign_key_violation then rejected:=true; end;
 if not rejected then raise exception 'Quote deletion erased/orphaned retained history'; end if;
end $$;
rollback;
select 'tests passed: history baseline, safe projection, system writes, RLS, immutable API, account attribution, saved/actual price changes, note retention, optimistic conflict, no-op/failed-write atomicity and cursor pagination; every test row rolled back' as result;
