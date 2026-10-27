/** Setup/observation for the packaged product browser suite. Not an HTTP
 * bridge: browser requests hit the original image's Web directly. */
import {setup} from './refactor-runtime-fixture';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {getPool} from '../../src/platform/db/pool';
import {uploadImage} from '../../src/lib/media-upload';
import {addArtworks} from '../../src/lib/artworks/writer';
import {upsertCanvasTextNode,listCanvasTextNodes} from '../../src/lib/canvas/text-node-repository';
import {setProjectName} from '../../src/lib/canvas/project-repository';
const sql=getPool(),arg=(key:string)=>{const i=process.argv.indexOf(key);return i<0?undefined:process.argv[i+1]};
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL!).hostname!=='db'||!/^r6b_[a-f0-9]+$/.test((process.env.PGOPTIONS||'').split('search_path=')[1]))throw Error('ISOLATED_RUNTIME_FIXTURE_REQUIRED');
 try{
  if(process.argv.includes('--setup')){
   await setup();const input=JSON.parse(await readFile('/evidence/SETUP.json','utf8')),bytes=await sharp({create:{width:1024,height:1024,channels:3,background:'#cfdef0'}}).png().toBuffer(),url=await uploadImage(bytes,'image/png','r6c/reference.png',undefined,input.owner);
   const ids=['r6c-root','r6c-second'];await addArtworks(input.owner,ids.map((id,i)=>({id,title:i?'R6C second image':'R6C reference image',category:'main',prompt:'R6C fixture image',status:'completed',image:url,gradient:'',groupId:'r6c',origin:'canvas',width:1024,height:1024})));
   for(const [i,id] of ids.entries())await sql.query('UPDATE app_artworks SET canvas_x=$2,canvas_y=0,canvas_width=300,canvas_height=300 WHERE id=$1',[id,i*380]);
   await setProjectName(input.owner,'tree:r6c','R6C full-image canvas');
   await upsertCanvasTextNode(input.owner,{id:'r6c-text',projectKey:'tree:r6c',title:'R6C text',prompt:'',content:'R6C original text',status:'completed',canvasX:0,canvasY:380,width:300,height:176,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceIds:[],targetIds:[],productIds:[]});
   console.log('REFACTOR_BROWSER_SETUP=PASS NATIVE_PROJECT=1 ARTWORKS=2 TEXT=1 HTTP_BRIDGE=0');return;
  }
  const input=JSON.parse(await readFile('/evidence/SETUP.json','utf8')),action=arg('--action');
  if(action==='snapshot'){
   const artworks=(await sql.query('SELECT id,title,parent_id,parent_ids,prompt,ratio,resolution,canvas_x,canvas_y,canvas_width,canvas_height,marked,deleted_at FROM app_artworks WHERE email=$1 ORDER BY id',[input.owner])).rows;
   const texts=await listCanvasTextNodes(input.owner);
   const ledger=(await sql.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE email=$1 AND kind='consume'",[input.owner])).rows[0];
   const jobs=(await sql.query('SELECT id,kind,snapshot,payload->\'plan\'->\'request\'->>\'operationId\' AS operation_id FROM app_image_jobs WHERE email=$1',[input.owner])).rows;
   console.log(JSON.stringify({artworks,texts,ledger,jobs}));return;
  }
  if(action==='resume'||action==='drain'){
   const headers={'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET!};const sr=await fetch('http://127.0.0.1:3001/status',{headers});if(!sr.ok)throw Error('CONTROL_UNAVAILABLE');const state=await sr.json();
   const response=await fetch('http://127.0.0.1:3001/control',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({action,bootId:state.bootId,expectedRevision:state.revision,operationId:randomUUID()})});const body=await response.json();if(!response.ok)throw Error(JSON.stringify(body));console.log(JSON.stringify(body));return;
  }
  if(action==='release'||action==='hold'||action==='stats'){
   const response=await fetch('http://provider:3300/fixture/'+action,{method:action==='stats'?'GET':'POST'});if(!response.ok)throw Error('FIXTURE_CONTROL_FAILED');console.log(JSON.stringify(await response.json()));return;
  }
  if(action==='status'){
   const r=await fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET!}});if(!r.ok)throw Error('WORKER_NOT_READY');console.log(JSON.stringify(await r.json()));return;
  }
  throw Error('UNKNOWN_BROWSER_HELPER_ACTION');
 }finally{await sql.end();}
}
main().catch(async e=>{await writeFile('/evidence/BROWSER_HELPER_FAILURE.json',JSON.stringify({error:String(e),stack:e.stack},null,2)+'\n').catch(()=>{});console.error(e);process.exitCode=1;});
