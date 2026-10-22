// Reuse the real CanvasClient HTTP fixture, replacing only its loopback assistant response.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.resolve('scripts/serve-agent-chat-attachments-fixture.cjs');
let source=fs.readFileSync(filename,'utf8');
const start=source.indexOf('function finishReply(res,body)'),end=source.indexOf('\nconst dist=',start);
if(start<0||end<0)throw Error('Fixture contract changed');
const replacement=`function timelineEvents(body={}){if(body.continueText)return [["delta",{text:"继续补全：节点布局与后续方案。"}],["assistant",{text:"继续补全：节点布局与后续方案。"}],["final",{reply:"继续补全：节点布局与后续方案。"}],["done",{ok:true}]];const events=[
 ['delta',{text:'我先检查画布节点。'}],['assistant',{text:'我先检查画布节点。'}],
 ['tool_start',{id:'read',tool:'list_video_nodes',at:1000}],['tool_end',{id:'read',tool:'list_video_nodes',at:1400,summary:'项目视频节点已读取'}],
 ['delta',{text:'节点已读取，接着查找作品。'}],['assistant',{text:'节点已读取，接着查找作品。'}],
 ['tool_start',{id:'search',tool:'list_my_artworks',at:1500}],['tool_end',{id:'search',tool:'list_my_artworks',at:1900,summary:'返回20个作品'}],
 ['delta',{text:'整理建议：\\n1. 保留一个有效节点。\\n2. 补充视频提示词。\\n3. 保留已生成的作品。'}],
 ['assistant',{text:'整理建议：\\n1. 保留一个有效节点。\\n2. 补充视频提示词。\\n3. 保留已生成的作品。'}],
 ['final',{reply:'整理建议：\\n1. 保留一个有效节点。\\n2. 补充视频提示词。\\n3. 保留已生成的作品。'}],['done',{ok:true}]
 ];return process.env.TIMELINE_INTERRUPT==='1'?[...events.filter(event=>event[0]!=='final'&&event[0]!=='done'),['error',{code:'STREAM_INTERRUPTED',message:'回复中断，内容已保留',canContinue:true,continueFromTurnId:'fixture-timeline-partial'}]]:events;}
 function historyView(){const turns=[],steps=[];for(const body of state.turns){const events=timelineEvents(body);steps.push({type:'canvas_turn',messageIndex:turns.length,message:body.messages?.at(-1)?.content||'继续输出'});turns.push({id:'u'+turns.length,role:'user',content:body.messages?.at(-1)?.content||'继续输出'},{id:'a'+turns.length,role:'assistant',content:events.findLast(event=>event[0]==='assistant')?.[1].text||''});steps.push(...events.filter(event=>!['delta','done'].includes(event[0])).map(([type,data])=>({...data,type:type==='final'?'canvas_reply':type})));}return {turns,steps};}
 function finishReply(res,body){let index=0;const events=timelineEvents(body);const timer=setInterval(()=>{const event=events[index++];res.write('event: '+event[0]+'\\ndata: '+JSON.stringify(event[1])+'\\n\\n');if(index===events.length){clearInterval(timer);res.end();}},240);res.on('close',()=>clearInterval(timer));}`;
source=source.slice(0,start)+replacement+source.slice(end);
const old="turns:[],steps:[],running:false,status:'completed'";
if(!source.includes(old))throw Error('History fixture contract changed');
source=source.replace(old,"turns:historyView().turns,steps:historyView().steps,running:false,status:process.env.TIMELINE_INTERRUPT==='1'&&!last?.continueText?'failed':'completed',error:process.env.TIMELINE_INTERRUPT==='1'&&!last?.continueText?'回复中断，内容已保留':undefined,continueFromTurnId:process.env.TIMELINE_INTERRUPT==='1'&&!last?.continueText?'fixture-timeline-partial':undefined");
const child=new Module(filename,module);child.filename=filename;child.paths=Module._nodeModulePaths(path.dirname(filename));child._compile(source,filename);
