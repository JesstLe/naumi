import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {spawn,execFileSync} from 'node:child_process';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true}).trimEnd();
const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
export async function sourceIdentity(root){
 const commit=git(root,'rev-parse','HEAD'),dirty=git(root,'status','--porcelain','--untracked-files=normal')!=='';
 const files=git(root,'ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean).sort(),rows=[];
 // Ordered, complete byte hashing at every boundary; only eight bounded reads
 // overlap. No hash cache, mtime shortcut or skipped/finally-unchecked input.
 for(let start=0;start<files.length;start+=8){
  rows.push(...await Promise.all(files.slice(start,start+8).map(async file=>{
   const p=path.resolve(root,file);if(!inside(root,p))throw Error('SOURCE_PATH_ESCAPE');const stat=await fs.lstat(p).catch(()=>null);
   if(!stat)return [file,null];if(stat.isSymbolicLink())throw Error('SOURCE_SYMLINK: '+file);if(!stat.isFile())throw Error('SOURCE_NOT_FILE: '+file);
   return [file,hash(await fs.readFile(p))];
  })));
 }
 return {commit,dirty,files:rows.length,digest:hash(JSON.stringify(rows)),hashes:Object.fromEntries(rows)};
}
export function assertFixtureDatabase(env){let u;try{u=new URL(env.DATABASE_URL)}catch{throw Error('ISOLATED_FIXTURE_DATABASE_REQUIRED')};if(env.NAUMI_VERIFY_ISOLATED_DB!=='1'||u.hostname!=='127.0.0.1'||!u.pathname.includes('fixture'))throw Error('ISOLATED_FIXTURE_DATABASE_REQUIRED');}
/** Sequential child entrypoints with literal logs + exact source binding.
 * No retries, deployment, migrations, supplier credentials or package installation. */
export async function runRefactorVerification({root,out,cases,commandFor,expectedSha,allowDirty=false,env=process.env,scope='core',resume}){
 root=await fs.realpath(path.resolve(root));out=path.resolve(out);if(!inside(path.join(root,'output'),out))throw Error('EVIDENCE_MUST_BE_INSIDE_OUTPUT');
 await fs.mkdir(out,{recursive:false});const file=path.join(out,'REPORT.json'),report={schemaVersion:1,status:'RUNNING',scope,source:null,startedAt:new Date().toISOString(),cases:cases.map(c=>({id:c.id,group:c.group,status:'NOT_RUN',command:commandFor(c)}))};
 const write=()=>fs.writeFile(file,JSON.stringify(report,null,2)+'\n');await write();
 try{
  if(!/^[0-9a-f]{40}$/.test(expectedSha||''))throw Error('EXPECTED_SOURCE_SHA_REQUIRED');
  const identity=await sourceIdentity(root);report.source=identity;const database=env.DATABASE_URL?new URL(env.DATABASE_URL):null;report.environment={node:process.version,platform:process.platform,arch:process.arch,fixtureDatabase:database?{host:database.hostname,port:database.port,database:database.pathname}:null,fixtureFlag:env.NAUMI_VERIFY_ISOLATED_DB||null};await write();if(identity.commit!==expectedSha)throw Error('SOURCE_SHA_MISMATCH');if(identity.dirty&&!allowDirty)throw Error('DIRTY_SOURCE_NOT_ACCEPTED');
  if(cases.some(c=>c.pg))assertFixtureDatabase(env);
  if(new Set(cases.map(c=>c.id)).size!==cases.length||!cases.length)throw Error('INVALID_CASE_CATALOGUE');
  let previous;if(resume){previous=JSON.parse(await fs.readFile(resume,'utf8'));if(previous.source?.commit!==identity.commit||previous.source?.digest!==identity.digest||previous.scope!==scope||JSON.stringify(previous.environment)!==JSON.stringify(report.environment))throw Error('RESUME_SOURCE_MISMATCH');}
  for(const row of report.cases){const boundary=await sourceIdentity(root);if(boundary.digest!==identity.digest||boundary.commit!==identity.commit)throw Error('SOURCE_CHANGED_DURING_VERIFICATION');const spec=cases.find(c=>c.id===row.id),p=path.resolve(root,spec.file);if(!inside(root,p)||!(await fs.stat(p).catch(()=>null))?.isFile())throw Error('CASE_ENTRY_MISSING: '+spec.file);
   const reused=previous?.cases.find(c=>c.id===row.id&&c.status==='PASS');if(reused&&JSON.stringify(reused.command)===JSON.stringify(row.command)&&hash(await fs.readFile(reused.log))===reused.logSha256){Object.assign(row,reused,{reused:true});await write();continue;}
   row.status='RUNNING';row.startedAt=new Date().toISOString();row.log=path.join(out,row.id+'.log');await write();await fs.writeFile(row.log,'COMMAND='+JSON.stringify(row.command)+'\nSOURCE_COMMIT='+identity.commit+'\nSOURCE_DIGEST='+identity.digest+'\n');
   const evidence=path.join(out,row.id);await fs.mkdir(evidence);const stageEnv={...env,NODE_OPTIONS:[env.NODE_OPTIONS||'','--conditions=react-server'].join(' ').trim()};for(const name of ['CANVAS_SAVE_REVIEW_EVIDENCE','CANVAS_SAVE_TRANSPORT_EVIDENCE','DEPENDENCY_COMPAT_EVIDENCE','MODEL_UI_RUNNER_EVIDENCE','SUPPLIER_LIBRARY_EVIDENCE','MODEL_MANAGEMENT_EVIDENCE','ADMIN_SETTINGS_EVIDENCE','ADMIN_USAGE_EVIDENCE','WORKBENCH_ASSET_EVIDENCE','DB_EVIDENCE','IDENTITY_CREATION_EVIDENCE','APP_PERSISTENCE_EVIDENCE','TEXT_CONCURRENCY_EVIDENCE','ARTWORK_CONCURRENCY_EVIDENCE','ARTWORK_WRITER_EVIDENCE','HISTORY_EVIDENCE','VIDEO_OPTIONS_EVIDENCE','WORKBENCH_EVIDENCE','MODEL_CATALOG_EVIDENCE','PROJECT_CATALOG_EVIDENCE','CANVAS_INPUT_EVIDENCE','CANVAS_CLIPBOARD_EVIDENCE','CANVAS_IMAGE_STABILITY_EVIDENCE','IMAGE_DELIVERY_BYTES_EVIDENCE','CANVAS_PLACEMENT_EVIDENCE','VIDEO_PERFORMANCE_EVIDENCE'])stageEnv[name]=evidence;
   for(const name of ['PENDING_PRESENTATION_EVIDENCE','GENERATION_PRESENTATION_EVIDENCE','CANVAS_REQUEST_WORKFLOW_EVIDENCE','COMFY_RUN_EVIDENCE','R3_EVIDENCE','CANVAS_CREATION_EVIDENCE','SOURCE_IDENTITY_EVIDENCE','WORKER_MEDIA_EVIDENCE','DIRECTOR_UI_EVIDENCE','DIRECTOR_APP_EVIDENCE','ADMIN_ENTRY_EVIDENCE','ADMIN_SHELL_EVIDENCE','CHARACTER_UI_EVIDENCE','CHARACTER_APP_EVIDENCE','SCENE_UI_EVIDENCE','SCENE_APP_EVIDENCE','DATAURL_EVIDENCE','CANVAS_REGEN_EVIDENCE','IMAGE_VERSION_EVIDENCE','AUDIO_APP_EVIDENCE','AUDIO_UI_EVIDENCE','AUDIO_RULES_EVIDENCE','TIMELINE_EVIDENCE','CANVAS_TEST_OUT'])stageEnv[name]=evidence;
   if(spec.id==='audio-ui')stageEnv.AUDIO_SOURCE_WAV=path.join(out,'audio-rules','original.wav');
   if(spec.id==='timeline-ui')stageEnv.TIMELINE_SOURCE_ASSETS=path.join(out,'timeline-rules');
   stageEnv.TIMELINE_APP_EVIDENCE=evidence;
   if(spec.id==='native-documents')stageEnv.NATIVE_DOCUMENT_EVIDENCE=evidence;
   if(spec.id==='native-documents-pg')stageEnv.NATIVE_DOCUMENT_PG_EVIDENCE=evidence;
   if(spec.id==='dataurl-delivery')stageEnv.DATAURL_PNG=path.join(out,'dataurl-decoder','fixture-1536x2048.png');
   let literal='';const child=spawn(row.command[0],row.command.slice(1),{cwd:root,env:stageEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});row.pid=child.pid;const log=chunk=>{literal+=chunk.toString('utf8');process.stdout.write(chunk);};child.stdout.on('data',log);child.stderr.on('data',log);const result=await completion;await write();
   await fs.appendFile(row.log,literal+'\nEXIT='+result.code+' SIGNAL='+result.signal+'\n');row.exit=result.code;row.signal=result.signal;row.finishedAt=new Date().toISOString();row.logSha256=hash(await fs.readFile(row.log));row.marker=spec.expect?literal.includes(spec.expect):true;row.status=result.code===0&&row.marker?'PASS':'FAIL';await write();const afterCase=await sourceIdentity(root);if(afterCase.digest!==identity.digest||afterCase.commit!==identity.commit)throw Error('SOURCE_CHANGED_DURING_VERIFICATION');if(row.status==='FAIL')break;
  }
  const after=await sourceIdentity(root);report.after={commit:after.commit,digest:after.digest,dirty:after.dirty};if(after.commit!==identity.commit||after.digest!==identity.digest)throw Error('SOURCE_CHANGED_DURING_VERIFICATION');
  report.status=report.cases.every(c=>c.status==='PASS')?(scope==='core'&&!identity.dirty?'PASS':'PARTIAL'):'FAIL';report.completeCore=report.status==='PASS';
 }catch(error){for(const row of report.cases)if(row.status==='RUNNING'){row.status='FAIL';row.error=error instanceof Error?error.message:String(error);}report.status='FAIL';report.error=error instanceof Error?error.message:String(error);report.completeCore=false;}
 report.finishedAt=new Date().toISOString();report.passed=report.cases.filter(c=>c.status==='PASS').length;report.failed=report.cases.filter(c=>c.status==='FAIL').length;report.notRun=report.cases.filter(c=>c.status==='NOT_RUN').length;await write();return report;
}
