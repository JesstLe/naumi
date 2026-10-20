// Local-only Office adapter. Production employee auth must be wired separately; never infer it from local-owner.
import {createServer} from 'node:http';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {SourceWorksheetStore} from '../services/enterprise-workflow/src/source-worksheet-store.ts';
import {WorkflowError} from '../services/enterprise-workflow/src/contracts.ts';
const equalRef=(a,b)=>a?.kind===b?.kind&&a?.id===b?.id&&a?.name===b?.name&&(a?.excelRevision||null)===(b?.excelRevision||null);
const digest=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export const signOffice=(payload,secret)=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),p=Buffer.from(JSON.stringify(payload)).toString('base64url');return h+'.'+p+'.'+createHmac('sha256',secret).update(h+'.'+p).digest('base64url');};
export function verifyOffice(token,secret){const [h,p,s,...rest]=String(token||'').split('.');if(rest.length||!h||!p||!same(s,createHmac('sha256',secret).update(h+'.'+p).digest('base64url')))throw new WorkflowError(401,'OFFICE_SIGNATURE_REQUIRED');let header,payload;try{header=JSON.parse(Buffer.from(h,'base64url'));payload=JSON.parse(Buffer.from(p,'base64url'));}catch{throw new WorkflowError(401,'OFFICE_SIGNATURE_REQUIRED');}if(header.alg!=='HS256'||payload.exp&&payload.exp<Date.now()/1000)throw new WorkflowError(401,'OFFICE_SIGNATURE_REQUIRED');return payload;}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function boundedBody(req,limit){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw new WorkflowError(413,'BODY_TOO_LARGE');chunks.push(chunk);}return Buffer.concat(chunks);}
async function boundedDownload(response,limit=64*1024*1024){if(!response.ok)throw new WorkflowError(502,'OFFICE_DOWNLOAD_FAILED');const reader=response.body.getReader(),parts=[];let size=0;for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit){await reader.cancel();throw new WorkflowError(413,'OFFICE_FILE_LIMIT');}parts.push(Buffer.from(r.value));}return Buffer.concat(parts);}
async function materialize(bytes,patches,root){return new Promise((resolve,reject)=>{const worker=new Worker(`const{parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs'),vm=require('node:vm');const XLSX=require(workerData.root+'/design/enterprise-demo/vendor/xlsx-0.20.3.min.js'),JSZip=require(workerData.root+'/node_modules/jszip');let done;const self={postMessage:r=>done(r)};vm.runInNewContext(fs.readFileSync(workerData.root+'/design/enterprise-demo/excel-preview-worker.js','utf8'),{self,XLSX,JSZip,TextDecoder,Uint8Array,ArrayBuffer,structuredClone,console});const call=data=>new Promise((resolve,reject)=>{done=r=>r.ok?resolve(r.data):reject(Error(r.error));self.onmessage({data});});(async()=>{await call({type:'open',id:1,bytes:workerData.bytes});await call({type:'patches',id:2,patches:workerData.patches});parentPort.postMessage((await call({type:'export',id:3})).bytes);})().catch(e=>{throw e;});`,{eval:true,workerData:{root,bytes,patches}}),timer=setTimeout(()=>{void worker.terminate();reject(new WorkflowError(504,'OFFICE_PREPARE_TIMEOUT'));},60000);worker.once('message',data=>{clearTimeout(timer);void worker.terminate();resolve(Buffer.from(data));});worker.once('error',e=>{clearTimeout(timer);reject(e);});});}
export async function createLocalOfficeBridge({pool,enterpriseId,blobRoot,stateDir,root=resolve('.'),port=18548,documentOrigin='http://127.0.0.1:18549',engineSecret,allowedOrigins=['http://127.0.0.1:18482'],callbackOrigin=`http://host.docker.internal:${port}`}){
 if(engineSecret?.length<32||!engineSecret)throw Error('OFFICE_SECRET_REQUIRED');
 const doc=new URL(documentOrigin);if(doc.hostname!=='127.0.0.1'||doc.protocol!=='http:')throw Error('LOCAL_DOCUMENT_SERVER_REQUIRED');
 const p={enterpriseId,subject:'local-owner'},cookie=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),sessions=new Map(),origins=new Set([...allowedOrigins,`http://127.0.0.1:${port}`]),stats={opens:0,saves:0,conflicts:0,invalidCallbacks:0};
 const store=new SourceWorksheetStore(pool,async(_tx,actor)=>{if(actor.enterpriseId!==p.enterpriseId||actor.subject!==p.subject)throw new WorkflowError(403,'FORBIDDEN');});
 await mkdir(stateDir,{recursive:true,mode:0o700});
 for(const name of await readdir(stateDir)){if(!/^[a-f0-9]{48}\.json$/.test(name))continue;try{const s=JSON.parse(await readFile(join(stateDir,name),'utf8'));if(s.expires>Date.now()&&s.enterpriseId===enterpriseId)sessions.set(s.ticket,s);}catch{}}
 const persist=async s=>{const {pending,...data}=s;await writeFile(join(stateDir,s.ticket+'.json'),JSON.stringify(data),{mode:0o600});};
 const session=ticket=>{const s=sessions.get(ticket);if(!s||s.expires<Date.now())throw new WorkflowError(404,'OFFICE_SESSION_EXPIRED');return s;};
 const originAllowed=req=>!req.headers.origin||origins.has(req.headers.origin);
 const browser=req=>{if(!originAllowed(req))throw new WorkflowError(403,'ORIGIN_DENIED');const c=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('enterprise_office_session='))?.slice(26);if(!same(c,cookie))throw new WorkflowError(401,'LOCAL_OFFICE_SESSION_REQUIRED');};
 const writeAuth=req=>{browser(req);if(!origins.has(req.headers.origin)||!same(req.headers['x-office-csrf'],csrf))throw new WorkflowError(403,'CSRF_REQUIRED');};
 const original=async(source,ref)=>{if(ref.kind==='worksheet')return (await store.file(p,source,ref.id)).content;const r=(await pool.query('SELECT document FROM enterprise_workflow.import_assets WHERE enterprise_id=$1 AND source_hash=$2 AND asset_id=$3',[enterpriseId,source,ref.id])).rows[0]?.document;if(!r||r.name!==ref.name||!/^[a-f0-9]{64}$/.test(r.sha256))throw new WorkflowError(404,'ASSET_NOT_FOUND');const file=join(blobRoot,r.sha256);if((await stat(file)).size>64*1024*1024)throw new WorkflowError(413,'OFFICE_FILE_LIMIT');const bytes=await readFile(file);if(digest(bytes)!==r.sha256)throw new WorkflowError(503,'FILE_HASH_MISMATCH');return bytes;};
 const health=async()=>{try{return (await fetch(documentOrigin+'/healthcheck',{signal:AbortSignal.timeout(3000)})).ok;}catch{return false;}};
 async function callback(s,body){
  if(body.key!==s.key)throw new WorkflowError(400,'OFFICE_KEY_MISMATCH');
  if(![2,6].includes(body.status)){if([3,7].includes(body.status)){s.error='OFFICE_SAVE_FAILED';await persist(s);}return;}
  if(body.filetype&&body.filetype!=='xlsx')throw new WorkflowError(400,'OFFICE_FORMAT_MISMATCH');
  const u=new URL(body.url);if(![doc.origin,new URL(documentOrigin.replace('127.0.0.1','host.docker.internal')).origin].includes(u.origin)||!u.pathname.startsWith('/cache/files/')||u.username||u.password)throw new WorkflowError(400,'OFFICE_URL_DENIED');
  u.hostname=doc.hostname;u.port=doc.port;const bytes=await boundedDownload(await fetch(u,{redirect:'error',signal:AbortSignal.timeout(60000)}));
  const hash=digest(bytes);if(s.lastHash===hash){s.error='';if(body.userdata){s.savedMarker=body.userdata;s.savedCount=(s.savedCount||0)+1;await persist(s);}return;}
  await writeFile(join(stateDir,s.ticket+'.recovery.xlsx'),bytes,{mode:0o600});
  const command=digest(s.key+hash),commandId=[command.slice(0,8),command.slice(8,12),'4'+command.slice(13,16),'8'+command.slice(17,20),command.slice(20,32)].join('-');
  try{const result=await store.officeSave(p,s.source,{commandId,expectedVersion:s.version,row:s.row,column:s.column,refs:s.refs,ref:s.ref,name:s.name},bytes);s.refs=s.refs.map(r=>equalRef(r,s.ref)?result.ref:r);s.ref=result.ref;s.version=result.version;s.lastHash=hash;s.savedAt=new Date().toISOString();s.savedCount=(s.savedCount||0)+1;s.savedMarker=body.userdata||null;s.error='';stats.saves++;await persist(s);}catch(e){s.error=e.code||'OFFICE_SAVE_FAILED';if(e.code==='VERSION_CONFLICT')stats.conflicts++;await persist(s);throw e;}
 }
 const server=createServer(async(req,res)=>{let callbackRequest=false;const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};try{
  if(req.headers.origin&&origins.has(req.headers.origin)){res.setHeader('access-control-allow-origin',req.headers.origin);res.setHeader('access-control-allow-credentials','true');res.setHeader('vary','Origin');}
  const u=new URL(req.url||'/',`http://127.0.0.1:${port}`),match=/^\/office\/(file|callback|editor|status|recovery|close)\/([a-f0-9]{48})$/.exec(u.pathname);
  if(req.method==='OPTIONS'){if(!originAllowed(req))throw new WorkflowError(403,'ORIGIN_DENIED');res.writeHead(204,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-office-csrf'});res.end();return;}
  if(u.pathname==='/office/session'&&req.method==='GET'){if(!originAllowed(req))throw new WorkflowError(403,'ORIGIN_DENIED');res.setHeader('set-cookie',`enterprise_office_session=${cookie}; HttpOnly; SameSite=Strict; Path=/office`);return json(200,{csrf,available:await health(),engine:'ONLYOFFICE'});}
  if(u.pathname==='/office/open'&&req.method==='POST'){
   writeAuth(req);const q=JSON.parse((await boundedBody(req,16384)).toString('utf8'));
   if(!/^[a-f0-9]{64}$/.test(q.source)||typeof q.row!=='string'||typeof q.column!=='string'||!q.ref||!/\.(xlsx|xls)$/i.test(q.ref.name))throw new WorkflowError(400,'OFFICE_INPUT_INVALID');
   const current=await store.read(p,q.source),row=current.document.rows.find(r=>r.id===q.row&&!r.archived),column=current.document.columns.find(c=>c.id===q.column&&!c.archived&&c.type==='files'),refs=row?.cells[q.column];
   if(!column||!Array.isArray(refs)||refs.filter(r=>equalRef(r,q.ref)).length!==1)throw new WorkflowError(409,'ATTACHMENT_CHANGED');
   if([...sessions.values()].filter(s=>!s.closed&&s.expires>Date.now()).length>=8)throw new WorkflowError(429,'OFFICE_SESSION_LIMIT');
   let bytes=await original(q.source,q.ref);if(q.ref.excelRevision){const revision=JSON.parse((await store.file(p,q.source,q.ref.excelRevision)).content.toString('utf8'));if(revision.base.id!==q.ref.id||revision.base.kind!==q.ref.kind||revision.base.name!==q.ref.name)throw new WorkflowError(400,'EXCEL_REVISION_BASE_MISMATCH');bytes=await materialize(bytes,revision.patches,root);}
   const ticket=randomBytes(24).toString('hex'),s={ticket,key:'naumi-'+randomUUID(),enterpriseId,source:q.source,row:q.row,column:q.column,refs,ref:q.ref,version:current.version,name:q.ref.name.replace(/\.(xls|xlsx)$/i,'.xlsx'),originalType:q.ref.name.split('.').at(-1).toLowerCase(),expires:Date.now()+6*3600000,createdAt:new Date().toISOString(),savedCount:0,error:'',parentOrigin:req.headers.origin};
   if(q.ref.excelRevision)s.originalType='xlsx';await writeFile(join(stateDir,ticket+'.source'),bytes,{mode:0o600});sessions.set(ticket,s);await persist(s);stats.opens++;return json(200,{editorUrl:`http://127.0.0.1:${port}/office/editor/${ticket}`,ticket});
  }
  if(!match)throw new WorkflowError(404,'NOT_FOUND');const [,action,ticket]=match,s=session(ticket);
  if(action==='callback'&&req.method==='POST'){
   callbackRequest=true;let body=JSON.parse((await boundedBody(req,262144)).toString('utf8'));const token=body.token||String(req.headers.authorization||'').replace(/^Bearer /,'');const signed=verifyOffice(token,engineSecret);const clean={...body};delete clean.token;
   const payload=signed.payload||signed;for(const k of ['key','status','url','filetype'])if(clean[k]!==undefined&&payload[k]!==clean[k])throw new WorkflowError(401,'OFFICE_CALLBACK_MISMATCH');body={...clean,...payload};
   const previous=s.pending||Promise.resolve();s.pending=previous.catch(()=>{}).then(()=>callback(s,body));await s.pending;return json(200,{error:0});
  }
  if(action==='file'&&req.method==='GET'){await store.read(p,s.source);const bytes=await readFile(join(stateDir,ticket+'.source'));res.writeHead(200,{'content-type':'application/octet-stream','content-length':bytes.length,'cache-control':'no-store'});res.end(bytes);return;}
  browser(req);
  if(action==='status'&&req.method==='GET'){await store.read(p,s.source);return json(200,{savedAt:s.savedAt||null,savedCount:s.savedCount,error:s.error,version:s.version,ref:s.ref,savedMarker:s.savedMarker||null,nativeSaveRequests:s.nativeSaveRequests||0});}
  if(action==='recovery'&&req.method==='GET'){await store.read(p,s.source);const bytes=await readFile(join(stateDir,ticket+'.recovery.xlsx'));res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(s.name)}`,'cache-control':'no-store'});res.end(bytes);return;}
  if(action==='close'&&req.method==='POST'){writeAuth(req);s.closed=true;await persist(s);return json(200,{closed:true});}
  if(action==='editor'&&req.method==='GET'){
   await store.read(p,s.source);const config={documentType:'cell',type:'desktop',width:'100%',height:'100%',document:{fileType:s.originalType,key:s.key,title:s.name,url:callbackOrigin+'/office/file/'+ticket,permissions:{edit:true,download:true,print:true,review:false}},editorConfig:{mode:'edit',lang:'zh-CN',callbackUrl:callbackOrigin+'/office/callback/'+ticket,user:{id:'local-owner',name:'本机工作副本'},customization:{autosave:true,forcesave:true,compactHeader:true,compactToolbar:false,uiTheme:'theme-light',plugins:false,macros:false,anonymous:{request:false},close:{visible:true}}}};
   const settings={config:{...config,token:signOffice({...config,exp:Math.floor(s.expires/1000)},engineSecret)},origin:documentOrigin,ticket,parentOrigin:s.parentOrigin,csrf};
   const script=JSON.stringify(settings).replaceAll('<','\\u003c');
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':`frame-ancestors ${[...origins].join(' ')}`});res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(s.name)}</title><style>*{box-sizing:border-box}html,body{margin:0;height:100%;font:13px system-ui;color:#26334c;background:white}body{display:flex;flex-direction:column}header{height:42px;display:flex;align-items:center;gap:12px;padding:5px 14px;border-bottom:1px solid #e1e6ee}#status{margin-left:auto;color:#687b96}button,a{font:inherit;background:white;border:1px solid #dce3ed;border-radius:5px;padding:5px 12px;color:#315a95;text-decoration:none;cursor:pointer}#editor{flex:1;min-height:0}</style><header><b>${escape(s.name)}</b><span id="status">正在打开…</span><a id="recovery" hidden href="/office/recovery/${ticket}">下载当前副本</a></header><div id="editor"></div><script>const S=${script};${await readFile(new URL('./enterprise-office-client.js',import.meta.url),'utf8')}</script></html>`);return;
  }
  throw new WorkflowError(405,'METHOD_NOT_ALLOWED');
 }catch(e){if(callbackRequest){stats.invalidCallbacks++;return json(200,{error:1});}json(e instanceof WorkflowError?e.status:400,{error:e instanceof WorkflowError?e.code:'OFFICE_REQUEST_FAILED'});}});
 return {server,store,stats,sessions};
}
