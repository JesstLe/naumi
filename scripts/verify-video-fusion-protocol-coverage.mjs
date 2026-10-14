import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('output/canvas-video-fusion-20261013/checkpoint-d');
const manifest=JSON.parse(await readFile('scripts/video-fusion/application-protocol-cases.json','utf8'));
const summary=JSON.parse(await readFile(path.join(root,'application-protocols-summary.json'),'utf8'));
const failureRun=process.argv.find(value=>value.startsWith('--failures='))?.slice(11);assert.match(failureRun||'',/^protocol-failures-[a-f0-9-]{36}$/);
const failures=JSON.parse(await readFile(path.join(root,failureRun,'result.json'),'utf8'));
assert.equal(summary.ok,true);assert.equal(summary.completedCases,51);assert.equal(summary.completedProfiles,41);assert.equal(failures.ok,true);assert.equal(failures.results.length,15);
const field=(object,dotted)=>dotted.split('.').reduce((value,key)=>value?.[key],object),cache=new Map();
for(const profile of new Set(manifest.cases.map(item=>item.profile))){
 const items=manifest.cases.filter(item=>item.profile===profile),rows=summary.evidence.filter(item=>item.profile===profile);assert.equal(rows.length,items.length);
 assert.equal(new Set(rows.map(item=>item.run)).size,1);const calls=JSON.parse(await readFile(path.join(root,rows[0].run,`${profile}-calls.json`),'utf8'));assert.equal(calls.length,items.length);
 for(let index=0;index<items.length;index++){
  const item=items[index],row=rows.find(row=>row.id===item.id);assert.ok(row);for(const key of ['actualRawWireValidated','actualAppAndWorkerCompleted','actualPrivateMediaHashesAndOwnership','idempotencyAndSettlement'])assert.equal(row[key],true);
  const call=calls[index];assert.equal(call.phase,'create');assert.equal(call.path,row.expectedPath);const body=call.body;assert.equal(body.model||body.model_name||(profile==='gemini'&&'wire-video'),'wire-video');
  if(item.extra.shots){const shots=field(body,profile.startsWith('kie')?'input.multi_prompt':'multi_prompt');assert.equal(shots.length,item.extra.shots.length);for(let n=0;n<shots.length;n++){assert.equal(shots[n].prompt,item.extra.shots[n].prompt);assert.equal(shots[n].duration,item.extra.shots[n].durationSeconds);}}
  if(item.extra.element){const elements=field(body,profile==='kie-kling'?'input.kling_elements':profile.startsWith('kie')?'input.elements':'element_list');assert.equal(elements.length,1);assert.equal(elements[0].name,'角色');assert.equal(elements[0].description,'同一人物');assert.equal(elements[0].element_input_urls.length,1);}
  if(item.mode==='motion_control'){assert.equal(field(body,profile.startsWith('kie')?'input.character_orientation':profile.startsWith('apimart')?'character_orientation':'settings.character_orientation'),'image',item.id);if(profile.startsWith('kie'))assert.equal(body.input.mode,'720p');else if(profile.startsWith('apimart'))assert.equal(body.mode,'std');else assert.equal(body.settings.resolution,'720p');}
  if(profile==='ark'){assert.equal(body.seed,0);assert.equal(body.camera_fixed,false);assert.equal(body.generate_audio,false);assert.equal(body.watermark,false);assert.deepEqual(body.content.slice(1).map(item=>item.type),['image_url','video_url','audio_url']);}
  if(profile==='gemini'){assert.ok(field(body,'instances.0.image.inlineData.data'));assert.ok(field(body,'instances.0.lastFrame.inlineData.data'));assert.equal(body.parameters.durationSeconds,4);}
  if(profile==='tokendance-seedance'&&item.mode==='reference'){assert.equal(body.seed,0);assert.equal(body.generate_audio,false);assert.equal(body.watermark,false);}
  if(profile==='tfrouter-generic'&&item.mode==='reference')assert.equal(body.metadata.generate_audio,false);
  if(profile==='tfrouter-generic'&&item.mode==='first_optional')assert.equal(field(body,'metadata.references.0.role'),'last_frame');
  if(profile==='tfrouter-kling'){assert.ok(body.metadata.image);assert.ok(body.metadata.image_tail);}
  if(profile==='tfrouter-kling-omni'){assert.equal(body.metadata.image_list.length,1);assert.equal(body.metadata.video_list.length,1);}
  if(profile==='compshare-vidu-extend')assert.equal(body.parameters.vidu_type,'extend');
  if(profile==='compshare-vidu-lip-sync'){assert.equal(body.parameters.vidu_type,'lip-sync');assert.ok(body.input.video_url);if(item.extra.providerOptions?.text)assert.equal(body.input.text,'你好');else assert.ok(body.input.audio_url);}
  if(profile==='compshare-wan'&&item.mode==='frames_required'){for(const key of ['first_frame_url','last_frame_url','audio_url'])assert.ok(body.input[key]);}
  if(profile==='compshare-seedance'&&item.mode==='reference'){assert.equal(body.parameters.generate_audio,false);assert.equal(body.parameters.watermark,false);assert.deepEqual(body.input.content.slice(1).map(item=>item.type),['image_url','video_url','audio_url']);}
  cache.set(item.id,{...row,nativeBodyReviewed:true,advancedFieldsMatch:!!(item.extra.shots||item.extra.element),nativePath:call.path});
 }
}
for(const row of failures.results){assert.equal(row.status,'failed');for(const key of ['nativeErrorDecoded','noResultOrFalseCompletion','fullRefundOnce','idempotentFailedReplay','restartNoNewCreateOrSettlement','otherAccountDenied'])assert.equal(row[key],true);const calls=JSON.parse(await readFile(path.join(root,failureRun,`${row.profile}-calls.json`),'utf8'));assert.equal(calls.filter(call=>call.phase==='create').length,1);assert.ok(calls.some(call=>call.phase==='poll'));}
const definitions=[
 {id:'P01',prefixes:['openai-videos','grok2api','cogvideox3','agnes'],errors:['openai-videos']},
 {id:'P02',prefixes:['ark','tokendance-seedance','compshare-seedance'],errors:['ark','tokendance-seedance']},
 {id:'P03',prefixes:['kie','apimart'],errors:['kie-generic','apimart-generic']},
 {id:'P04',prefixes:['gemini','minimax','metaso'],errors:['gemini','minimax','metaso']},
 {id:'P06',prefixes:['tokendance'],errors:['tokendance-seedance','tokendance-kling-text','tokendance-wan3','tokendance-minimax']},
 {id:'P07',prefixes:['tfrouter'],errors:['tfrouter-generic']},
 {id:'P08',prefixes:['compshare'],errors:['compshare-h3','compshare-vidu','compshare-wan']},
];
const groups=definitions.map(group=>{const cases=manifest.cases.filter(item=>group.prefixes.some(prefix=>item.profile.startsWith(prefix))).map(item=>cache.get(item.id));assert.ok(cases.length);for(const profile of group.errors)assert.ok(failures.results.some(row=>row.profile===profile));return {id:group.id,caseIds:cases.map(item=>item.id),profiles:[...new Set(cases.map(item=>item.profile))],allNativePathsAndBodiesReviewed:true,allActualAppCompletionMediaOwnershipAndIdempotencyPassed:true,sharedNativeErrorResponseShapesPassed:true,errorProfiles:group.errors};});
await writeFile(path.join(root,'protocol-coverage-audit.json'),JSON.stringify({schemaVersion:1,ok:true,scope:'P01-P04-P06-P08-native-body-and-app-evidence-audit',groups,successCases:51,nativeProfiles:41,errorResponseShapes:15,motionQualityAndOrientationMappingsReviewed:true,failureRun,realVideoQualityValidated:false,paidVideoApiCalls:0,fixedReleaseValidated:false,wholeGoalAccepted:false},null,2));
process.stdout.write('VIDEO_PROTOCOL_COVERAGE_AUDIT=PASS groups=7 native_profiles=41 success_cases=51 error_shapes=15\n');
