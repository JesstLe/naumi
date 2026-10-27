const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=process.cwd(),source=path.resolve(process.argv[2]||root),mode=process.argv[3]||'modified',out=process.env.CANVAS_PROMPT_EVIDENCE||path.resolve('output/canvas-prompt-optimizer');
const mocks={
 '@/lib/model-config/clients':`export function modelAwareOpenAI(){return {chat:{completions:{create:async(body,options)=>{const f=globalThis.__promptFixture;f.calls.push({body,hasSignal:!!options?.signal,options});if(f.throwError)throw Error('upstream-error');return {choices:[{message:{content:f.reply},finish_reason:f.finishReason||'stop'}]};}}}};}`,
 '@/lib/bi/model-observer':`export const observeOpenAI=x=>x;export const withBiRequest=(r,fn)=>fn();`,
 '@/lib/bi/model-calls':`export const observeOpenAI=x=>x;`,
 '@/lib/bi/request':`export const withBiRequest=(r,fn)=>fn();`,
 'next/server':`export const NextResponse={json:(value,options)=>new Response(JSON.stringify(value),{...options,headers:{'content-type':'application/json'}})};`,
 '@/lib/vision-image':`export const toVisionDataUrl=async()=>'';`,
 '@/lib/settings':`export const getOpenAISettings=async()=>({apiKey:globalThis.__promptFixture.key});`,
 '@/lib/openai-base':`export const getOpenAIBaseUrl=async()=>'http://fixture.invalid';`,
 '@/lib/prompt-config':`export const getAssistSystem=async()=>'legacy-write';export const getOptimizeSystem=async()=>'legacy-commerce';export const ASSIST_TOOL_HINTS={};`,
 '@/lib/admin-auth':`export const resolveUserEmail=async()=>globalThis.__promptFixture.auth?'fixture@local':null;`,
 '@/lib/db':`export const dbEnabled=true;`,
 '@/platform/db/pool':`export const dbEnabled=true;`,
 '@/lib/rate-limit':`export const rateLimit=()=>true;`,
 '@/lib/ip':`export const clientIp=()=> '127.0.0.1';`,
 '@/lib/api-error':`export const safeError=(e,f)=>f;`,
 '@/lib/text-models':`export const requestedTextModel=()=> 'fixture-text';`,
 '@/lib/model-config/requests':`export const modelConfigurationEnabled=async()=>globalThis.__promptFixture.managed;`,
 '@/lib/model-config/availability':`export const modelConfigurationEnabled=async()=>globalThis.__promptFixture.managed;`,
 'server-only':'',
};
(async()=>{fs.mkdirSync(out,{recursive:true});const built=await esbuild.build({entryPoints:[path.join(source,'src/app/api/prompt-assist/route.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},args=>{if(Object.hasOwn(mocks,args.path))return {path:args.path,namespace:'fixture'};if(args.path.startsWith('@/')){for(const ext of ['.ts','.tsx']){const p=path.join(source,'src',args.path.slice(2))+ext;if(fs.existsSync(p))return{path:p}}}});b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}));}}]});const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);const {POST}=mod.exports;
 const request=async(tool,idea,patch={})=>{global.__promptFixture={calls:[],reply:'优化后的完整描述',key:'fixture',managed:false,auth:true,...patch};const res=await POST(new Request('http://127.0.0.1/api/prompt-assist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tool,idea,mode:'optimize'})}));return {status:res.status,body:await res.json(),calls:global.__promptFixture.calls};};
 let checks=0;const ok=name=>{checks++;console.log('CHECK='+name)};
 const long='保留完整场景'.repeat(180)+'END_OF_USER_PROMPT';let r=await request('canvas-image',long);
 const client=fs.readFileSync(path.join(source,'src/components/canvas/canvas-client.tsx'),'utf8');
 if(mode==='baseline'){assert.equal(r.calls.length,1);assert.ok(!r.calls[0].body.messages[1].content.includes('END_OF_USER_PROMPT'));assert.ok(!client.includes('<CanvasPromptOptimizer'));r=await request('canvas-image','机器人在雨中',{key:'',managed:true});assert.equal(r.calls.length,0);assert.match(r.body.prompt,/商业产品摄影/);console.log('BASELINE=CONFIRMED IMAGE_TEXT_DOCK_OPTIMIZER=ABSENT INPUT_600_TRUNCATION=1 MANAGED_NO_LEGACY_KEY_RETURNS_FAKE_COMMERCE=1 SUPPLIER_CALLS=0');return;}
 assert.equal(r.status,200);assert.ok(r.calls[0].body.messages[1].content.includes('END_OF_USER_PROMPT'));assert.equal(r.calls[0].body.max_tokens,12000);ok('image full input preserved beyond 600');
 for(const tool of ['canvas-image','canvas-text']){r=await request(tool,long,{key:'',managed:true});assert.equal(r.status,200);assert.equal(r.calls.length,1);assert.ok(r.calls[0].body.messages[1].content.endsWith(long));assert.equal(r.calls[0].hasSignal,true);assert.equal(r.calls[0].options.maxRetries,0);ok(tool+' managed configuration and cancellation');r=await request(tool,'测试',{key:'',managed:false});assert.equal(r.status,503);assert.equal(r.body.prompt,undefined);assert.equal(r.calls.length,0);ok(tool+' no fabricated result');r=await request(tool,'字'.repeat(6001));assert.equal(r.status,422);assert.equal(r.calls.length,0);ok(tool+' over limit rejected without truncation');r=await request(tool,' ');assert.equal(r.status,400);ok(tool+' blank rejected');}
 for(const [idea,reply] of [['参考【图1】和【图2】','参考【图2】'],['保留店招“晚安”','保留店招“早安”'],['请使用{{ref 2}}','请使用{{ref 3}}']]){r=await request('canvas-image',idea,{reply});assert.equal(r.status,502);ok('protected content retained '+idea);}
 r=await request('canvas-text','店招“晚安”，人物说「明天见」。',{reply:'人物位于店招“晚安”之下，说「明天见」。'});assert.equal(r.status,200);ok('quoted content valid output');
 for(const patch of [{reply:''},{reply:'字'.repeat(6001)},{finishReason:'length'},{throwError:true}]){r=await request('canvas-image','原文',{...patch});assert.equal(r.status,502);ok('failure and invalid output retain original');}
 for(const tool of ['canvas-image','canvas-text']){r=await request(tool,'字'.repeat(6000),{reply:'字'.repeat(6000)});assert.equal(r.status,200);assert.equal(r.body.prompt.length,6000);ok(tool+' exact 6000 accepted');}
 r=await request('canvas-image','保留<node-asset>asset-123</node-asset>和【图1】【图1】',{reply:'保留<node-asset>asset-123</node-asset>和【图1】'});assert.equal(r.status,502);ok('duplicate references preserved');
 r=await request('canvas-image','保留<node-asset>asset-123</node-asset>',{reply:'保留<node-asset>other</node-asset>'});assert.equal(r.status,502);ok('node asset identity preserved');
 r=await request('canvas-image','使用【图1】和{{ref 2}}',{reply:'使用{{ref 2}}与【图1】，保留构图。'});assert.equal(r.status,200);ok('reference reordering accepted');
 r=await request('canvas-text','总结成三段');assert.match(r.calls[0].body.messages[0].content,/只优化创作指令/);ok('text instruction separated from story output');
 r=await request('canvas-image','测试',{auth:false});assert.equal(r.status,401);assert.equal(r.calls.length,0);ok('authentication retained');
 r=await request('canvas-video','开场{{ref 1}}说“晚安”。',{key:'',managed:true,reply:'开场{{ref 1}}说“晚安”。'});assert.equal(r.status,200);assert.equal(r.calls.length,1);ok('existing video path unchanged');
 r=await request('generate',long);assert.ok(!r.calls[0].body.messages[1].content.includes('END_OF_USER_PROMPT'));ok('legacy feature behavior untouched');
 const imageComposer=fs.readFileSync(path.join(source,'src/components/canvas/image-composer.tsx'),'utf8'),textComposer=fs.readFileSync(path.join(source,'src/components/canvas/text-composer.tsx'),'utf8');
 assert.equal((imageComposer.match(/<CanvasPromptOptimizer\b/g)||[]).length,1);assert.equal((textComposer.match(/<CanvasPromptOptimizer\b/g)||[]).length,1);
 assert.equal((client.match(/<CanvasImageComposer\b/g)||[]).length,2);assert.equal((client.match(/<CanvasTextComposer\b/g)||[]).length,1);
 assert.ok(imageComposer.includes('contextKey={identity}'));assert.ok(textComposer.includes('optimization?.contextKey'));ok('three native docks through their real composer owners');
 console.log('MODIFIED_API=PASS CHECKS='+checks+' REAL_ROUTE=1 MOCK_LLM=1 SUPPLIER_CALLS=0');
})().catch(e=>{console.error(e);process.exitCode=1});
