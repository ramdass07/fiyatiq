-- Run ONLY on FiyatIQ-Deneme (sbdrbneforrsqahwxadl) after the v11.9 RPC.
-- Passwordless synthetic fixtures, no real email, and NO COMMIT.
-- Every fixture and impersonated mutation is rolled back in this transaction.
begin;
set local statement_timeout='60s';
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from auth.users where id::text like '11900000-0000-4000-8000-%')
  or exists(select 1 from public.teklifler where id::text like '11910000-0000-4000-8000-%') then
  raise exception 'Synthetic v11.9 IDs already exist; choose unused fixtures';
 end if;
 if exists(select 1 from pg_proc where oid='public.fq_satis_raporu(text,date,date,text,integer,integer)'::regprocedure and prosecdef) then
  raise exception 'Sales report must be SECURITY INVOKER';
 end if;
 if has_function_privilege('anon','public.fq_satis_raporu(text,date,date,text,integer,integer)','EXECUTE') then
  raise exception 'Anonymous report execute was granted';
 end if;
 if not has_function_privilege('authenticated','public.fq_satis_raporu(text,date,date,text,integer,integer)','EXECUTE') then
  raise exception 'Authenticated report execute is missing';
 end if;
end $$;
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('11900000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated',
 'fiyatiq-v119-'||i||'@example.invalid',jsonb_build_object('ad','Synthetic v119 '||i,'magaza','FQ119 Store '||i)
from generate_series(1,6) i;
update public.profiller set rol=case when id::text='11900000-0000-4000-8000-000000000001' then 'admin'::public.rol_tipi
 when right(id::text,1) in ('4','5','6') then 'personel'::public.rol_tipi else 'bayi'::public.rol_tipi end,
 abonelik_durumu=case right(id::text,1) when '5' then 'pasif'::public.abonelik_tipi
 when '6' then 'deneme'::public.abonelik_tipi else 'aktif'::public.abonelik_tipi end,
 marka_erisimi=array['bosch']::public.marka_tipi[] where id::text like '11900000-0000-4000-8000-%';

-- August offers sold in September: all 1,205 belong to the September sales report.
insert into public.teklifler(id,bayi_id,marka,musteri_ad,musteri_tel,teklif_no,satirlar,toplam,satis_tutari,durum,created_at,
 gercek_satis_tutari,satis_odeme_sekli,satis_tarihi)
select ('11910000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '11900000-0000-4000-8000-000000000002','bosch','Synthetic customer '||i,'0000000000','FQ119-COHORT-'||i,
 jsonb_build_object('no','FQ119-COHORT-'||i,'magaza','FQ119 Main','personel','Synthetic seller','items',jsonb_build_array(jsonb_build_object('model','SYNTHETIC-'||i,'adet',1,'nakit',77))),
 77,77,'satildi','2026-08-15 12:00:00+00'::timestamptz+make_interval(secs=>i),
 case i when 1 then 0 when 2 then 0.01 else 100 end,'nakit','2026-09-10'::date
from generate_series(1,1205) i;

-- Exact inclusive sale calendar dates; creation timestamps are deliberately
-- in another month and cannot be substituted for the agreed sale date.
-- Legacy array snapshots also test the column number/model fallback.
insert into public.teklifler(id,bayi_id,marka,musteri_ad,musteri_tel,teklif_no,satirlar,toplam,satis_tutari,durum,created_at,
 gercek_satis_tutari,satis_odeme_sekli,satis_tarihi)
select ('11910000-0000-4000-8000-'||lpad((2000+i)::text,12,'0'))::uuid,
 '11900000-0000-4000-8000-000000000003','bosch','Literal %_ search','0000000000','FQ119-BOUNDARY-'||i,
 '[{"kod":"LEGACY-CODE","adet":1,"nakit":77}]'::jsonb,77,77,
 case when i=8 then 'teklif' else 'satildi' end,
 case when i in (1,4) then '2026-09-15 20:59:59.999999+00'::timestamptz else '2026-08-15 21:00:00+00'::timestamptz end,
 case when i in (5,8) then null else 12 end,case when i in (5,8) then null else 'havale' end,
 case i when 1 then '2026-08-31'::date when 2 then '2026-09-01'::date when 3 then '2026-09-30'::date
  when 4 then '2026-10-01'::date when 6 then 'infinity'::date when 7 then '-infinity'::date else null end
from generate_series(1,8) i;
insert into public.teklifler(id,bayi_id,marka,musteri_ad,teklif_no,satirlar,toplam,satis_tutari,durum)
values ('11910000-0000-4000-8000-000000003001','11900000-0000-4000-8000-000000000002','bosch','Synthetic prospect','FQ119-PROSPECT',
 '{"magaza":"FQ119 Prospect only"}',77,77,'teklif');

set local role authenticated;
select set_config('request.jwt.claim.sub','11900000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"11900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $test$
declare r jsonb; s jsonb; n integer:=0; ids text[]:='{}'; pg integer; rev text; x jsonb; rejected boolean;
begin
 if current_user<>'authenticated' or auth.uid()<>'11900000-0000-4000-8000-000000000001'::uuid then raise exception 'Admin impersonation failed';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30',p_page_size=>500);
 s:=r->'summary'; rev:=r->>'report_revision';
 if (r->>'total_count')::int<>1205 or jsonb_array_length(r->'rows')<>500
  or (s->>'sale_count')::int<>1205 or (s->>'actual_sale_total')::numeric<>120300.01
  or abs((s->>'average_actual_sale')::numeric-120300.01/1205)>0.0000001
  or (r->>'undated_sales_count')::int<>0 or s ? 'conversion_rate' then
  raise exception 'Complete sales-date report aggregates / cents / no conversion failed: %',s;
 end if;
 if r->'rows'->0->>'no'<>'FQ119-COHORT-1205' then raise exception 'Stable creation-date/id tie breaker failed';end if;
 if not(r->'stores' @> '["FQ119 Main","FQ119 Store 3"]'::jsonb)
  or r->'stores' @> '["FQ119 Prospect only"]'::jsonb then raise exception 'Store options must include all visible sold stores only';end if;
 for pg in 0..2 loop
  r:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30',p_page=>pg,p_page_size=>500);
  if r->>'report_revision'<>rev or r->'summary'<>s then raise exception 'Cohort summary/revision varies across pages';end if;
  for x in select value from jsonb_array_elements(r->'rows') loop
   if (x->>'id')=any(ids) then raise exception 'Duplicate paginated export row';end if;
   ids:=array_append(ids,x->>'id');n:=n+1;
   if x ? 'satirlar' or x ? 'takip_notu' or x ? 'bayi_id' then raise exception 'Non-allowlisted sales report detail';end if;
  end loop;
 end loop;
 if n<>1205 then raise exception 'Complete export lost rows beyond the old 1,000 cap';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_baslangic=>'2026-08-01',p_bitis=>'2026-08-31');
 if (r->>'total_count')::int<>0 or (r->'summary'->>'actual_sale_total')::numeric<>0 then
  raise exception 'August creation dates incorrectly override September sale dates';end if;
 r:=public.fq_satis_raporu(p_ara=>'fq119-boundary-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30');
 if (r->>'total_count')::int<>2 or (r->'summary'->>'actual_sale_total')::numeric<>24
  or (r->>'undated_sales_count')::int<>3
  or r->'rows'->0->>'no'<>'FQ119-BOUNDARY-3' or r->'rows'->1->>'no'<>'FQ119-BOUNDARY-2'
  or r->'rows'->0->>'urunler'<>'LEGACY-CODE' then
  raise exception 'Inclusive September dates / sale-date order / legacy / unknown bucket failed';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-BOUNDARY-',p_baslangic=>'2026-10-01',p_bitis=>'2026-10-31');
 if (r->>'total_count')::int<>1 or r->'rows'->0->>'no'<>'FQ119-BOUNDARY-4'
  or (r->>'undated_sales_count')::int<>3 then raise exception 'September offer sold in October misallocated';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-BOUNDARY-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-01');
 if (r->>'total_count')::int<>1 or r->'rows'->0->>'no'<>'FQ119-BOUNDARY-2' then raise exception 'Single inclusive business date failed';end if;
 r:=public.fq_satis_raporu(p_ara=>'Literal %_ search');
 if (r->>'total_count')::int<>4 or (r->>'undated_sales_count')::int<>3
  or (r->'summary'->>'actual_sale_total')::numeric<>48 then raise exception 'Literal search / undated excluded from sums failed';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-BOUNDARY-',p_magaza=>'FQ119 Main');
 if (r->>'total_count')::int<>0 or (r->>'undated_sales_count')::int<>0
  or (r->'summary'->>'average_actual_sale')::numeric<>0 then raise exception 'Store filter must also restrict the undated bucket';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-BOUNDARY-5');
 if (r->>'total_count')::int<>0 or (r->>'undated_sales_count')::int<>1
  or (r->'summary'->>'sale_count')::int<>0 or (r->'summary'->>'actual_sale_total')::numeric<>0 then
  raise exception 'Missing actuals were inferred or assigned to a month';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_page_size=>9999,p_page=>-20);
 if jsonb_array_length(r->'rows')<>500 then raise exception 'Page upper/negative bounds failed';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_page_size=>0);
 if jsonb_array_length(r->'rows')<>1 then raise exception 'Page minimum failed';end if;
 r:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_page=>2147483647,p_page_size=>500);
 if jsonb_array_length(r->'rows')<>0 or (r->>'total_count')::int<>1205 then raise exception 'Large page overflow / total count failed';end if;
 rejected:=false;
 begin perform public.fq_satis_raporu(p_baslangic=>'2026-10-01',p_bitis=>'2026-09-01');exception when invalid_parameter_value then rejected:=true;end;
 if not rejected then raise exception 'Reversed date range accepted';end if;
 rejected:=false;
 begin perform public.fq_satis_raporu(p_baslangic=>'-infinity');exception when invalid_parameter_value then rejected:=true;end;
 if not rejected then raise exception 'Nonfinite start date accepted';end if;
 rejected:=false;
 begin perform public.fq_satis_raporu(p_bitis=>'infinity');exception when invalid_parameter_value then rejected:=true;end;
 if not rejected then raise exception 'Nonfinite end date accepted';end if;
end $test$;

-- Existing management semantics: active and trial personnel see editor rows;
-- inactive personnel and ordinary store users cannot invoke management reports.
do $$ declare uid text; r jsonb; rejected boolean; begin
 foreach uid in array array['11900000-0000-4000-8000-000000000004','11900000-0000-4000-8000-000000000006'] loop
  perform set_config('request.jwt.claim.sub',uid,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  r:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-');
  if (r->>'total_count')::int<>1205 then raise exception 'Active/trial editor denied cross-store permitted report';end if;
 end loop;
 foreach uid in array array['11900000-0000-4000-8000-000000000002','11900000-0000-4000-8000-000000000005','11900000-0000-4000-8000-000000000007'] loop
  perform set_config('request.jwt.claim.sub',uid,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','user_metadata',jsonb_build_object('rol','admin','abonelik_durumu','aktif'))::text,true);
  rejected:=false;
  begin perform public.fq_satis_raporu();exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Ordinary/passive/missing profile entered management using counterfeit JWT metadata';end if;
 end loop;
end $$;

-- Revision catches changed amounts, labels, month movement, and the separate
-- period-independent undated count even when the dated row count stays fixed.
select set_config('request.jwt.claim.sub','11900000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"11900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare before_rev text; after_rev text; r jsonb; begin
 before_rev:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30')->>'report_revision';
 update public.teklifler set gercek_satis_tutari=0.02 where id='11910000-0000-4000-8000-000000000002';
 after_rev:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30')->>'report_revision';
 if before_rev=after_rev then raise exception 'Revision misses cents amount edit';end if;
 before_rev:=after_rev;
 update public.teklifler set musteri_ad='Changed synthetic label' where id='11910000-0000-4000-8000-000000000002';
 after_rev:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30')->>'report_revision';
 if before_rev=after_rev then raise exception 'Revision misses display-only edit';end if;
 before_rev:=after_rev;
 update public.teklifler set satis_tarihi='2026-10-01' where id='11910000-0000-4000-8000-000000000002';
 r:=public.fq_satis_raporu(p_ara=>'FQ119-COHORT-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30');
 if before_rev=r->>'report_revision' or (r->>'total_count')::int<>1204 then raise exception 'Revision/cohort misses changed sale month';end if;
 before_rev:=public.fq_satis_raporu(p_ara=>'FQ119-BOUNDARY-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30')->>'report_revision';
 update public.teklifler set durum='teklif' where id='11910000-0000-4000-8000-000000002005';
 r:=public.fq_satis_raporu(p_ara=>'FQ119-BOUNDARY-',p_baslangic=>'2026-09-01',p_bitis=>'2026-09-30');
 if before_rev=r->>'report_revision' or (r->>'undated_sales_count')::int<>2 or (r->>'total_count')::int<>2 then
  raise exception 'Revision misses undated count change with identical dated rows';end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare rejected boolean:=false; begin
 if auth.uid() is not null or current_user<>'anon' then raise exception 'Anonymous impersonation failed';end if;
 begin perform public.fq_satis_raporu();exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous report permitted';end if;
end $$;
reset role;
rollback;
select 'SALES_DATE_REPORT_RLS_OK' as result,
 '1205 sales complete paging/export; August offer September sale; October exclusion; inclusive sale dates; zero/cents sums; NULL/infinite dates separate; literal search/store; active/trial editors; ordinary/passive/missing/anon denial; changed export revision; all fixtures rolled back' as checked;
