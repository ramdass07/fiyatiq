-- Hakediş mutabakatı v1 — yetki ve idempotens testleri (yerel PostgreSQL'de, Supabase taklidiyle çalışır).
-- Kullanıcılar: A = admin (merkez işletme), B = admin (bağımsız başka işletme), C = personel,
--               S = A'ya bağlı şube (rol bayi), E = pasif bayi.
-- Her test başarısızsa 'TEST HATASI' ile durur.
\set ON_ERROR_STOP on
set role authenticated;

create or replace function pg_temp.kim(u text) returns void language sql as $$ select set_config('test.uid', u, false) $$;
create or replace function pg_temp.bekle(kosul boolean, ad text) returns void language plpgsql as $$
begin if not kosul then raise exception 'TEST HATASI: %', ad; end if; raise notice 'ok  %', ad; end $$;

-- 1) A yükler; aynı dosya ikinci kez mükerrer kayıt oluşturmaz
select pg_temp.kim('aaaaaaaa-0000-0000-0000-000000000001');
do $$ declare r jsonb; r2 jsonb; begin
  r := public.fq_hakedis_yukle('diva_kampanya','bosch','EYLUL.xlsx', repeat('a',64),
        '{"bas":"2026-09-01","bit":"2026-09-30"}',
        '[{"sira":2,"fatura_no":"2600000001","urun_kodu":"kdn55nwe0n","tarih":"2026-09-05","veri":{"Paket Adı":"X-202609"}}]');
  perform pg_temp.bekle(r->>'durum' = 'yuklendi', 'A ilk yükleme');
  r2 := public.fq_hakedis_yukle('diva_kampanya','bosch','EYLUL kopya.xlsx', repeat('a',64), '{}', '[{"sira":1}]');
  perform pg_temp.bekle(r2->>'durum' = 'ayni_dosya' and r2->>'yukleme_id' = r->>'yukleme_id', 'aynı dosya tekrar → ayni_dosya');
  perform pg_temp.bekle((select count(*) from public.hakedis_satir) = 1, 'satır mükerrer değil');
  perform pg_temp.bekle((select urun_kodu from public.hakedis_satir) = 'KDN55NWE0N', 'ürün kodu büyük harfe');
end $$;

-- 2) Kapsamı içine alan yeni rapor eskisini pasifleştirir; dar kapsamlı rapor pasifleştirmez
do $$ declare r jsonb; begin
  r := public.fq_hakedis_yukle('diva_kampanya','bosch','EYLUL+EKIM.xlsx', repeat('b',64),
        '{"bas":"2026-09-01","bit":"2026-10-20"}', '[{"sira":1,"fatura_no":"2600000002"}]');
  perform pg_temp.bekle((r->>'pasiflesen')::int = 1, 'geniş kapsam eskisini pasifleştirdi');
  r := public.fq_hakedis_yukle('diva_kampanya','bosch','EKIM 1-5.xlsx', repeat('c',64),
        '{"bas":"2026-10-01","bit":"2026-10-05"}', '[{"sira":1}]');
  perform pg_temp.bekle((r->>'pasiflesen')::int = 0, 'dar kapsam pasifleştirmedi');
  perform pg_temp.bekle((select count(*) from public.hakedis_yukleme where aktif) = 2, 'aktif yükleme sayısı 2');
  -- şube bazlı fatura raporu: farklı şube birbirini pasifleştirmez
  perform public.fq_hakedis_yukle('diva_fatura','bosch','SUBE1.xlsx', repeat('d',64), '{"sube_kodu":"S1","bas":"2026-09-01","bit":"2026-10-20"}', '[{"sira":1}]');
  r := public.fq_hakedis_yukle('diva_fatura','bosch','SUBE2.xlsx', repeat('e',64), '{"sube_kodu":"S2","bas":"2026-09-01","bit":"2026-10-20"}', '[{"sira":1}]');
  perform pg_temp.bekle((r->>'pasiflesen')::int = 0, 'farklı şube pasifleştirmedi');
  -- fiyat fark dosyaları asla birbirini pasifleştirmez (tarihli sürümler)
  perform public.fq_hakedis_yukle('fiyat_fark','bosch','7 Eylül.xlsx', repeat('f',64), '{"bas":"2026-09-07","bit":"2026-09-07","donemler":[202609]}', '[{"sira":1}]');
  r := public.fq_hakedis_yukle('fiyat_fark','bosch','22 Eylül.xlsx', repeat('1',64), '{"bas":"2026-09-01","bit":"2026-09-30","donemler":[202609]}', '[{"sira":1}]');
  perform pg_temp.bekle((r->>'pasiflesen')::int = 0, 'fiyat fark sürümleri korunur');
end $$;

-- 3) A tanım ekler (işletme kimliği sunucuda atanır)
insert into public.hakedis_paket(marka,paket_adi,paket_norm,tur) values ('bosch','Eylül-Tekil-202609','EYLUL TEKIL 202609','TEKİL');
select pg_temp.bekle((select isletme_id from public.hakedis_paket limit 1) = 'aaaaaaaa-0000-0000-0000-000000000001', 'paket A işletmesine yazıldı');

-- 4) Şube S (A'ya bağlı ama admin değil) hiçbir şey göremez ve yükleyemez
select pg_temp.kim('dddddddd-0000-0000-0000-000000000004');
select pg_temp.bekle((select count(*) from public.hakedis_yukleme) = 0 and (select count(*) from public.hakedis_paket) = 0, 'şube göremez');
do $$ begin
  perform public.fq_hakedis_yukle('diva_kampanya','bosch','x.xlsx', repeat('2',64), '{}', '[{"sira":1}]');
  raise exception 'TEST HATASI: şube yükleyebildi';
exception when insufficient_privilege then raise notice 'ok  şube yükleyemez'; end $$;
do $$ begin
  insert into public.hakedis_paket(marka,paket_adi,paket_norm) values ('bosch','s','S');
  raise exception 'TEST HATASI: şube paket yazabildi';
exception when insufficient_privilege then raise notice 'ok  şube paket yazamaz'; end $$;

-- 5) Personel C (is_editor kapsamında olsa da) göremez/yazamaz
select pg_temp.kim('cccccccc-0000-0000-0000-000000000003');
select pg_temp.bekle((select count(*) from public.hakedis_satir) = 0, 'personel göremez');
do $$ begin
  perform public.fq_hakedis_yukleme_durum((select gen_random_uuid()), false);
  raise exception 'TEST HATASI: personel durum değiştirebildi';
exception when insufficient_privilege then raise notice 'ok  personel durum değiştiremez'; end $$;

-- 6) Pasif kullanıcı E
select pg_temp.kim('eeeeeeee-0000-0000-0000-000000000005');
select pg_temp.bekle((select count(*) from public.hakedis_itiraz) = 0 and not public.fq_hakedis_yetkili(), 'pasif kullanıcı yetkisiz');

-- 7) Bağımsız admin B: A'nın verisini görmez; A'nın kaydının kimliğiyle değiştirme/silme girişimi etkisiz
select pg_temp.kim('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.bekle((select count(*) from public.hakedis_yukleme) = 0 and (select count(*) from public.hakedis_satir) = 0, 'B, A verisini görmez');
do $$ declare a_paket uuid; a_yuk uuid; n int; begin
  set local role postgres;
  select id into a_paket from public.hakedis_paket limit 1;
  select id into a_yuk from public.hakedis_yukleme limit 1;
  set local role authenticated;
  update public.hakedis_paket set tur = 'HARİÇ' where id = a_paket; get diagnostics n = row_count;
  perform pg_temp.bekle(n = 0, 'B, A paketini değiştiremez');
  delete from public.hakedis_paket where id = a_paket; get diagnostics n = row_count;
  perform pg_temp.bekle(n = 0, 'B, A paketini silemez');
  begin
    perform public.fq_hakedis_yukleme_durum(a_yuk, false);
    raise exception 'TEST HATASI: B, A yüklemesini pasifleştirdi';
  exception when raise_exception then
    if sqlerrm like 'TEST HATASI%' then raise; end if;
    raise notice 'ok  B, A yüklemesini pasifleştiremez (%)', sqlerrm;
  end;
end $$;
do $$ begin
  insert into public.hakedis_paket(isletme_id,marka,paket_adi,paket_norm) values ('aaaaaaaa-0000-0000-0000-000000000001','bosch','sahte','SAHTE');
  raise exception 'TEST HATASI: B, A işletmesine yazabildi';
exception when insufficient_privilege then raise notice 'ok  B, A işletmesi adına yazamaz'; end $$;
-- B kendi işletmesinde aynı dosyayı yükleyebilir (özet işletme bazında tekil)
do $$ declare r jsonb; begin
  r := public.fq_hakedis_yukle('diva_kampanya','bosch','EYLUL.xlsx', repeat('a',64), '{}', '[{"sira":1}]');
  perform pg_temp.bekle(r->>'durum' = 'yuklendi', 'B kendi işletmesine aynı dosyayı yükler');
end $$;

-- 8) A hâlâ yalnız kendi verisini görür
select pg_temp.kim('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.bekle((select count(*) from public.hakedis_yukleme) = 7, 'A kendi 7 yüklemesini görür');
reset role;
select 'HAKEDİŞ RLS TESTLERİ TAMAM' as sonuc;
