// Launch native tests with an explicit local-only environment, no .env loader.
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises'),{Client}=require('pg');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/capacity-x5-20261029'),env={};
for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];
const fixture='naumi-x5-native-'+randomUUID(),owner='native-image-result-fixture';
const docker=args=>{const p=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});if(p.status!==0)throw Error(p.stderr||p.stdout);return p.stdout.trim();};
async function waitForPublishedDatabase(connectionString){
  const deadline=Date.now()+15_000;
  do{
    const client=new Client({connectionString,connectionTimeoutMillis:300,query_timeout:300});
    try{await client.connect();await client.query('SELECT 1');return;}
    catch{/* The temporary init server may accept local sockets before the final TCP server. */}
    finally{await client.end().catch(()=>{});}
    await delay(100);
  }while(Date.now()<deadline);
  throw Error('OWN_FIXTURE_TCP_NOT_READY');
}
async function main(){
let container;
try{
container=docker(['run','-d','--rm','--name',fixture,'--label','naumi.task='+owner,'--memory','384m','--tmpfs','/var/lib/postgresql/data','-p','127.0.0.1::5432','-e','POSTGRES_USER=x5_fixture','-e','POSTGRES_PASSWORD=x5_fixture_only','-e','POSTGRES_DB=naumi_x5_native','postgres:16-alpine']);
const port=docker(['port',container,'5432/tcp']).split(':').at(-1);
if(!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw Error('OWN_FIXTURE_TCP_PORT_INVALID');
Object.assign(env,{DATABASE_URL:`postgresql://x5_fixture:x5_fixture_only@127.0.0.1:${port}/naumi_x5_native`,NAUMI_VERIFY_ISOLATED_DB:'1',NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:path.join(out,fixture,'native-media'),SETTINGS_SECRET:'x5-fixture-settings-only-not-production',MODEL_CONFIG_ENVELOPE_SECRET:'x5-fixture-model-key-only-not-production',VIDEO_WORKER_SECRET:'x5-fixture-worker-token-only-not-production',TEMP:path.join(out,fixture,'native-temp'),TMP:path.join(out,fixture,'native-temp'),NODE_ENV:'test'});
await waitForPublishedDatabase(env.DATABASE_URL);
console.log('NATIVE_PG_TCP_READY=PASS');
fs.mkdirSync(env.TEMP,{recursive:true});
const target=process.argv[2]||'scripts/verify-image-result-storage-native.ts';
if(!['scripts/verify-image-result-storage-native.ts','scripts/verify-image-concurrency-convergence.ts','scripts/verify-image-terminal-failure.ts','scripts/verify-billing-rules.ts'].includes(target))throw Error('Unexpected test target');
const result=spawnSync(process.execPath,['--conditions=react-server','--import=tsx',target],{cwd:root,env,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error);console.log('NATIVE_EXIT_STATUS='+result.status);process.exitCode=result.status===0?0:1;

}finally{if(container){if(docker(['inspect','--format','{{index .Config.Labels "naumi.task"}}',container])!==owner)throw Error('FIXTURE_OWNER_CHANGED');docker(['rm','-f',container]);console.log('NATIVE_PG_CLEANUP=PASS OWN_CONTAINER_REMOVED=1');}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
