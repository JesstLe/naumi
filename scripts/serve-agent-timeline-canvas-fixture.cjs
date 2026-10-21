// Reuse the real CanvasClient HTTP fixture, replacing only its loopback assistant response.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.resolve('scripts/serve-agent-chat-attachments-fixture.cjs');
let source=fs.readFileSync(filename,'utf8');
const start=source.indexOf('function finishReply(res,body)'),end=source.indexOf('\nconst dist=',start);
if(start<0||end<0)throw Error('Fixture contract changed');
const replacement=`function timelineEvents(){return [
 ['delta',{text:'我先检查画布节点。'}],['assistant',{text:'我先检查画布节点。'}],
 ['tool_start',{id:'read',tool:'list_video_nodes',at:1000}],['tool_end',{id:'read',tool:'list_video_nodes',at:1400,summary:'项目视频节点已读取'}],
 ['delta',{text:'节点已读取，接着查找作品。'}],['assistant',{text:'节点已读取，接着查找作品。'}],
 ['tool_start',{id:'search',tool:'list_my_artworks',at:1500}],['tool_end',{id:'search',tool:'list_my_artworks',at:1900,summary:'返回20个作品'}],
 ['delta',{text:'整理建议：\\n1. 保留一个有效节点。\\n2. 补充视频提示词。\\n3. 保留已生成的作品。'}],
 ['assistant',{text:'整理建议：\\n1. 保留一个有效节点。\\n2. 补充视频提示词。\\n3. 保留已生成的作品。'}],
 ['final',{reply:'整理建议：\\n1. 保留一个有效节点。\\n2. 补充视频提示词。\\n3. 保留已生成的作品。'}],['done',{ok:true}]
 ];}
 function finishReply(res,body){let index=0;const events=timelineEvents();const timer=setInterval(()=>{const event=events[index++];res.write('event: '+event[0]+'\\ndata: '+JSON.stringify(event[1])+'\\n\\n');if(index===events.length){clearInterval(timer);res.end();}},240);res.on('close',()=>clearInterval(timer));}`;
source=source.slice(0,start)+replacement+source.slice(end);
const old="turns:[],steps:[],running:false,status:'completed'";
if(!source.includes(old))throw Error('History fixture contract changed');
source=source.replace(old,"turns:[{id:'history-u',role:'user',content:last?.messages?.at(-1)?.content||'检查画布'},{id:'history-a',role:'assistant',content:timelineEvents().find(event=>event[0]==='final')[1].reply}],steps:[{type:'canvas_turn',messageIndex:0},...timelineEvents().filter(event=>event[0]!=='delta'&&event[0]!=='done').map(([type,data])=>({...data,type:type==='final'?'canvas_reply':type}))],running:false,status:'completed'");
const child=new Module(filename,module);child.filename=filename;child.paths=Module._nodeModulePaths(path.dirname(filename));child._compile(source,filename);
