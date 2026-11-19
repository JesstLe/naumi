"""Exercise the exact repair script against an isolated PostgreSQL container."""
import hashlib,json,os,pathlib,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path('E:/workspace/naumi/output/repair-empty-canvas-20261119/fixture-'+str(os.getpid()));OUT.mkdir(parents=True,exist_ok=True)
IMAGE='sha256:c52f7b2b6da332fddba7cf8028241dbf7d35afcfa62bf40b72399e1c505230e4'
NAME='naumi-empty-canvas-repair-test-'+str(os.getpid())
def docker(*args,data=None,check=True):
    r=subprocess.run(['wsl','-d','Ubuntu','-u','root','--','docker',*args],input=data,capture_output=True,timeout=35)
    if check and r.returncode:raise RuntimeError(r.stdout.decode('utf8','replace')[-800:])
    return r
def linux(p):return '/mnt/'+p.drive[0].lower()+p.as_posix()[2:]
def sql(value):docker('exec','-i',NAME,'psql','-U','postgres','-v','ON_ERROR_STOP=1',data=value.encode())
def mode(case,action,ok=True):
    directory=OUT/case;directory.mkdir(exist_ok=True)
    spec={'target':'47.105.59.142','projectKey':'tree:art-123456789-123','actorTag':hashlib.sha256(b'owner@fixture.invalid').hexdigest()[:12],'expectedDeletedAt':'2026-11-19T01:21:01.480Z','operationId':'00000000-0000-4000-8000-000000000001'}
    if case=='foreign':spec['actorTag']='000000000000'
    (directory/'SPEC.json').write_text(json.dumps(spec))
    tmp='/tmp/repair-empty-canvas-fixture-'+case
    r=docker('run','--rm','--user','0','--network','container:'+NAME,'-e','NODE_OPTIONS=','-e','NODE_PATH=/app/node_modules','-e','DATABASE_URL=postgres://postgres:fixture-only@127.0.0.1/postgres','-v',linux(directory)+':'+tmp,'-v',linux(ROOT/'scripts/ops/repair-empty-canvas-project.cjs')+':/case.cjs:ro','--entrypoint','node',IMAGE,'/case.cjs',action,tmp,check=False)
    (directory/(action+('-rejected' if not ok else '')+'.log')).write_bytes(r.stdout+r.stderr)
    assert (r.returncode==0)==ok,(case,action,r.stdout[-700:],r.stderr[-700:])

created=False
try:
    docker('run','--rm','-d','--name',NAME,'-e','POSTGRES_PASSWORD=fixture-only','postgres:16-alpine');created=True
    for _ in range(25):
        if docker('exec',NAME,'pg_isready','-U','postgres',check=False).returncode==0:break
        time.sleep(.2)
    else:raise RuntimeError('ISOLATED_PG_NOT_READY')
    sql("""CREATE TABLE app_artworks(id text PRIMARY KEY,email text,group_id text,parent_id text,batch_id text,created_at timestamptz,deleted_at timestamptz,title text);
CREATE TABLE app_creation_contexts(actor_email text,context_kind text,context_id text,scope_kind text,tenant_id text);
CREATE TABLE app_canvas_video_projects(email text,project_key text,created_at timestamptz DEFAULT now(),deleted_at timestamptz,PRIMARY KEY(email,project_key));
INSERT INTO app_artworks VALUES('art-123456789-123','owner@fixture.invalid','art-123456789-123',NULL,NULL,'2026-11-19T01:21:00.166Z','2026-11-19T01:21:01.480Z','deleted image');
INSERT INTO app_creation_contexts VALUES('owner@fixture.invalid','project','tree:art-123456789-123','personal',NULL);""")
    for table in ['app_canvas_text_nodes','app_canvas_video_nodes','app_canvas_director_nodes','app_canvas_character_nodes','app_canvas_scene_nodes','app_canvas_audio_nodes','app_canvas_timeline_nodes','app_canvas_comfy_nodes']:
        sql('CREATE TABLE '+table+'(email text,project_key text,deleted_at timestamptz);')
    mode('foreign','PLAN',False)
    sql("INSERT INTO app_canvas_video_projects VALUES('owner@fixture.invalid','tree:art-123456789-123',now(),now());")
    mode('tombstone','PLAN',False)
    sql('DELETE FROM app_canvas_video_projects;')
    mode('owned','PLAN');mode('owned','APPLY');mode('owned','VERIFY');mode('owned','APPLY',False)
    sql("INSERT INTO app_artworks VALUES('child','owner@fixture.invalid','art-123456789-123',NULL,NULL,now(),NULL,'new accepted upload');")
    mode('owned','VERIFY');mode('owned','ROLLBACK',False)
    sql("DELETE FROM app_artworks WHERE id='child';")
    mode('owned','ROLLBACK')
    result={'status':'PASS','checks':10,'isolatedPostgres':True,'productionWrites':0,'supplierCalls':0,'cases':['foreign-owner-rejected','project-tombstone-preserved','owned-empty-plan-apply-verify','duplicate-apply-rejected','accepted-upload-retained','rollback-with-new-content-rejected','selective-rollback']}
    (OUT/'RESULT.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
    if created:docker('rm','-f',NAME)
