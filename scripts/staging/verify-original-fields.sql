\set ON_ERROR_STOP on
DO $$
DECLARE t record; cols text; q text; expected record; actual record; checked int := 0;
BEGIN
 IF current_database()<>'naumi_staging' THEN RAISE EXCEPTION 'STAGING_DATABASE_NAME_REQUIRED'; END IF;
 FOR t IN SELECT * FROM dblink('dbname=naumi_snapshot_reference user=naumi_staging',
  'SELECT tablename FROM pg_tables WHERE schemaname=''public'' ORDER BY tablename') AS tables(name text)
 LOOP
  SELECT string_agg(quote_ident(name),',' ORDER BY position) INTO cols
   FROM dblink('dbname=naumi_snapshot_reference user=naumi_staging',
    format('SELECT column_name,ordinal_position FROM information_schema.columns WHERE table_schema=''public'' AND table_name=%L',t.name)) AS columns(name text,position int);
  q := format('SELECT count(*)::text n,md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'''' ORDER BY md5(to_jsonb(r)::text)),'''')) h FROM (SELECT %s FROM public.%I) r',cols,t.name);
  SELECT * INTO expected FROM dblink('dbname=naumi_snapshot_reference user=naumi_staging',q) AS result(n text,h text);
  EXECUTE q INTO actual;
  IF actual.n<>expected.n OR actual.h<>expected.h THEN
   RAISE EXCEPTION 'ORIGINAL_FIELDS_DIFFER TABLE=% EXPECTED_COUNT=% ACTUAL_COUNT=%',t.name,expected.n,actual.n;
  END IF;
  checked := checked+1;
 END LOOP;
 RAISE NOTICE 'DATABASE_ORIGINAL_FIELDS=IDENTICAL TABLES=% ADDITIVE_COLUMNS_ALLOWED=1',checked;
END $$;
