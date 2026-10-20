// Local actual-panel + actual CanvasClient submit-function browser fixture.
// No model, DB, worker or remote requests. Lifecycle/text are explicit fixture data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript'),esbuild=require('esbuild');
const out=path.resolve('output/assistant-live-feedback-20261020/browser'),port=Number(process.env.ASSISTANT_FIXTURE_PORT||14901);
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('src/components/canvas/canvas-client.tsx','utf8'),tree=ts.createSourceFile('canvas.tsx',source,99,true,4);let submit;
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='sendAssistantMessage')submit=n.getText(tree);ts.forEachChild(n,visit)}visit(tree);
const labels={title:'画布助手',newChat:'新对话',history:'历史对话',close:'收起',back:'返回',morning:'早上好',afternoon:'下午好',evening:'晚上好',question:'有什么想法？',changeTasks:'换一组',placeholder:'描述你的想法…',send:'发送',references:'参考图片',closeReferences:'收起参考',currentImage:'当前图片',upstreamImage:'上游图片',thinking:'正在处理',copy:'复制',copied:'已复制',emptyHistory:'暂无历史对话',currentChat:'当前对话',agent:'助手',mode:'文本对话',retry:'重试',scrollToBottom:'回到最新'};
const entry=`import React,{useRef,useState} from 'react';import{createRoot}from'react-dom/client';
import{CanvasAssistantPanel}from'../../../src/components/canvas/canvas-assistant-panel';
import{receiveAssistantActivity}from'../../../src/lib/canvas/assistant-live-state';
function App(){
const[assistantInput,setAssistantInput]=useState('先出初稿'),[assistantBusy,setAssistantBusy]=useState(false),[assistantResponding,setAssistantResponding]=useState(false),[assistantTurns,setAssistantTurns]=useState([]),[assistantActivity,setAssistantActivity]=useState({phase:'connecting'}),[assistantError,setAssistantError]=useState(null),[assistantSteps,setAssistantSteps]=useState([]);
const assistantRetry=useRef(null),assistantRequestEpoch=useRef(0),assistantSessionId=useRef('local-fixture'),assistantLiveSessionId=useRef(''),assistantController=useRef(null);
const assistantArtworkId=null,selectedId=null,assistantSkill=null,active={members:[]},activeKey='workspace',textNodes=[],genModel='fixture',genRatio='auto',genResolution='1K',genQuality='medium',locale='zh';
const videoNodesStore={getNode:()=>null,refresh:async()=>{}},chosenFeatureModel=()=>undefined,browserRandomUUID=()=>crypto.randomUUID(),orbCue=()=>{},setAssistantOutcome=()=>{},privateFetch=fetch,readJsonSafe=r=>r.json(),classifyAgentFailure=()=>({code:'FIXTURE_ERROR'}),reduceAgentProgress=(p)=>p,mergeWorks=async()=>[],pushAddUndoMany=()=>{};
${submit}
return <main><div className="fixture-background"><span>Naumi · 本地交互验收</span><h1>画布</h1><div className="fixture-art">创作区域</div><div className="fixture-controls"><button onClick={()=>fetch('/__fixture/advance?event=thinking')}>返回思考状态</button><button onClick={()=>fetch('/__fixture/advance?event=partial')}>返回首段</button><button onClick={()=>fetch('/__fixture/advance?event=done')}>完成</button><button onClick={()=>fetch('/__fixture/advance?event=disconnect')}>中断连接</button></div></div>
<CanvasAssistantPanel light anchorTitle="文本对话" contextImages={[]} turns={assistantTurns} input={assistantInput} busy={assistantBusy} error={assistantError} activity={assistantActivity} responding={assistantResponding} steps={assistantSteps} costLabel="" labels={${JSON.stringify(labels)}} tasks={[]} onInputChange={setAssistantInput} onSend={()=>void sendAssistantMessage()} onNewChat={()=>{setAssistantTurns([]);setAssistantInput('先出初稿');assistantRetry.current=null;}} onRestoreChat={()=>{}} onClose={()=>{}} onPreview={()=>{}} onCopy={async()=>true} renderContent={s=><span style={{whiteSpace:'pre-wrap'}}>{s}</span>} onStop={()=>assistantController.current?.abort()}/></main>};createRoot(document.getElementById('root')).render(<App/>);`;
fs.writeFileSync(path.join(out,'entry.tsx'),entry);
let current,heartbeat,requests=0;
const send=(type,data)=>{if(current&&!current.destroyed)current.write('event: '+type+'\ndata: '+JSON.stringify(data)+'\n\n')};
async function start(){
 await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,platform:'browser',format:'iife',outfile:path.join(out,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},loader:{'.css':'local-css'}});
 const postcss=require('postcss'),tailwind=require('tailwindcss'),config=require('jiti')(__filename)('./../tailwind.config.ts').default;
 const css=await postcss([tailwind({...config,content:['src/components/canvas/canvas-assistant-panel.tsx','src/components/canvas/canvas-agent-tool-card.tsx']})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:undefined});fs.writeFileSync(path.join(out,'global.css'),css.css);
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/canvas/assistant'){
   requests++;for await(const b of req){};setTimeout(()=>{if(res.destroyed)return;current=res;res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no'});send('open',{sessionId:'local-fixture'});send('activity',{phase:'processing'});heartbeat=setInterval(()=>send('heartbeat',{}),1000);res.on('close',()=>{clearInterval(heartbeat);if(current===res)current=null;});},1000);return;
  }
  if(u.pathname==='/__fixture/state'){res.setHeader('content-type','application/json');res.end(JSON.stringify({requests,connected:!!current,supplierCalls:0}));return;}
  if(u.pathname==='/__fixture/advance'){
   const event=u.searchParams.get('event');if(event==='thinking')send('activity',{phase:'thinking'});
   if(event==='partial'){send('activity',{phase:'responding'});send('delta',{text:'初稿会围绕产品主体展开，采用简洁的留白构图。'});}
   if(event==='done'){send('delta',{text:'\n柔和光线突出材质，背景保持干净。'});send('done',{ok:true});current?.end();}
   if(event==='disconnect')current?.end();res.end('OK');return;
  }
  const files={'/app.js':'app.js','/app.css':'app.css','/global.css':'global.css'};
  if(files[u.pathname]){res.setHeader('content-type',u.pathname.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(out,files[u.pathname])));return;}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><title>画布助手 · 本地验收</title><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/app.css"><style>body{margin:0;font-family:system-ui;background:#f8f9fc;color:#292b35}main{position:relative;display:flex;height:100dvh;min-height:500px;overflow:hidden}.fixture-background{flex:1;min-width:0;padding:40px;color:#858896}.fixture-background h1{font-size:24px;margin-top:12px;color:#373943}.fixture-art{width:220px;height:250px;margin:60px auto;background:white;border-radius:16px;border:1px solid #e8e9ed;display:grid;place-items:center}.fixture-controls{display:flex;flex-wrap:wrap;gap:8px}.fixture-controls button{font-size:12px;padding:8px;border:1px solid #ddd;border-radius:8px;background:white}aside{height:calc(100dvh - 16px)}@media(max-width:700px){.fixture-background{visibility:hidden}}</style><div id="root"></div><script src="/app.js"></script></html>');
 });server.listen(port,'127.0.0.1',()=>console.log('ASSISTANT_FIXTURE_READY=http://127.0.0.1:'+port+' ACTUAL_PANEL=1 ACTUAL_SUBMIT=1 SUPPLIER_CALLS=0'));process.on('SIGINT',()=>{current?.end();clearInterval(heartbeat);server.close(()=>process.exit(0))});
}start().catch(e=>{console.error(e);process.exitCode=1});
