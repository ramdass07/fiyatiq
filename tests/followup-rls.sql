-- Run ONLY on FiyatIQ-Deneme (sbdrbneforrsqahwxadl).
-- Uses existing active bayi identities with a shared allowed brand.
-- Synthetic quote rows, claims and all test mutations are rolled back.
-- No customer/account identities are returned.
begin;
do $test$
declare
  owner_uid uuid;
  other_uid uuid;
  allowed_brand public.marka_tipi;
  quote_uid uuid := gen_random_uuid();
  snapshot jsonb := '{"snapshot_version":1,"no":"FOLLOWUP-RLS-TEST","items":[{"model":"SYNTHETIC-TEST","adet":1,"nakit":12345}],"hesap":{"finalNakit":12345}}'::jsonb;
  saved public.teklifler%rowtype;
  before_stamp timestamptz;
  affected integer;
  rejected boolean;
begin
  select a.id,b.id,m.brand into owner_uid,other_uid,allowed_brand
  from public.profiller a
  join public.profiller b on b.id<>a.id
  cross join lateral unnest(a.marka_erisimi) as m(brand)
  where a.rol='bayi' and b.rol='bayi'
    and a.abonelik_durumu in ('aktif','deneme')
    and b.abonelik_durumu in ('aktif','deneme')
    and m.brand=any(b.marka_erisimi)
  order by a.id,b.id,m.brand limit 1;
  if owner_uid is null or other_uid is null then
    raise exception 'TEST FIXTURE MISSING: two active bayi users with a shared brand required';
  end if;

  perform set_config('request.jwt.claim.sub',owner_uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if auth.uid() is distinct from owner_uid or current_user<>'authenticated' then
    raise exception 'FAIL: owner impersonation';
  end if;

  -- Initial insert ignores forged audit metadata and starts at version zero.
  insert into public.teklifler
    (id,bayi_id,marka,musteri_ad,musteri_tel,teklif_no,satirlar,toplam,satis_tutari,durum,
     takip_surumu,takip_guncelleyen,takip_guncellendi_at)
  values
    (quote_uid,owner_uid,allowed_brand,'Synthetic follow-up test','0000000000',
     'RLS-'||quote_uid::text,snapshot,12345,12345,'teklif',999,other_uid,'2000-01-01')
  returning * into saved;
  if saved.takip_surumu<>0 or saved.takip_guncelleyen is not null or saved.takip_guncellendi_at is not null then
    raise exception 'FAIL: forged insert audit metadata accepted';
  end if;

  -- Owner update atomically advances 0 -> 1; stamps and trims server-side.
  before_stamp:=clock_timestamp();
  update public.teklifler set
    takip_notu='  Synthetic customer callback  ',takip_sorumlusu='  Test salesperson  ',
    sonraki_arama=now()+interval '1 day',takip_surumu=999,
    takip_guncelleyen=other_uid,takip_guncellendi_at='2000-01-01'
  where id=quote_uid and takip_surumu=0 returning * into saved;
  get diagnostics affected=row_count;
  if affected<>1 or saved.takip_surumu<>1 or saved.takip_guncelleyen is distinct from owner_uid
    or saved.takip_guncellendi_at is null or saved.takip_guncellendi_at<before_stamp
    or saved.takip_guncellendi_at>clock_timestamp()
    or saved.takip_notu<>'Synthetic customer callback' or saved.takip_sorumlusu<>'Test salesperson' then
    raise exception 'FAIL: owner follow-up/version/server stamp';
  end if;
  if saved.satirlar is distinct from snapshot or saved.toplam<>12345 or saved.satis_tutari<>12345 then
    raise exception 'FAIL: follow-up changed the price snapshot';
  end if;

  -- A stale optimistic-lock version matches no rows and changes no note.
  update public.teklifler set takip_notu='STALE UPDATE MUST NOT APPLY'
  where id=quote_uid and takip_surumu=0;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: stale version overwrote follow-up';end if;
  select * into saved from public.teklifler where id=quote_uid;
  if saved.takip_notu<>'Synthetic customer callback' or saved.takip_surumu<>1 then
    raise exception 'FAIL: stale update changed persisted values';
  end if;

  -- Audit-only forgery also preserves the existing server stamps/version.
  before_stamp:=saved.takip_guncellendi_at;
  update public.teklifler set takip_surumu=777,takip_guncelleyen=other_uid,
    takip_guncellendi_at='2000-01-01' where id=quote_uid returning * into saved;
  if saved.takip_surumu<>1 or saved.takip_guncelleyen is distinct from owner_uid
    or saved.takip_guncellendi_at is distinct from before_stamp then
    raise exception 'FAIL: audit-only forgery accepted';
  end if;

  rejected:=false;
  begin
    update public.teklifler set durum='kaybedildi',kayip_nedeni='   ' where id=quote_uid;
  exception when raise_exception then
    if sqlerrm<>'Kaybedilen teklif için kayıp nedeni gerekli' then raise;end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: lost status without reason accepted';end if;

  -- Closed statuses remove a scheduled callback; won offers remove loss reason.
  update public.teklifler set durum='satildi',sonraki_arama=now()+interval '2 days',kayip_nedeni='discard'
  where id=quote_uid and takip_surumu=1 returning * into saved;
  if not found or saved.durum<>'satildi' or saved.sonraki_arama is not null
    or saved.kayip_nedeni<>'' or saved.takip_surumu<>2 then
    raise exception 'FAIL: sold offer retained callback/loss reason';
  end if;
  update public.teklifler set durum='teklif',sonraki_arama=now()+interval '3 days'
  where id=quote_uid and takip_surumu=2 returning * into saved;
  if not found or saved.sonraki_arama is null or saved.takip_surumu<>3 then
    raise exception 'FAIL: reopening an offer could not schedule a callback';
  end if;
  update public.teklifler set durum='kaybedildi',kayip_nedeni='  Synthetic price objection  ',
    sonraki_arama=now()+interval '4 days'
  where id=quote_uid and takip_surumu=3 returning * into saved;
  if not found or saved.durum<>'kaybedildi' or saved.sonraki_arama is not null
    or saved.kayip_nedeni<>'Synthetic price objection' or saved.takip_surumu<>4 then
    raise exception 'FAIL: lost offer reason/callback/version';
  end if;
  if saved.satirlar is distinct from snapshot or saved.toplam<>12345 or saved.satis_tutari<>12345 then
    raise exception 'FAIL: status updates changed the price snapshot';
  end if;

  -- Existing legacy losses may lack a reason; a recorded reason must not be erased.
  rejected:=false;
  begin
    update public.teklifler set kayip_nedeni='   ' where id=quote_uid;
  exception when raise_exception then
    if sqlerrm<>'Kaybedilen teklif için kayıp nedeni gerekli' then raise;end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'FAIL: recorded loss reason can be erased';end if;

  -- A different active bayi has the same brand but cannot read/update this row.
  perform set_config('request.jwt.claim.sub',other_uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated')::text,true);
  if auth.uid() is distinct from other_uid then raise exception 'FAIL: other-user impersonation';end if;
  select count(*) into affected from public.teklifler where id=quote_uid;
  if affected<>0 then raise exception 'FAIL: another bayi can read the offer';end if;
  update public.teklifler set takip_notu='OTHER USER MUST NOT APPLY' where id=quote_uid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: another bayi can update the offer';end if;

  -- Anonymous access must either have no row visibility or be privilege-denied.
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  if auth.uid() is not null or current_user<>'anon' then raise exception 'FAIL: anonymous impersonation';end if;
  affected:=0;
  begin
    select count(*) into affected from public.teklifler where id=quote_uid;
  exception when insufficient_privilege then affected:=0;
  end;
  if affected<>0 then raise exception 'FAIL: anonymous offer read';end if;
  affected:=0;
  begin
    update public.teklifler set takip_notu='ANON MUST NOT APPLY' where id=quote_uid;
    get diagnostics affected=row_count;
  exception when insufficient_privilege then affected:=0;
  end;
  if affected<>0 then raise exception 'FAIL: anonymous offer update';end if;

  -- Return as the owner and verify both denied updates left the snapshot intact.
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',owner_uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select * into saved from public.teklifler where id=quote_uid;
  if not found or saved.takip_notu<>'Synthetic customer callback' or saved.takip_surumu<>4
    or saved.takip_guncelleyen is distinct from owner_uid or saved.satirlar is distinct from snapshot
    or saved.toplam<>12345 or saved.satis_tutari<>12345 then
    raise exception 'FAIL: final persisted owner state';
  end if;
  execute 'reset role';
end;
$test$;
rollback;
select 'tests passed: follow-up ownership, optimistic locking, server stamps, closed statuses, snapshot preservation and anonymous denial; all test rows rolled back' as result;
