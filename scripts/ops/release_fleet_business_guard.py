"""Read-only retained-state guard before a legacy 103 consumer can be restored.

No admission issuer, image-floor claim, data cleanup or live cutback exists here.
Zero rows is a bounded observation, not proof that external producers are frozen.
"""
import json
import re

try:
    from .release47_host import Hold, environment, public_identity, require
except ImportError:
    from release47_host import Hold, environment, public_identity, require


def legacy_fleet_business_sql(schema='public'):
    """Export the exact SQL for isolated real-PG validation without Docker."""
    require(isinstance(schema, str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', schema),
            'FLEET_ROLLBACK_SCHEMA_UNVERIFIED')
    return ("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
            "SET LOCAL statement_timeout='8s';\n"
            "SET LOCAL lock_timeout='1s';\n"
            "SET LOCAL idle_in_transaction_session_timeout='10s';\n"
            "SET LOCAL search_path=pg_catalog;\n"
            "SELECT json_build_object('database',current_database(),"
            "'readOnly',current_setting('transaction_read_only'),"
            "'isolation',current_setting('transaction_isolation'),"
            "'schema','" + schema + "','table','app_fleet_commands',"
            "'businessRows',count(*)) FROM \"" + schema + "\".\"app_fleet_commands\" "
            "WHERE operation->>'type'='business.query';\nCOMMIT;\n").encode()


LEGACY_FLEET_BUSINESS_SQL = legacy_fleet_business_sql()


def _unique_object(pairs):
    """Decode one JSON object while rejecting repeated keys instead of overwriting them."""
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def parse_legacy_fleet_business_result(raw, database, *, schema='public'):
    """Validate actual psql bytes; an empty/unknown result is never zero rows."""
    require(isinstance(raw, bytes) and 0 < len(raw) <= 4096,
            'FLEET_ROLLBACK_DATABASE_RESULT_UNVERIFIED')
    lines = raw.decode('utf-8').splitlines()
    require(len(lines) == 1 and bool(lines[0].strip()), 'FLEET_ROLLBACK_DATABASE_RESULT_UNVERIFIED')
    result = json.loads(lines[0], object_pairs_hook=_unique_object)
    require(isinstance(result, dict) and set(result) ==
            {'database', 'readOnly', 'isolation', 'schema', 'table', 'businessRows'} and
            result['database'] == database and result['readOnly'] == 'on' and
            result['isolation'] == 'repeatable read' and result['schema'] == schema and
            result['table'] == 'app_fleet_commands' and type(result['businessRows']) is int and
            0 <= result['businessRows'] <= 9223372036854775807,
            'FLEET_ROLLBACK_DATABASE_RESULT_UNVERIFIED')
    return result


def require_no_retained_fleet_business(result):
    """Raise Hold unless the parsed retained business-command count is exactly zero."""
    require(result['businessRows'] == 0, 'FLEET_BUSINESS_ROWS_BLOCK_LEGACY_ROLLBACK')


def assert_legacy_fleet_rollback_clear(tx, database_identity, *, schema='public'):
    """Pin the real DB and run strict read-only psql; every unknown fails closed."""
    sql = legacy_fleet_business_sql(schema)
    try:
        require(getattr(tx, 'target', None) == '103.30.76.93', 'FLEET_ROLLBACK_TARGET_UNVERIFIED')
        require(isinstance(database_identity, dict) and set(database_identity) ==
                {'id', 'name', 'image', 'running', 'startedAt', 'restartPolicy'},
                'FLEET_ROLLBACK_DATABASE_IDENTITY_REQUIRED')
        require(re.fullmatch(r'[a-f0-9]{64}', database_identity['id']) and
                re.fullmatch(r'sha256:[a-f0-9]{64}', database_identity['image']) and
                database_identity['running'] is True, 'FLEET_ROLLBACK_DATABASE_IDENTITY_REQUIRED')
        database = tx.pin(database_identity)
        require(public_identity(database) == database_identity, 'FLEET_ROLLBACK_DATABASE_IDENTITY_CHANGED')
        env = environment(database)
        user, name = env.get('POSTGRES_USER'), env.get('POSTGRES_DB')
        require(all(isinstance(value, str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.-]{0,62}', value)
                    for value in (user, name)), 'FLEET_ROLLBACK_DATABASE_CONTEXT_UNVERIFIED')
        raw = tx.run(['docker', 'exec', '-i', database_identity['id'], 'psql', '-XqAt',
                      '--no-password', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', name],
                     stdin=sql, timeout=25)
        result = parse_legacy_fleet_business_result(raw, name, schema=schema)
    except Exception:
        # Do not leak psql output, inspected environment or transport exception data.
        raise Hold('FLEET_LEGACY_ROLLBACK_STATE_UNVERIFIED') from None
    require_no_retained_fleet_business(result)
    return {'databaseId': database_identity['id'], 'database': name, 'schema': schema,
            'businessRows': 0, 'readOnly': True, 'checkOnly': True,
            'externalProducersFrozen': False, 'liveCutbackExecuted': False}
