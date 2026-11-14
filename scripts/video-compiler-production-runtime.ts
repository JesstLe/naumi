import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {execFileSync,type SpawnOptions} from 'node:child_process';

/** Test-driver runtime adapter only. Production code is loaded from an existing
 * immutable runner image, not rebuilt from or replaced by the fixture bundle. */
export function videoProductionRuntime(){
 if(!process.argv.includes('--production-package'))return null;
 assert.equal(process.platform,'linux','Production-package verification requires Linux');
 const root=process.env.VIDEO_PROCESS_PACKAGE_ROOT||'/app';assert(path.isAbsolute(root));
 assert.equal(path.resolve(process.cwd()),path.resolve(root),'Run the driver in the packaged application directory');
 const commit=process.env.SOURCE_COMMIT||'';assert.match(commit,/^[a-f0-9]{40}$/);
 const buildId=readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim();assert(buildId);
 assert(readFileSync(path.join(root,'server.js'),'utf8').includes('next'));
 const manifest=JSON.parse(readFileSync(path.join(root,'dist/worker/manifest.json'),'utf8'));
 assert.equal(createHash('sha256').update(readFileSync(path.join(root,'dist/worker',manifest.entry))).digest('hex'),manifest.sha256);
 assert.equal(manifest.node,'24');assert.equal(Object.keys(manifest.source).filter(file=>file.startsWith('src/app/')).length,0);
 assert.equal(process.getuid?.(),0,'The native media sandbox needs its existing root launcher');
 for(const flag of ['--browser','--canvas-browser','--input-equivalence'])assert(!process.argv.includes(flag),'Browser verification uses its own runtime; no implicit browser substitution');
 const browserPort=process.env.VIDEO_PROCESS_BROWSER_PORT?Number(process.env.VIDEO_PROCESS_BROWSER_PORT):undefined;
 if(browserPort!==undefined){
  assert(Number.isInteger(browserPort)&&browserPort>=1024&&browserPort<=65535,'Invalid isolated browser port');
  assert(process.argv.includes('--storyboard-session'),'External browser port requires the owned session bridge');
 }
 return {root,commit,buildId,workerSha256:manifest.sha256,browserPort};
}
export type VideoProductionRuntime=ReturnType<typeof videoProductionRuntime>;

export function fixtureVideoFfmpeg(args:string[],runtime:VideoProductionRuntime){
 const binary=runtime?'/opt/naumi-media-runtime/usr/bin/ffmpeg':'ffmpeg';
 const libraries=runtime?readdirSync('/opt/naumi-media-runtime',{recursive:true,withFileTypes:true}).filter(row=>row.isDirectory()&&/\/lib(?:\/|$)/.test(row.parentPath+'/'+row.name)).map(row=>row.parentPath+'/'+row.name).join(':'):'';
 return execFileSync(binary,args,{windowsHide:true,...(runtime?{env:{...process.env,LD_LIBRARY_PATH:libraries}}:{})});
}

/** The fixture driver/media launcher run as root; Web and the application
 * scanner run under the runner image's existing non-root nextjs identity. */
export function videoProductionChildOptions(name:string,runtime:VideoProductionRuntime):SpawnOptions{
 return runtime&&name!=='media'?{uid:1001,gid:1001}:{};
}

export function videoProductionMediaEnvironment(env:NodeJS.ProcessEnv,runtime:VideoProductionRuntime):NodeJS.ProcessEnv{
 if(!runtime)return env;
 return {NODE_ENV:env.NODE_ENV,...Object.fromEntries(['PATH','NODE_ENV','MEDIA_JOB_DIR','MEDIA_WORKER_SECRET','MEDIA_WORKER_HOST','MEDIA_WORKER_PORT','SOURCE_COMMIT'].filter(key=>env[key]!==undefined).map(key=>[key,env[key]]))};
}

export function observeVideoProductionProcesses(processes:Array<{name:string;pid:number|undefined;env:NodeJS.ProcessEnv}>){
 return processes.map(({name,pid,env})=>{
  assert(pid);const proc='/proc/'+pid;
  const status=readFileSync(proc+'/status','utf8'),uid=Number(status.match(/^Uid:\s+(\d+)/m)?.[1]);
  const row={name,pid,uid,uidSource:'proc-status',environmentSource:'spawn-arguments',nodeEnv:env.NODE_ENV,sourceCommit:env.SOURCE_COMMIT,hasDatabaseUrl:!!env.DATABASE_URL,hasSettingsSecret:!!env.SETTINGS_SECRET,fixtureMedia:!!env.MEDIA_WORKER_FIXTURE_OWNER};
  assert.equal(row.nodeEnv,'production');assert.equal(row.uid,name==='media'?0:1001);assert.equal(row.fixtureMedia,false);
  assert.equal(row.hasDatabaseUrl,name!=='media');assert.equal(row.hasSettingsSecret,name!=='media');
  return row;
 });
}
