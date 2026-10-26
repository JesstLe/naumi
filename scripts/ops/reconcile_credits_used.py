#!/usr/bin/env python3
"""Reconcile app_users.credits_used against live billing holds.

credits_used is a denormalized hold counter (reserve +n, release/settle -n).
Flows that died between those steps leak it forever (2026-10-26 audit found
2537 phantom credits across 57 accounts). This script recomputes every account
from the authoritative source — billing operations in ('reserved','hold') —
and reports or applies the correction.

Usage (on the 47 host):
  python3 scripts/ops/reconcile_credits_used.py            # dry run
  python3 scripts/ops/reconcile_credits_used.py --apply    # fix drift
"""
import argparse, subprocess, sys

DB = "naumi-staging-db-1"

def psql(sql: str, params: tuple = ()) -> str:
    rendered = sql
    for i, value in enumerate(reversed(params), start=len(params)):
        rendered = rendered.replace(f"${len(params) - i + 1}", f"'{value}'")
    out = subprocess.run(
        ["docker", "exec", "-i", DB, "sh", "-c",
         'exec psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'],
        input=sql.encode(), capture_output=True, timeout=60)
    if out.returncode != 0:
        sys.exit(f"psql failed: {out.stderr.decode()}")
    return out.stdout.decode()

CHECK = """SELECT u.email,u.credits_used,COALESCE(h.held,0)
FROM app_users u LEFT JOIN (SELECT email,sum(reserved_credits)::int held FROM app_billing_operations WHERE state IN('reserved','hold') GROUP BY 1) h ON h.email=u.email
WHERE u.credits_used<>COALESCE(h.held,0)"""

APPLY = """BEGIN;
SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='15000ms';
WITH live AS (SELECT email,sum(reserved_credits)::int AS held FROM app_billing_operations WHERE state IN('reserved','hold') GROUP BY 1),
upd AS (SELECT u.email,COALESCE(l.held,0) held FROM app_users u LEFT JOIN live l ON l.email=u.email WHERE u.credits_used<>COALESCE(l.held,0))
UPDATE app_users u SET credits_used=upd.held FROM upd WHERE u.email=upd.email RETURNING u.email;
COMMIT;"""

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the correction (default: dry run)")
    args = parser.parse_args()
    rows = [line.split("|") for line in psql(CHECK).splitlines() if line.strip()]
    total_drift = sum(int(r[1]) - int(r[2]) for r in rows)
    print(f"drifted accounts: {len(rows)}, phantom reserved credits: {total_drift}")
    for email, used, held in rows[:20]:
        print(f"  {email}: counter={used} live={held}")
    if len(rows) > 20:
        print(f"  ... and {len(rows) - 20} more")
    if not rows:
        print("credits_used is in sync; nothing to do.")
        return
    if not args.apply:
        print("dry run only; pass --apply to fix.")
        return
    print(psql(APPLY))
    rows_after = psql(CHECK).splitlines()
    print(f"applied; drifted accounts remaining: {len([r for r in rows_after if r.strip()])}")

if __name__ == "__main__":
    main()
