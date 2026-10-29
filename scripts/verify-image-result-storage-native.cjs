// Launch native tests with an explicit local-only environment, no .env loader.
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/capacity-x5-20261029'),env={};
for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{DATABASE_URL:'postgresql://x5_fixture:x5_fixture_only@127.0.0.1:55435/naumi_x5_native',NAUMI_VERIFY_ISOLATED_DB:'1',NAUMI_MULTI_USER:'1',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:path.join(out,'native-media'),SETTINGS_SECRET:'x5-fixture-settings-only-not-production',MODEL_CONFIG_ENVELOPE_SECRET:'x5-fixture-model-key-only-not-production',VIDEO_WORKER_SECRET:'x5-fixture-worker-token-only-not-production',TEMP:path.join(out,'native-temp'),TMP:path.join(out,'native-temp'),NODE_ENV:'test'});
fs.mkdirSync(env.TEMP,{recursive:true});
const target=process.argv[2]||'scripts/verify-image-result-storage-native.ts';
if(!['scripts/verify-image-result-storage-native.ts','scripts/verify-image-concurrency-convergence.ts','scripts/verify-image-terminal-failure.ts','scripts/verify-billing-rules.ts'].includes(target))throw Error('Unexpected test target');
const result=spawnSync(process.execPath,['--conditions=react-server','--import=tsx',target],{cwd:root,env,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error);console.log('NATIVE_EXIT_STATUS='+result.status);process.exitCode=result.status===0?0:1;
