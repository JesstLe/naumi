\set ON_ERROR_STOP on
DO $$
DECLARE t record; cols text; base_query text; working_query text; expected record; actual record; checked int := 0;
BEGIN
 IF current_database()<>'naumi_staging' THEN RAISE EXCEPTION 'STAGING_DATABASE_NAME_REQUIRED'; END IF;
 FOR t IN SELECT table_name,key_column FROM naumi_staging_guard.origin_rows GROUP BY 1,2 ORDER BY 1 LOOP
  SELECT string_agg(quote_ident(name),',' ORDER BY position) INTO cols
   FROM dblink('dbname=naumi_snapshot_reference user=naumi_staging',
    format('SELECT column_name,ordinal_position FROM information_schema.columns WHERE table_schema=''public'' AND table_name=%L',t.table_name)) AS columns(name text,position int);
  base_query := format('SELECT count(*)::text n,md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'''' ORDER BY md5(to_jsonb(r)::text)),'''')) h FROM (SELECT %s FROM public.%I) r',cols,t.table_name);
  SELECT * INTO expected FROM dblink('dbname=naumi_snapshot_reference user=naumi_staging',base_query) AS result(n text,h text);
  working_query := format('SELECT count(*)::text n,md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'''' ORDER BY md5(to_jsonb(r)::text)),'''')) h FROM (SELECT %s FROM public.%I WHERE %I::text IN(SELECT row_key FROM naumi_staging_guard.origin_rows WHERE table_name=%L)) r',cols,t.table_name,t.key_column,t.table_name);
  EXECUTE working_query INTO actual;
  IF actual.n<>expected.n OR actual.h<>expected.h THEN
   RAISE EXCEPTION 'IMPORTED_HISTORY_DIFFER TABLE=% EXPECTED_COUNT=% ACTUAL_COUNT=%',t.table_name,expected.n,actual.n;
  END IF;
  checked := checked+1;
 END LOOP;
 RAISE NOTICE 'IMPORTED_HISTORY_FIELDS=IDENTICAL TABLES=% NEW_TEST_ROWS=EXCLUDED',checked;
END $$;
