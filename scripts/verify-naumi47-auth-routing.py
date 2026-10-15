#!/usr/bin/env python3
"""Actual Nginx map regression with old/new backend markers, no account secrets."""
import importlib.util,pathlib,tempfile,subprocess,urllib.request,json,sys
spec=importlib.util.spec_from_file_location('fix',pathlib.Path(__file__).with_name('fix-naumi47-auth-routing.py'));fix=importlib.util.module_from_spec(spec);spec.loader.exec_module(fix)
before=r'''map "$http_referer|$cookie_nv_user|$cookie_wb_session" $naumi47_compat_api {
 default http://127.0.0.1:13055;
 ~^https?://47\.105\.59\.142/(legacy-workbench/[^|]*|(workbench|single|chat-image|login|admin)(\?[^|]*)?)\| http://127.0.0.1:17847;
 ~^https?://47\.105\.59\.142/(\?[^|]*)?\| http://127.0.0.1:13055;
 ~^[^|]*\|[^|]+\| http://127.0.0.1:13055;
 ~^[^|]*\|\|.+$ http://127.0.0.1:17847;
}
'''
cases=[('/dashboard?auth=sign-in','wb_session=old','native'),('/sign-in','wb_session=old','native'),('/canvas','wb_session=old','native'),('/works','wb_session=old','native'),('/batchshot/native/workbench','wb_session=old','native'),('/','wb_session=old','native'),('/legacy-workbench/workbench','wb_session=old','legacy'),('/workbench','wb_session=old','legacy'),('/single','wb_session=old','legacy'),('/chat-image','wb_session=old','legacy'),('/login','wb_session=old','legacy'),('/admin','wb_session=old','legacy'),('', 'wb_session=old','legacy'),('', 'wb_session=old; nv_user=native','native'),('/dashboard','', 'native')]
after=fix.render_gateway(before)
for bad in [after,before.replace('47\\.105','48\\.105'),before+before]:
 try:fix.render_gateway(bad);raise AssertionError('bad baseline accepted')
 except ValueError:pass
with tempfile.TemporaryDirectory(prefix='naumi47-map-') as temp:
 root=pathlib.Path(temp)
 def run(body):
  conf=root/'nginx.conf';conf.write_text('pid '+str(root/'nginx.pid')+'; error_log stderr; events {} http { access_log off; '+body+' server { listen 18080; location / { proxy_pass $naumi47_compat_api; } } server { listen 13055; location / { return 200 "native"; } } server { listen 17847; location / { return 200 "legacy"; } } }')
  subprocess.run(['nginx','-t','-c',str(conf)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  return conf
 conf=run(before);subprocess.run(['nginx','-c',str(conf)],check=True)
 def fetch(ref,cookie):
  h={'Cookie':cookie}
  if ref:h['Referer']='https://47.105.59.142'+ref
  with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:18080/api/auth/login',headers=h),timeout=5) as r:return r.read().decode()
 try:
  assert fetch('/dashboard?auth=sign-in','wb_session=old')=='legacy'
  print('BASELINE=PASS DASHBOARD_STALE_COOKIE_ROUTES_LEGACY=1')
  conf=run(after);subprocess.run(['nginx','-s','reload','-c',str(conf)],check=True,stderr=subprocess.PIPE)
  import time
  for _ in range(30):
   if fetch('/dashboard?auth=sign-in','wb_session=old')=='native':break
   time.sleep(.05)
  for ref,cookie,expected in cases:assert fetch(ref,cookie)==expected,(ref,expected)
  print('MODIFIED=PASS ACTUAL_NGINX=1 CASES='+str(len(cases))+' LEGACY_PRESERVED=1 NATIVE_STALE_COOKIE_LOGIN=1 AUTH_BYPASS=0')
  run(before);subprocess.run(['nginx','-s','reload','-c',str(conf)],check=True,stderr=subprocess.PIPE)
  for _ in range(30):
   if fetch('/dashboard?auth=sign-in','wb_session=old')=='legacy':break
   time.sleep(.05)
  assert fetch('/dashboard?auth=sign-in','wb_session=old')=='legacy'
  print('ROLLBACK=PASS ORIGINAL_ROUTE_RESTORED=1 PRODUCTION_CHANGED=0')
 finally:subprocess.run(['nginx','-s','quit','-c',str(conf)],check=True,stderr=subprocess.PIPE)
