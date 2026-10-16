"""Copy candidate immutable assets from a stopped local image; preserve six legacy sets."""
import json,os,pathlib,subprocess,uuid
import release_client_compat as compat
root=pathlib.Path(os.environ['NAUMI_REAL_COMPAT_OUTPUT']).resolve()
legacy=pathlib.Path(os.environ.get('NAUMI_REAL_COMPAT_LEGACY_ASSETS','E:/Workspace/naumi/output/release47-evening-20261016/legacy-assets')).resolve()
image=os.environ['NAUMI_REAL_COMPAT_NEW_IMAGE'];name='compat-asset-'+uuid.uuid4().hex[:10]
def run(args):return subprocess.check_output(args,stderr=subprocess.STDOUT).decode().strip()
root.mkdir(parents=True,exist_ok=True);static=root/'candidate-static';static.mkdir()
run(['docker','create','--name',name,'--label','io.naumi.asset-fixture=1',image])
try:run(['docker','cp',name+':/app/.next/static/.',str(static)])
finally:run(['docker','rm',name])
sources=[(p.name,p/'.next/static')for p in legacy.iterdir()if p.is_dir()and(p/'.next/static').is_dir()]
assert len(sources)==6,('Expected six legacy builds',len(sources))
sources.append(('candidate-final',static))
aliases=[('/_next/static/chunks/1528-73f862c260cda885.js',legacy/'alias/var/www/naumi-canvas-credits47/73f862c260cd/1528-73f862c260cda885.js')]
manifest=compat.collect_assets(sources,aliases);compat.materialize_assets(manifest,root/'all-real-static-union')
count=compat.verify_assets(manifest,root/'all-real-static-union')
(root/'asset-inputs.json').write_text(json.dumps({'image':image,'imageId':run(['docker','image','inspect',image,'--format','{{.Id}}']),'sources':[(n,str(p))for n,p in sources],'assets':count,'aliasCount':len(aliases)},indent=2))
print('FINAL_STATIC_UNION=PASS LEGACY_BUILDS=6 CANDIDATE_BUILDS=1 ALIASES=1 ASSETS='+str(count))
