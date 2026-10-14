#!/usr/bin/env python3
"""Local service runner; never accepts a script path from the central server."""
import argparse, importlib.util, pathlib, re
parser=argparse.ArgumentParser()
parser.add_argument('--config',required=True)
args=parser.parse_args()
spec=importlib.util.spec_from_file_location('executor',pathlib.Path(__file__).with_name('fleet-release-executor.py'))
executor=importlib.util.module_from_spec(spec)
spec.loader.exec_module(executor)
config=executor.read_json(executor.protected_path(args.config),12000)
if not config.get('enabled'):
    raise SystemExit('FLEET_RELEASE_SCAN=DISABLED')
processed=0
for file in sorted(pathlib.Path(config['inbox']).glob('*.json')):
    if not re.fullmatch('[a-f0-9-]{36}\.json',file.name):
        continue
    if (pathlib.Path(config['outbox'])/file.name).exists():
        continue
    if processed>=20:
        break
    processed+=1
    try:
        executor.run(args.config,str(file))
    except (executor.GateError,ValueError,OSError,KeyError,TypeError):
        print('FLEET_RELEASE_SCAN=REJECTED_INVALID_INPUT')
