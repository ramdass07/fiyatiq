-- Run ONLY after v11.8 migration on FiyatIQ-Deneme (sbdrbneforrsqahwxadl).
-- Synthetic auth fixtures have no password; no email is sent. NEVER COMMIT.
-- All fixture creation, impersonation and quote mutations roll back atomically.
begin;
set local statement_timeout='60s';
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if exists(select 1 from auth.users where id::text like '11800000-0000-4000-8000-%')
 or exists(select 1 from public.teklifler where id::text like '11810000-0000-4000-8000-%') then
  raise exception 'Synthetic v11.8 IDs already exist; choose unused fixtures';
 end if;
 if exists(select 1 from pg_proc where oid='public.fq_teklif_raporu(text,date,date,text,text,integer,integer)'::regprocedure and prosecdef) then
  raise exception 'Report must be SECURITY INVOKER';
 end if;
 if has_function_privilege('anon','public.fq_teklif_raporu(text,date,date,text,text,integer,integer)','EXECUTE') then
  raise exception 'Anonymous report execute was granted';
 end if;
end $$;
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('11800000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated',
 'fiyatiq-v118-'||i||'@example.invalid',jsonb_build_object('ad','Synthetic v118 '||i,'magaza','FQ118 Store '||i)
from generate_series(1,5) i;
update public.profiller set rol=case id::text when '11800000-0000-4000-8000-000000000001' then 'admin'::public.rol_tipi
 when '11800000-0000-4000-8000-000000000004' then 'personel'::public.rol_tipi
 when '11800000-0000-4000-8000-000000000005' then 'personel'::public.rol_tipi else 'bayi'::public.rol_tipi end,
 abonelik_durumu=case when id::text='11800000-0000-4000-8000-000000000005' then 'pasif'::public.abonelik_tipi else 'aktif'::public.abonelik_tipi end,
 marka_erisimi=array['bosch']::public.marka_tipi[] where id::text like '11800000-0000-4000-8000-%';

-- More than the previous 1,000-row browser limit; 300 sold / 1,205 offers.
insert into public.teklifler(id,bayi_id,marka,musteri_ad,musteri_tel,teklif_no,satirlar,toplam,satis_tutari,durum,kayip_nedeni,created_at,
 gercek_satis_tutari,satis_odeme_sekli,satis_tarihi)
select ('11810000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '11800000-0000-4000-8000-000000000002','bosch','Synthetic customer '||i,'0000000000','FQ118-COHORT-'||i,
 jsonb_build_object('no','FQ118-COHORT-'||i,'magaza','FQ118 Main','personel','Synthetic seller','items',jsonb_build_array(jsonb_build_object('model','SYNTHETIC-'||i,'adet',1,'nakit',100)),
 'snapshot_version',1,'hesap',jsonb_build_object('finalNakit',100,'finalTaksit',150)),100,100,
 case when i<=300 then 'satildi' when i<=400 then 'kaybedildi' else 'teklif' end,
 case when i>300 and i<=400 then 'Synthetic loss' else '' end,
 '2026-09-10 12:00:00+00'::timestamptz+make_interval(secs=>i),
 case when i=1 then 0 when i<=200 then 150 else null end,
 case when i<=200 then 'kart' else null end,case when i<=200 then '2026-09-10'::date else null end
from generate_series(1,1205) i;

-- Boundary fixture: Istanbul's 10 September starts at 9 September 21:00 UTC.
-- Legacy array snapshots exercise column quote numbers and model/kod fallback.
insert into public.teklifler(id,bayi_id,marka,musteri_ad,musteri_tel,teklif_no,satirlar,toplam,satis_tutari,durum,created_at)
select ('11810000-0000-4000-8000-'||lpad((2000+i)::text,12,'0'))::uuid,
 '11800000-0000-4000-8000-000000000003','bosch','Literal %_ search','0000000000','FQ118-BOUNDARY-'||i,
 '[{"kod":"LEGACY-CODE","adet":1,"nakit":12}]'::jsonb,12,12,
 case when i=2 then null when i=3 then '' else 'teklif' end,
 case i when 1 then '2026-09-09 20:59:59.999999+00'::timestamptz
 when 2 then '2026-09-09 21:00:00+00'::timestamptz
 when 3 then '2026-09-10 20:59:59.999999+00'::timestamptz
 else '2026-09-10 21:00:00+00'::timestamptz end
from generate_series(1,4) i;

set local role authenticated;
select set_config('request.jwt.claim.sub','11800000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"11800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $test$
declare r jsonb; s jsonb; n integer:=0; ids text[]:='{}'; pg integer; rev text; x jsonb;
begin
 if current_user<>'authenticated' or auth.uid()<>'11800000-0000-4000-8000-000000000001'::uuid then raise exception 'Admin impersonation failed';end if;
 r:=public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-',p_page_size=>500); s:=r->'summary'; rev:=r->>'report_revision';
 if (r->>'total_count')::int<>1205 or jsonb_array_length(r->'rows')<>500
  or (s->>'quote_count')::int<>1205 or (s->>'cash_total')::numeric<>120500
  or (s->>'average_cash')::numeric<>100 or (s->>'sold_count')::int<>300
  or (s->>'sold_cash_total')::numeric<>30000 or (s->>'actual_sale_count')::int<>200
  or (s->>'actual_sale_total')::numeric<>29850 or (s->>'missing_actual_count')::int<>100
  or abs((s->>'conversion_rate')::numeric-(30000.0/1205))>0.00001 then raise exception 'Report >1000 totals/actual sales failed: %',s;end if;
 if not (r->'stores' @> '["FQ118 Main","FQ118 Store 3"]'::jsonb) then raise exception 'Store options were restricted by report search/page';end if;
 for pg in 0..2 loop
  r:=public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-',p_page=>pg,p_page_size=>500);
  if r->>'report_revision'<>rev then raise exception 'Stable cohort revision changes between pages';end if;
  for x in select value from jsonb_array_elements(r->'rows') loop
   if (x->>'id')=any(ids) then raise exception 'Duplicate paginated export row';end if;
   ids:=array_append(ids,x->>'id'); n:=n+1;
   if x ? 'satirlar' or x ? 'takip_notu' or x ? 'bayi_id' then raise exception 'Report exposed non-allowlisted details';end if;
  end loop;
 end loop;
 if n<>1205 then raise exception 'Paginated export lost rows';end if;
 r:=public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-',p_durum=>'satildi');
 if (r->>'total_count')::int<>300 or (r->'summary')<>s or r->>'report_revision'<>rev then raise exception 'Status filter corrupts conversion denominator or revision';end if;
 r:=public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-',p_page_size=>9999,p_page=>-20);
 if jsonb_array_length(r->'rows')<>500 then raise exception 'Page bounds failed';end if;
 r:=public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-',p_page_size=>0);
 if jsonb_array_length(r->'rows')<>1 then raise exception 'Minimum page size failed';end if;
 r:=public.fq_teklif_raporu(p_ara=>'fq118-boundary-',p_baslangic=>'2026-09-10',p_bitis=>'2026-09-10',p_durum=>'teklif');
 if (r->>'total_count')::int<>2 or (r->'rows'->0->>'no')<>'FQ118-BOUNDARY-3'
  or (r->'rows'->1->>'no')<>'FQ118-BOUNDARY-2' or r->'rows'->0->>'urunler'<>'LEGACY-CODE' then
  raise exception 'Istanbul inclusive boundaries / legacy fallback / deterministic sort failed';end if;
 r:=public.fq_teklif_raporu(p_ara=>'Literal %_ search');
 if (r->>'total_count')::int<>4 then raise exception 'Literal search treats wildcard chars as patterns';end if;
 r:=public.fq_teklif_raporu(p_ara=>'FQ118-BOUNDARY-',p_magaza=>'FQ118 Main');
 if (r->>'total_count')::int<>0 or (r->'summary'->>'quote_count')::int<>0 then raise exception 'Store filter / empty aggregate failed';end if;
 r:=public.fq_teklif_raporu(p_ara=>''' OR true --');
 if (r->>'total_count')::int<>0 then raise exception 'Search interpolation vulnerability';end if;
end $test$;

-- Same report access for the existing central-editor role, under caller RLS.
select set_config('request.jwt.claim.sub','11800000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"11800000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if (public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-')->>'total_count')::int<>1205 then raise exception 'Active editor report denied';end if;
end $$;

-- Passive central editor cannot use the RPC despite having the role name.
select set_config('request.jwt.claim.sub','11800000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"11800000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ declare rejected boolean:=false; begin
 begin perform public.fq_teklif_raporu();exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Passive editor report permitted';end if;
end $$;

-- Ordinary owner may record actuals only in their own quote; cannot enter report.
select set_config('request.jwt.claim.sub','11800000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"11800000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"rol":"admin","abonelik_durumu":"aktif"}}',true);
do $test$
declare original public.teklifler%rowtype; saved public.teklifler%rowtype; affected integer; rejected boolean; field text;
 qid uuid:='11810000-0000-4000-8000-000000000001';
begin
 if auth.uid()<>'11800000-0000-4000-8000-000000000002'::uuid then raise exception 'Owner impersonation failed';end if;
 rejected:=false;
 begin perform public.fq_teklif_raporu();exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Ordinary profile / counterfeit JWT role entered report';end if;
 select * into strict original from public.teklifler where id=qid;
 if original.gercek_satis_tutari<>0 or original.takip_surumu<>1 then raise exception 'Zero-value actual or insert version incorrect';end if;
 if exists(select 1 from public.teklifler where id='11810000-0000-4000-8000-000000002001') then raise exception 'Owner can see another store quote';end if;
 update public.teklifler set gercek_satis_tutari=1.23,satis_odeme_sekli=' havale ',satis_banka=' Synthetic bank ',satis_taksit_sayisi=2,
  takip_surumu=999,takip_guncelleyen='11800000-0000-4000-8000-000000000003',takip_guncellendi_at='2000-01-01'
  where id=qid and takip_surumu=original.takip_surumu returning * into saved;
 if not found or saved.takip_surumu<>2 or saved.takip_guncelleyen is distinct from auth.uid()
  or saved.takip_guncellendi_at is null or saved.takip_guncellendi_at<'2026-01-01'::timestamptz
  or saved.satis_odeme_sekli<>'havale' or saved.satis_banka<>'Synthetic bank' then raise exception 'Actual-only update / stamps / trim failed';end if;
 update public.teklifler set gercek_satis_tutari=999 where id=qid and takip_surumu=original.takip_surumu;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Stale actuals overwrote seller values';end if;
 update public.teklifler set takip_surumu=999,takip_guncelleyen='11800000-0000-4000-8000-000000000003',takip_guncellendi_at='2000-01-01'
  where id=qid returning * into saved;
 if saved.takip_surumu<>2 or saved.takip_guncelleyen is distinct from auth.uid() then raise exception 'Forged audit-only update accepted';end if;
 -- Partial/invalid data must be rejected atomically; this does not require actuals for Satıldı.
 foreach field in array array['amount_missing','method_missing','date_missing','negative','nan','method_invalid','bank_long','installments_zero','installments_large'] loop
  rejected:=false;
  begin
   case field
    when 'amount_missing' then update public.teklifler set gercek_satis_tutari=null where id=qid;
    when 'method_missing' then update public.teklifler set satis_odeme_sekli=null where id=qid;
    when 'date_missing' then update public.teklifler set satis_tarihi=null where id=qid;
    when 'negative' then update public.teklifler set gercek_satis_tutari=-1 where id=qid;
    when 'nan' then update public.teklifler set gercek_satis_tutari='NaN'::numeric where id=qid;
    when 'method_invalid' then update public.teklifler set satis_odeme_sekli='bitcoin' where id=qid;
    when 'bank_long' then update public.teklifler set satis_banka=repeat('x',121) where id=qid;
    when 'installments_zero' then update public.teklifler set satis_taksit_sayisi=0 where id=qid;
    when 'installments_large' then update public.teklifler set satis_taksit_sayisi=61 where id=qid;
   end case;
  exception when check_violation then rejected:=true;
  end;
  if not rejected then raise exception 'Invalid actual field accepted: %',field;end if;
 end loop;
 update public.teklifler set durum='teklif' where id=qid and takip_surumu=2 returning * into saved;
 if not found or saved.takip_surumu<>3 or saved.gercek_satis_tutari is not null or saved.satis_odeme_sekli is not null
  or saved.satis_banka is not null or saved.satis_taksit_sayisi is not null or saved.satis_tarihi is not null then raise exception 'Reopened sale retains actuals';end if;
 update public.teklifler set durum='satildi' where id=qid returning * into saved;
 if saved.gercek_satis_tutari is not null or saved.takip_surumu<>4 then raise exception 'Satıldı requires or fabricates actuals';end if;
 if saved.satirlar is distinct from original.satirlar or saved.toplam is distinct from original.toplam
  or saved.satis_tutari is distinct from original.satis_tutari then raise exception 'Actual recording changed historical prices/snapshot';end if;
 update public.teklifler set gercek_satis_tutari=55,satis_odeme_sekli='nakit',satis_tarihi='2026-09-10'
  where id='11810000-0000-4000-8000-000000002001';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Owner can update another store sale';end if;
 rejected:=false;
 begin update public.teklifler set bayi_id='11800000-0000-4000-8000-000000000003' where id=qid;
 exception when raise_exception then if sqlerrm<>'Teklif sahibi değiştirilemez' then raise;end if;rejected:=true;
 when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Owner transfer allowed';end if;
end $test$;

-- Revision changes for amount and display-only edits even when the row count
-- stays the same. Tests use only synthetic rows, then roll back.
select set_config('request.jwt.claim.sub','11800000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"11800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare before_rev text; after_rev text; begin
 before_rev:=public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-')->>'report_revision';
 update public.teklifler set gercek_satis_tutari=151 where id='11810000-0000-4000-8000-000000000002';
 after_rev:=public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-')->>'report_revision';
 if before_rev=after_rev then raise exception 'Report revision misses actual amount mutation';end if;
 before_rev:=after_rev;
 update public.teklifler set musteri_ad='Changed synthetic name' where id='11810000-0000-4000-8000-000000000002';
 after_rev:=public.fq_teklif_raporu(p_ara=>'FQ118-COHORT-')->>'report_revision';
 if before_rev=after_rev then raise exception 'Report revision misses display-only mutation';end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare rejected boolean:=false; begin
 if auth.uid() is not null or current_user<>'anon' then raise exception 'Anonymous impersonation failed';end if;
 begin perform public.fq_teklif_raporu();exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous report permitted';end if;
end $$;
reset role;
rollback;
select 'REPORTING_AND_ACTUAL_SALES_RLS_OK' as result,
 '1205-row complete aggregates/export; status-independent conversion; Istanbul dates; literal search; legacy arrays; active editor access; passive/ordinary/anon denial; zero/partial actuals; version/stamps; unchanged snapshots; revision detection; all synthetic fixtures rolled back' as checked;
