#!/usr/bin/env python3
"""Render a fail-closed SaaS emergency ingress bundle; never applies it.

Normal publication remains blue/green. This is the explicitly documented
degraded recovery option when no previous executable understands SaaS grants.
It does not grant a maintenance window, change lifecycle state, or replay work.
"""
import argparse
import json
import pathlib

import release_client_compat as compat

RECOVERY_LOCATION = '@naumi_saas_recovery_503'
GATE = '''
  # SaaS emergency recovery: no public application or legacy dispatch.
  recursive_error_pages off;
  error_page 503 =503 @naumi_saas_recovery_503;
  add_header Cache-Control "no-store" always;
  add_header Retry-After "60" always;
  add_header X-Naumi-Recovery "saas-controlled-maintenance" always;
  return 503;
  location @naumi_saas_recovery_503 {
    internal;
    default_type text/plain;
    add_header Cache-Control "no-store" always;
    add_header Retry-After "60" always;
    add_header X-Naumi-Recovery "saas-controlled-maintenance" always;
    return 503 "Service temporarily unavailable.";
  }
'''


def server_inventory(dump_text):
    parsed = compat.Dump(dump_text)
    return [
        {'path': name, 'serverOrdinal': ordinal,
         'serverSha256': compat.sha(parsed.files[name][node.start:node.end].encode()),
         'listen': [child.args for child in node.children or [] if child.name == 'listen'],
         'serverNames': [arg for child in node.children or [] if child.name == 'server_name' for arg in child.args]}
        for name in parsed.files
        for ordinal, node in enumerate(node for node in compat.walk(parsed.nodes[name]) if node.name == 'server')
    ]


def render(dump_text, spec, output, *, source_files):
    """Select explicit audited server blocks, guarded by full dump + block hashes.

    Return at server rewrite phase precedes every existing location, including
    maps/old cookies, static aliases, RSC and private media. Our named error
    handler prevents an existing error_page from turning 503 into proxy access.
    Internal Web/Worker endpoints and unrelated server blocks are unchanged.
    """
    compat.require(spec.get('kind') == 'saas-controlled-maintenance-recovery', 'RECOVERY_KIND_REQUIRED')
    compat.require(spec.get('expectedDumpSha256') == compat.sha(dump_text.encode()), 'RECOVERY_DUMP_CAS_CHANGED')
    compat.require(spec.get('restoreDatabase') is False and spec.get('replayAcceptedTasks') is False,
                   'RECOVERY_MUST_PRESERVE_DATA_AND_TASKS')
    compat.require(spec.get('compatibleBusinessRollback') is False, 'DO_NOT_CLAIM_COMPATIBLE_BUSINESS_ROLLBACK')
    targets = spec.get('servers')
    compat.require(isinstance(targets, list) and bool(targets), 'AUDITED_SERVER_LIST_REQUIRED')
    parsed = compat.Dump(dump_text)
    inventory = {(row['path'], row['serverOrdinal']): row for row in server_inventory(dump_text)}
    edits, selected = {}, set()
    for target in targets:
        key = (target.get('path'), target.get('serverOrdinal'))
        compat.require(key not in selected and key in inventory, 'UNKNOWN_OR_DUPLICATE_RECOVERY_SERVER')
        selected.add(key)
        compat.require(target.get('serverSha256') == inventory[key]['serverSha256'], 'RECOVERY_SERVER_CAS_CHANGED')
        name, ordinal = key
        node = [node for node in compat.walk(parsed.nodes[name]) if node.name == 'server'][ordinal]
        # Unknown included server-level error/recursive rules need explicit
        # expansion and review; do not guess at their inherited semantics.
        compat.require(not any(child.name == 'include' for child in node.children or []),
                       'EXPAND_AND_REVIEW_SERVER_INCLUDES_BEFORE_RECOVERY')
        compat.require(not any(child.name == 'location' and RECOVERY_LOCATION in child.args
                               for child in compat.walk(node.children or [])), 'RECOVERY_LOCATION_COLLISION')
        text = parsed.files[name]
        body_start = text.index('{', node.tokens[-1].end) + 1
        changes = edits.setdefault(name, [])
        changes.append((body_start, body_start, GATE))
        # Server-level directives otherwise duplicate or override our handler.
        # Location-specific rules remain byte-identical but cannot be reached.
        for child in node.children or []:
            if child.name in ('error_page', 'recursive_error_pages'):
                changes.append((child.start, child.end, ''))
    patches = {}
    for name, changes in edits.items():
        text = parsed.files[name]
        for begin, end, replacement in sorted(changes, reverse=True):
            text = text[:begin] + replacement + text[end:]
        patches[name] = text
    after = parsed.render(patches)
    # Parse the final closure before writing; syntax is additionally tested by
    # actual Linux nginx -t using a captured/fixture configuration tree.
    compat.Dump(after)
    report = {
        'schemaVersion': 1, 'kind': spec['kind'], 'configClosureValidated': True,
        'beforeDumpSha256': compat.sha(dump_text.encode()), 'afterDumpSha256': compat.sha(after.encode()),
        'servers': [inventory[key] for key in sorted(selected)],
        'compatibleBusinessRollback': False, 'degradedRecoveryOnly': True,
        'databaseRestored': False, 'tasksReplayed': False, 'applied': False,
        'productionAcceptance': False, 'workerDrainProven': False,
        'allPublicEntrancesInventoried': False,
    }
    compat.write_gateway_bundle(dump_text, patches, after, report, output, source_files)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump', type=pathlib.Path, required=True)
    parser.add_argument('--inventory', action='store_true')
    parser.add_argument('--spec', type=pathlib.Path)
    parser.add_argument('--sources', type=pathlib.Path, help='captured raw closure rooted by absolute config paths')
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    dump_text = args.dump.read_bytes().decode()
    if args.inventory:
        print(json.dumps({'dumpSha256': compat.sha(dump_text.encode()), 'servers': server_inventory(dump_text)}, indent=2))
        return
    compat.require(args.spec is not None and args.sources is not None and args.output is not None,
                   'RECOVERY_PLAN_SOURCES_OUTPUT_REQUIRED')
    parsed = compat.Dump(dump_text)
    sources = {name: (args.sources / name.lstrip('/')).read_bytes() for name in parsed.files}
    print(json.dumps(render(dump_text, json.loads(args.spec.read_bytes()), args.output, source_files=sources), indent=2))


if __name__ == '__main__':
    main()
