const fs = require('node:fs'), Module = require('node:module'), path = require('node:path');
process.env.FIXTURE_PORT ||= '14931';
process.env.FIXTURE_DIST ||= '.next-agent-stream-recovery';
process.env.FIXTURE_OUT ||= 'output/agent-stream-recovery-20261021/browser';
let source=fs.readFileSync('scripts/serve-agent-chat-attachments-fixture.cjs','utf8');
const start=source.indexOf(" if(p==='/api/canvas/assistant'){");
const end=source.indexOf(" if(p==='/api/config')",start);
if(start<0||end<0)throw Error('Canvas fixture API boundary missing');
source=source.slice(0,start)+`
 if(p==='/api/canvas/assistant'){
  const partial='已保留正文。详情承接：配方徽章与';
  if(req.method==='POST'){
   state.turns.push(body);state.savedId=body.sessionId;state.recovered=body.continueText===true;
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});
   const send=(type,data)=>res.write('event: '+type+'\\ndata: '+JSON.stringify(data)+'\\n\\n');
   send('open',{sessionId:body.sessionId});
   if(body.continueText){send('delta',{text:'包装结构，补全后续方案。'});send('done',{ok:true});}
   else{send('delta',{text:partial});send('error',{code:'STREAM_INTERRUPTED',message:'回复中断，内容已保留',canContinue:true,continueFromTurnId:'fixture-partial-turn'});}
   res.end();return;
  }
  if(u.searchParams.has('id'))return json(res,{session:{id:state.savedId,anchorId:'attachment-root',referenceIds:['attachment-root'],turns:[{id:'u',role:'user',content:'先出初稿'},{id:'a',role:'assistant',content:partial}],steps:[],running:false,status:'failed',error:'回复中断，内容已保留',continueFromTurnId:'fixture-partial-turn'}});
  return json(res,{sessions:state.savedId?[{id:state.savedId,title:'中断会话',anchorId:'attachment-root',updatedAt:now}]:[]});
 }
`+source.slice(end);
const m=new Module(path.resolve('scripts/.agent-stream-recovery-fixture.cjs'),module);m.filename=path.resolve('scripts/.agent-stream-recovery-fixture.cjs');m.paths=module.paths;m._compile(source,m.filename);
