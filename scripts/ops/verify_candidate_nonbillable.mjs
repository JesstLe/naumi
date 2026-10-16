// Finite nonbillable candidate acceptance. Injected CONFIG only by Python wrapper.
import {createHash,randomUUID} from 'node:crypto';
const cfg=__PRIVATE_CONFIG__;
const hash=x=>createHash('sha256').update(x).digest('hex');
const result={schemaVersion:1,kind:'candidate-nonbillable-api-acceptance',runId:cfg.runId,result:'RUNNING',checks:0,created:{},requests:[],isolation:'anonymous-no-credentials-not-cross-account',browserUiTested:false,modelEndpointsInvoked:false};
const ensure=(ok,code)=>{if(!ok)throw Error(code);result.checks++};
const base='http://127.0.0.1:3000';
const permitted=(method,path)=>{
 const u=new URL(path,base);ensure(u.origin===base&&!u.hash&&!u.username&&!u.password,'LOCAL_RELATIVE_URL_ONLY');
 const fixed={'GET':['/api/version','/api/auth/session','/api/image-skills','/api/packaging-strategy','/api/canvas/text-nodes'],'POST':['/api/image-skills/import','/api/packaging-strategy','/api/canvas/text-nodes','/api/canvas/history','/api/artworks/add'],'PATCH':['/api/image-skills']};
 ensure((fixed[method]||[]).includes(u.pathname)||(method==='GET'&&/^\/(?:media\/|api\/media\/)/.test(u.pathname)),'FINITE_NONBILLABLE_ENDPOINT_ONLY');return u;
};
async function call(method,path,{data,form,auth=true,expected}={}){
 const u=permitted(method,path),headers={};if(auth)headers.cookie=cfg.cookie;if(data!==undefined)headers['content-type']='application/json';
 const body=form|| (data===undefined?undefined:JSON.stringify(data));
 const r=await fetch(u,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(30000)});
 const bytes=Buffer.from(await r.arrayBuffer());ensure(bytes.length<=16*1024*1024,'RESPONSE_TOO_LARGE');
 result.requests.push({method,pathSha256:hash(u.pathname+u.search),status:r.status,authenticated:auth,responseSha256:hash(bytes),responseBytes:bytes.length});
 if(expected!==undefined)ensure((Array.isArray(expected)?expected:[expected]).includes(r.status),'HTTP_STATUS_'+r.status);
 let json;try{json=JSON.parse(bytes.toString('utf8'))}catch{}return {status:r.status,bytes,json};
}
const fields=(node,content)=>({title:node.title,prompt:node.prompt,content,sourceIds:[],targetIds:[],productIds:[],width:node.width,height:node.height});
try{
 ensure(/^[a-f0-9-]{36}$/.test(cfg.runId)&&typeof cfg.cookie==='string'&&/^nv_user=/.test(cfg.cookie),'FIXED_PRIVATE_CONTEXT_REQUIRED');
 const version=(await call('GET','/api/version',{expected:200})).json;ensure(version?.commit===cfg.commit&&String(version.version)===cfg.version,'ACTUAL_CANDIDATE_VERSION_MISMATCH');result.version=version;
 const session=(await call('GET','/api/auth/session',{expected:200})).json;ensure(typeof session?.user?.email==='string','EXISTING_PRINCIPAL_REQUIRED');result.principalSha256=hash(session.user.email.trim().toLowerCase());
 const markdown=`---\nname: QA-${cfg.runId.slice(0,8)}\ndescription: Nonbillable release verification ${cfg.runId}\ncategory: 创作\n---\n# Release QA\nPreserve documented product facts. This run stores instructions only and never invokes any model. Run ${cfg.runId}.\n`;
 const upload=new FormData();upload.set('file',new File([markdown],'SKILL.md',{type:'text/markdown'}));
 const imported=(await call('POST','/api/image-skills/import',{form:upload,expected:201})).json;const skill=imported?.skill;ensure(skill?.id?.startsWith('personal:')&&Number.isInteger(skill.revision)&&imported.duplicate===false,'NEW_PRIVATE_SKILL_REQUIRED');result.created.skillId=skill.id;
 const definition={name:skill.name,description:skill.description,category:skill.category,instructions:skill.instructions+'\nVerified revision '+cfg.runId};
 const edited=(await call('PATCH','/api/image-skills',{data:{selection:{id:skill.id,revision:skill.revision},definition,visibility:'private'},expected:200})).json.skill;ensure(edited.revision===skill.revision+1,'SKILL_REVISION_NOT_INCREMENTED');
 const readSkill=(await call('GET','/api/image-skills',{expected:200})).json.skills.find(x=>x.id===skill.id);ensure(readSkill?.instructions===definition.instructions&&readSkill.revision===edited.revision&&readSkill.visibility==='private'&&readSkill.canEdit===true,'SKILL_EXACT_READBACK_FAILED');result.skill={revision:readSkill.revision,instructionsSha256:hash(readSkill.instructions),private:true};
 await call('GET','/api/image-skills',{auth:false,expected:[401,403]});
 const brief={brand:'Release QA '+cfg.runId,task:'Save-only verification',audience:'Test object',reasons:'No generated claims',impression:'Clear hierarchy',priceChannels:'Not applicable',competition:'Not applicable',constraints:'No model calls; '+cfg.runId};
 const project=(await call('POST','/api/packaging-strategy',{data:{action:'save',brief},expected:200})).json.project;ensure(typeof project?.id==='string'&&Number.isInteger(project.revision),'PACKAGING_PROJECT_REQUIRED');result.created.packagingProjectId=project.id;
 const updatedBrief={...brief,constraints:brief.constraints+'; revision readback'};
 const updated=(await call('POST','/api/packaging-strategy',{data:{action:'save',projectId:project.id,expectedRevision:project.revision,brief:updatedBrief},expected:200})).json.project;ensure(updated.revision===project.revision+1,'PACKAGING_REVISION_NOT_INCREMENTED');
 const readProject=(await call('GET','/api/packaging-strategy?id='+encodeURIComponent(project.id),{expected:200})).json.project;ensure(readProject.revision===updated.revision&&readProject.brief.constraints===updatedBrief.constraints,'PACKAGING_EXACT_READBACK_FAILED');result.packaging={revision:readProject.revision,briefSha256:hash(JSON.stringify(readProject.brief)),saveOnly:true};
 await call('GET','/api/packaging-strategy?id='+encodeURIComponent(project.id),{auth:false,expected:[401,403,404]});
 const node={id:'text-release-qa-'+cfg.runId,projectKey:'release-qa-'+cfg.runId,title:'Release QA '+cfg.runId.slice(0,8),prompt:'',content:'Before '+cfg.runId,status:'completed',canvasX:120,canvasY:140,width:420,height:260,createdAt:new Date().toISOString(),sourceIds:[],targetIds:[],productIds:[]};
 const seeded=(await call('POST','/api/canvas/text-nodes',{data:node,expected:200})).json;ensure(seeded.persisted===true&&seeded.node.id===node.id,'CANVAS_SEED_NOT_PERSISTED');result.created.canvasNodeId=node.id;result.created.canvasProjectKey=node.projectKey;
 const changed='After '+cfg.runId;
 for(const [step,content]of [['save',changed],['undo',node.content],['redo',changed]]){
  const history=(await call('POST','/api/canvas/history',{data:{operationId:randomUUID(),operations:[{type:'text-patch',id:node.id,fields:fields(node,content)}]},expected:200})).json;ensure(history.persisted===true,'CANVAS_HISTORY_NOT_PERSISTED');
  const stored=(await call('GET','/api/canvas/text-nodes',{expected:200})).json.nodes.find(x=>x.id===node.id);ensure(stored?.content===content&&stored.projectKey===node.projectKey,'CANVAS_'+step.toUpperCase()+'_READBACK_FAILED');
 }
 result.canvas={apiSaveUndoRedo:true,readbackSha256:hash(changed),browserButtonsTested:false};await call('GET','/api/canvas/text-nodes',{auth:false,expected:[401,403]});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=','base64');
 const mediaForm=new FormData();mediaForm.set('image',new File([png],'release-qa-'+cfg.runId+'.png',{type:'image/png'}));mediaForm.set('title','Release QA '+cfg.runId);mediaForm.set('entry','canvas');
 const artwork=(await call('POST','/api/artworks/add',{form:mediaForm,expected:200})).json;ensure(typeof artwork?.id==='string'&&typeof artwork.image==='string','OWNED_UPLOAD_REQUIRED');result.created.artworkId=artwork.id;
 const normalized=value=>{const url=new URL(value,base);ensure(/^\/(?:media\/|api\/media\/)/.test(url.pathname),'MANAGED_MEDIA_PATH_REQUIRED');return url.pathname+url.search};
 const mediaPath=normalized(artwork.image);const owned=await call('GET',mediaPath,{expected:200});ensure(hash(owned.bytes)===hash(png),'UPLOAD_ORIGINAL_BYTES_CHANGED');await call('GET',mediaPath,{auth:false,expected:[401,403,404]});result.media={uploadedOriginalBytesExact:true,sha256:hash(png),bytes:png.length,anonymousDenied:true};
 const existing=cfg.ownedMedia.find(x=>typeof x.image_url==='string'&&/^\/(?:media\/|api\/media\/)/.test(new URL(x.image_url,base).pathname));
 if(existing){const media=await call('GET',normalized(existing.image_url),{expected:200});ensure(media.bytes.length>0,'EXISTING_MEDIA_EMPTY');await call('GET',normalized(existing.image_url),{auth:false,expected:[401,403,404]});result.existingMedia={readable:true,observedBytes:media.bytes.length,observedSha256:hash(media.bytes),originalExpectedHashProvided:false,anonymousDenied:true};}
 const after=(await call('GET','/api/version',{expected:200})).json;ensure(after.commit===version.commit&&String(after.version)===String(version.version),'VERSION_CHANGED_DURING_ACCEPTANCE');
 result.result='PASS';
}catch(error){result.result='FAIL';result.failure=/^[A-Z0-9_]+$/.test(error?.message)?error.message:'NETWORK_OR_PROTOCOL_ERROR';}
console.log(JSON.stringify(result));if(result.result!=='PASS')process.exitCode=2;
