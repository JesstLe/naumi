#!/usr/bin/env python3
"""Pure gateway assertions; no production writes or SSH side effects."""
import ast,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parents[1]
source=ast.parse((root/'scripts/deploy-image-cache-slots.py').read_text())
function=next(n for n in source.body if isinstance(n,ast.FunctionDef)and n.name=='render_gateway')
ns={'re':re};exec(compile(ast.Module(body=[function],type_ignores=[]),'gateway-render','exec'),ns)
before=pathlib.Path(sys.argv[1]).read_text();after=ns['render_gateway'](before)
def port(body,location):
 block=re.search(r'location\s+'+re.escape(location)+r'\s*\{[^{}]*\}',body,re.S);assert block,location
 return int(re.search(r'127\.0\.0\.1:(\d+)',block.group()).group(1))
for route,new in [('/',13028),('= /desktop',13029),('^~ /desktop/',13029),('= /enterprise',13030),('= /team',13030),('^~ /_next/',13028),('^~ /desktop/_next/',13029),('^~ /enterprise/_next/',13030),('= /api/version',13028)]:assert port(after,route)==new,route
for route in ['^~ /api/','= /api/team','^~ /api/team/','= /api/enterprise','^~ /api/enterprise/','= /api/feature-access','= /desktop/api/team','^~ /desktop/api/team/','= /desktop/api/feature-access']:assert port(before,route)==port(after,route),route
assert port(after,'^~ /desktop/api/')==port(before,'= /desktop')
for route in ['= /api/media/image-cache','= /api/public-image-cache','= /api/team/media','= /api/enterprise/media']:assert port(after,route)==13028
for route in ['@imagegen_previous_primary_ui','@enterprise_previous_assets','@entry_previous_ui_assets']:assert port(after,route)==port(before,route)
assert port(after,'@image_cache_old_desktop')==port(before,'^~ /desktop/_next/')
pathlib.Path(sys.argv[1]+'.candidate').write_text(after)
print('IMAGE_CACHE_GATEWAY=PASS UI=3 CACHE_READS=NEW CREATION_AGENT_APIS=UNCHANGED OLD_STATIC_FALLBACK=EXACT VERSION=NEW')
