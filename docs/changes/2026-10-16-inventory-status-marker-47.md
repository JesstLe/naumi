# Inventory status marker and 47 layered maintenance baseline

- `release47_inventory.py` recognizes only a separate leading `●` token from
  systemctl output as presentation. Failed service names then receive normal
  show/cat observation. Invalid/attached markers remain parse errors; template
  and masked units remain collected and their observation failures remain errors.
- `LiveAdapter.inventory` permits the same three exact retained systemd error
  pairs on explicitly target-bound Oct16 47 one-time-maintenance as on 103:
  list/SERVICE_LIMIT_EXCEEDED, cat/OBSERVATION_UNAVAILABLE,
  show/OBSERVATION_UNAVAILABLE. Existing date/time, acknowledgement, mode and
  task/data-preservation authorization checks still apply. All other errors,
  identity/core completeness failures and pin races still HOLD.
- `baselineCoverage` remains coreComplete=true, systemdReferenceCoverage=partial,
  retainedSystemdErrors unchanged, retirementEvidence=false and taskDrainEvidence=false.
  This is not systemd reference completeness, task drain, retirement authorization,
  a change to business source, or a deployment.
- Focused offline fixtures cover real bullet lines, malformed markers,
  template/masked failures, 47 authorization/ack/date/window/target mismatch,
  core and unknown errors. No host is connected or modified by this module test.

Command: `python -m unittest discover -s scripts/ops -p test_release_maintenance_inventory.py`
and `python -m unittest discover -s scripts/ops -p test_release47_inventory.py`,
plus the existing maintenance session suite for integration regression.
