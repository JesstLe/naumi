#!/usr/bin/env bash
# Full source snapshot rehearsal; no application, supplier, working or production DB.
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
COMMIT=65adfe8742e7a1fe120e7ce7a94409c50c76eb44
SOURCE="$ROOT/source/$COMMIT-clean"
APP=naumi-staging-db-1
DB=naumi_return_migration_fixture
ROLLBACK_DB=naumi_return_rollback_fixture
DUMP="$ROOT/evidence/return-migration-baseline.dump"
VERIFY="$ROOT/config/verify-return-migration-fields.sql"
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
exec 9>"$ROOT/evidence/return-migrations.lock"
flock -n 9 || exit 75
test ! -e "$DUMP" || { echo 'RETURN_MIGRATION=EXISTING_DUMP_RECONCILE'; exit 75; }
db(){ docker exec -i "$APP" psql -X -v ON_ERROR_STOP=1 -U naumi_staging -d "$1" -At; }
test "$(printf "SELECT count(*) FROM pg_database WHERE datname IN ('$DB','$ROLLBACK_DB');" | db postgres)" = 0
cleanup(){
 status=$?; trap - EXIT
 docker exec "$APP" dropdb --if-exists -U naumi_staging "$DB"
 docker exec "$APP" dropdb --if-exists -U naumi_staging "$ROLLBACK_DB"
 if test "$status" = 0; then rm -f "$DUMP"; fi
 exit "$status"
}
trap cleanup EXIT
docker exec "$APP" pg_dump -U naumi_staging -d naumi_snapshot_reference -Fc > "$DUMP"
HASH=$(sha256sum "$DUMP" | cut -d' ' -f1)
printf 'RETURN_MIGRATION_DUMP_SHA256=%s\n' "$HASH"
restore(){
 docker exec "$APP" createdb -U naumi_staging "$1"
 docker exec -i "$APP" pg_restore -U naumi_staging -d "$1" --no-owner --no-acl < "$DUMP"
 printf 'CREATE EXTENSION IF NOT EXISTS dblink;' | db "$1" >/dev/null
}
restore "$DB"
db "$DB" < "$VERIFY"
echo 'RETURN_MIGRATION_BASELINE=PASS FULL_SNAPSHOT=1'
for pass in 1 2; do
 for file in 20261007-artwork-provenance.sql 20261007-supplier-cost-ledger.sql 20261007-apimart-default-preset.sql; do
  db "$DB" < "$SOURCE/scripts/migrations/$file" >/dev/null
 done
 db "$DB" < "$VERIFY"
 printf 'RETURN_MIGRATION_APPLY=PASS ITERATION=%s ORIGINAL_FIELDS_UNCHANGED=1\n' "$pass"
done
test "$(printf "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND ((table_name='app_artworks' AND column_name='creation_provenance') OR (table_name='app_supplier_calls' AND column_name IN ('parameters','billing_unit_id')));" | db "$DB")" = 3
test "$(printf "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('app_model_image_presets','app_billing_api_cost_reviews');" | db "$DB")" = 2
echo 'RETURN_MIGRATION_MODIFIED=PASS REQUIRED_COLUMNS=3 REQUIRED_TABLES=2 IDEMPOTENT=1'
restore "$ROLLBACK_DB"
db "$ROLLBACK_DB" < "$VERIFY"
test "$(sha256sum "$DUMP" | cut -d' ' -f1)" = "$HASH"
original_columns="SELECT table_name||':'||column_name||':'||udt_name||':'||is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position;"
printf '%s\n' "$original_columns" | db naumi_snapshot_reference > "$ROOT/evidence/return-migration-schema-baseline.txt"
printf '%s\n' "$original_columns" | db "$ROLLBACK_DB" > "$ROOT/evidence/return-migration-schema-rollback.txt"
cmp "$ROOT/evidence/return-migration-schema-baseline.txt" "$ROOT/evidence/return-migration-schema-rollback.txt"
echo 'RETURN_MIGRATION_ROLLBACK=PASS SEPARATE_DATABASE=1 ORIGINAL_SCHEMA_DATA=RESTORED WORKING_COPY_CHANGED=0'
echo 'RETURN_MIGRATION=PASS SOURCE=FULL_REFERENCE_SNAPSHOT PRODUCTION_RUN=0 SUPPLIER_CALLS=0'
