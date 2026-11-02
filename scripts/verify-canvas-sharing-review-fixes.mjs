import { spawnSync, spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import pg from 'pg';

const root=process.cwd(),phase=process.argv[2]||'MODIFIED',overlay=process.argv[3]?path.resolve(process.argv[3]):null,out=path.join(root,'output/canvas-sharing-review-fixes-20261102',phase);
await mkdir(out,{recursive:true});
const label=`canvas-sharing-independent-${randomUUID()}`;
let container='', exit=1, stdout='', stderr='', ready=false;
const docker=(args)=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(`docker ${args[0]}: ${r.stderr}`);return r.stdout.trim();};
try {
  const client=await readFile(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
  const start=client.indexOf('    const arts = (works ?? []).filter('), end=client.indexOf('    return { projects };',start)+'    return { projects };'.length;
  const fs=client.indexOf('function isSuiteBatch('), fe=client.indexOf('// 占位节点',fs);
  if(start<0||end<start||fs<0||fe<fs)throw Error('CanvasClient extraction boundary changed');
  const body=client.slice(start,end), helpers=client.slice(fs,fe);
  await writeFile(path.join(out,'canvas-projects.actual.ts'),`// Unmodified CanvasClient project useMemo body, extracted for native-record evaluation.\nimport {createProjectRootResolver} from '${root.replaceAll('\\','/')}/src/lib/canvas/project-roots';\nimport {isCanvasImageVersion} from '${root.replaceAll('\\','/')}/src/lib/canvas/image-versions';\nimport {isHostedImageUrl as hasRenderableImage} from '${root.replaceAll('\\','/')}/src/lib/media-url';\n${helpers}\nexport function actualProjects(works:any[],names:any,textNodes:any[]=[],videoNodes:any[]=[],timelineNodes:any[]=[]) {\nconst t=(v:string)=>v,readOnly=false,pinnedNode=null;\nconst videoNodesStore={nodes:videoNodes},directorNodesStore={nodes:[]},characterNodesStore={nodes:[]},sceneNodesStore={nodes:[]},audioNodesStore={nodes:[]},timelineNodesStore={nodes:timelineNodes};\n${body}\n}\n`);
  await writeFile(path.join(out,'CLIENT_EXTRACTION.json'),JSON.stringify({source:'src/components/canvas/canvas-client.tsx',sourceSha256:createHash('sha256').update(client).digest('hex'),bodySha256:createHash('sha256').update(body).digest('hex'),startLine:client.slice(0,start).split('\n').length,endLine:client.slice(0,end).split('\n').length},null,2));
  await build({entryPoints:[path.join(root,'scripts/verify-canvas-sharing-review-fixes.ts')],outfile:path.join(out,'suite.cjs'),bundle:true,packages:'external',platform:'node',format:'cjs',target:'node24',conditions:['react-server'],logLevel:'warning',plugins:[{name:'official-lucide-esm-only-no-domain-stubs',setup(b){b.onResolve({filter:/^\.\/verify-canvas-sharing-review-projects$/},()=>({path:path.join(out,'canvas-projects.actual.ts')})); if(overlay)b.onLoad({filter:/[\\/]canvas-sharing[\\/](snapshot|copy)\.ts$/},async args=>({contents:await readFile(path.join(overlay,'src/lib/canvas-sharing',path.basename(args.path)),'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}));b.onResolve({filter:/^lucide-react$/},()=>({path:path.join(root,'node_modules/lucide-react/dist/esm/lucide-react.js')}));}}]});
  container=docker(['run','-d','--memory=256m','--cpus=1','--label',`naumi.fixture=${label}`,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD=isolated-review','-e','POSTGRES_DB=canvas_sharing_review','postgres:16-alpine','-c','shared_buffers=32MB','-c','max_connections=30']);
  const info=JSON.parse(docker(['inspect',container]))[0];
  if(info.Id!==container||info.Config.Labels['naumi.fixture']!==label||info.HostConfig.Memory!==268435456||info.HostConfig.NanoCpus!==1000000000)throw Error('OWNERSHIP_OR_RESOURCE_MISMATCH');
  const port=info.NetworkSettings.Ports['5432/tcp'][0].HostPort,url=`postgres://postgres:isolated-review@127.0.0.1:${port}/canvas_sharing_review?sslmode=disable`;
  for(let i=0;i<60;i++){const c=new pg.Client({connectionString:url,connectionTimeoutMillis:1000});try{await c.connect();ready=(await c.query('SELECT 1 AS n')).rows[0].n===1;}catch{}finally{await c.end().catch(()=>{});}if(ready)break;await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw Error('SELECT1_NOT_READY');
  console.log(`PG_READY=SELECT1 memory=268435456 nano_cpus=1000000000 port=${port} full_id=${container}`);
  const keep=/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|COMMONPROGRAMFILES|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i;
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>keep.test(k)));
  Object.assign(env,{DATABASE_URL:url,SETTINGS_SECRET:randomUUID()+randomUUID(),STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:path.join(out,'media'),PGPOOL_MAX:'5',NAUMI_DB_POOL_BUDGET:'15',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'shared',NAUMI_MULTI_USER:'1',REVIEW_OUTPUT:out,CANVAS_SHARE_EXPECT_FIXED:phase.startsWith('BASELINE')||phase.startsWith('ROLLBACK')?'0':'1'});
  exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--conditions=react-server',path.join(out,'suite.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',b=>{stdout+=b;process.stdout.write(b);});child.stderr.on('data',b=>{stderr+=b;process.stderr.write(b);});
    const timer=setTimeout(()=>child.kill(),180000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);resolve(code??1);});});
}catch(e){stderr+=`${e.stack||e}\n`;console.error(e);}
finally{
  if(container){try{const info=JSON.parse(docker(['inspect',container]))[0];if(info.Id!==container||info.Config.Labels['naumi.fixture']!==label)throw Error('CLEANUP_OWNERSHIP_MISMATCH');docker(['stop','--timeout','10',container]);docker(['rm','-v',container]);if(docker(['ps','-aq','--filter',`label=naumi.fixture=${label}`]))throw Error('OWNED_PG_REMAINS');stdout+='PG_CLEANUP=PASS stop_full_id=1 rm_v_full_id=1 remaining=0\n';console.log('PG_CLEANUP=PASS stop_full_id=1 rm_v_full_id=1 remaining=0');}catch(e){stderr+=String(e);exit=1;console.error(e);}}
  await writeFile(path.join(out,'RUN_RESULT.json'),JSON.stringify({command:[process.execPath,...process.argv.slice(1)],phase,input:'isolated real PostgreSQL + actual enterprise schema/native login/cookies/routes/storage; no domain/auth fixture replacements',head:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).stdout.trim(),label,container,ready,stdout,stderr,exit},null,2));
}
process.exitCode=exit;
