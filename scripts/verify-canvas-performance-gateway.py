#!/usr/bin/env python3
"""Verify actual gateway fixture preservation and three immutable port roles."""
import pathlib, subprocess, sys, json, re

root=pathlib.Path(__file__).resolve().parents[1]
fixture=pathlib.Path(sys.argv[1]).resolve()
out=pathlib.Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
before=fixture.read_text()
blocks=lambda value:{m.group(1).strip():m.group(0)for m in re.finditer(r'location\s+([^\n{]+)\s*\{[^{}]*\}',value,re.S)}
original=blocks(before)
media={'^~ /media/','= /api/media/image-cache','= /api/public-image-cache','= /api/team/media','= /api/enterprise/media','= /desktop/api/media/image-cache','= /desktop/api/public-image-cache','= /desktop/api/team/media','= /desktop/api/enterprise/media'}
roles={'ui':{'/','^~ /_next/','= /api/version'}|media,'desktop':{'= /desktop','^~ /desktop/','^~ /desktop/_next/','= /desktop/api/version'},'enterprise':{'= /enterprise','^~ /enterprise/','^~ /enterprise/_next/','= /team'}}
assert sum(map(len,roles.values()))==20

def run(label,ports=None):
 case=out/label;case.mkdir(exist_ok=True)
 if ports is not None:(case/'target-ports.json').write_text(json.dumps(ports))
 result=subprocess.run([sys.executable,str(root/'scripts/deploy-canvas-performance-slots.py'),str(case),'render-test',str(fixture)],capture_output=True,text=True)
 (case/'result.txt').write_text(result.stdout+result.stderr)
 return result

for label,ports in [('default',None),('fresh-ports',{'ui':13035,'desktop':13036,'enterprise':13037}),('reordered',{'enterprise':13037,'ui':13035,'desktop':13036})]:
 result=run(label,ports);assert result.returncode==0,result.stderr
 plan=ports or {'ui':13031,'desktop':13032,'enterprise':13033};rendered=blocks(result.stdout)
 changed=set().union(*roles.values())
 for kind,locations in roles.items():
  for location in locations:assert f'proxy_pass http://127.0.0.1:{plan[kind]}'in rendered[location],location
 for location,body in original.items():
  if location not in changed:assert rendered[location]==body,'Unrelated route/fallback changed: '+location
 for kind,port in [('ui',13028),('desktop',13029),('enterprise',13030)]:
  fallback=rendered['@canvas_perf_previous_'+kind]
  assert f'127.0.0.1:{port}'in fallback and 'error_page 404 = @image_cache_old_'in fallback

for label,ports in [
 ('duplicate',{'ui':13035,'desktop':13035,'enterprise':13037}),
 ('missing',{'ui':13035,'desktop':13036}),
 ('boolean',{'ui':True,'desktop':13036,'enterprise':13037}),
 ('string',{'ui':'13035','desktop':13036,'enterprise':13037}),
 ('active',{'ui':13028,'desktop':13036,'enterprise':13037}),
 ('out-of-range',{'ui':65536,'desktop':13036,'enterprise':13037})]:
 assert run(label,ports).returncode!=0,label
assert fixture.read_text()==before,'Original fixture must remain byte-for-byte untouched'
print('CANVAS_GATEWAY_PORT_PLAN=PASS DEFAULT_AND_FRESH35_36_37_20ROUTES CORE_AGENT_CREATION_TEAM_ENTERPRISE_API_AND_OLD_FALLBACKS=EXACT INVALID_OR_ACTIVE_PLANS=REJECTED ORIGINAL_FIXTURE=UNCHANGED')
