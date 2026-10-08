#!/usr/bin/env bash
set -Eeuo pipefail
CONTAINER=naumi-staging-db-1
ROOT=/opt/naumi-staging
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
sql() { docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U naumi_staging -d "$1" -At; }
CHECK=$(cat <<'SQL'
CREATE TEMP TABLE compared(table_name text,rows bigint,row_hash text);
DO $$ DECLARE t record; n bigint; h text;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
  EXECUTE format('SELECT count(*),md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'''' ORDER BY md5(to_jsonb(r)::text)),'''')) FROM public.%I r',t.tablename) INTO n,h;
  INSERT INTO compared VALUES(t.tablename,n,h);
 END LOOP;
END $$;
SELECT table_name || ':' || rows || ':' || row_hash FROM compared ORDER BY table_name;
SQL
)
printf '%s\n' "$CHECK" | sql naumi_snapshot_reference > "$ROOT/evidence/database-reference-hashes.txt"
printf '%s\n' "$CHECK" | sql naumi_staging > "$ROOT/evidence/database-working-hashes.txt"
cmp "$ROOT/evidence/database-reference-hashes.txt" "$ROOT/evidence/database-working-hashes.txt"
count=$(grep -c '^app_' "$ROOT/evidence/database-working-hashes.txt")
echo "DATABASE_ALL_PUBLIC_TABLES=IDENTICAL APP_TABLES=$count"
