'use strict';
// Opt-in loopback fixture: real constructors, in-memory records and CAS saves.
// Keeps every paid execution local and explicitly rejected.
const path=require('node:path'),fs=require('node:fs'),esbuild=require('esbuild');
module.exports=({arts,videos,text,state})=>{
 const out=path.resolve('output/all-docks/domain.cjs');fs.mkdirSync(path.dirname(out),{recursive:true});
 esbuild.buildSync({stdin:{contents:['character','scene','director','audio','timeline'].map(kind=>`export * from './src/lib/${kind}/project';`).join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:out});
 const domain=require(out),now=new Date().toISOString(),titles={character:'角色设定',scene:'场景设定',director:'3D 导演台',audio:'音频剪辑',timeline:'多轨编辑器'};
 const nodes={};let index=0;
 for(const kind of Object.keys(titles)){
  const field=kind==='director'?'project':kind,value=domain[`new${kind[0].toUpperCase()+kind.slice(1)}Project`]();
  const node={id:`audit-${kind}`,projectKey:'tree:placement-root',revision:1,title:titles[kind],x:120+index%3*500,y:1100+Math.floor(index/3)*420,width:360,height:280,[field]:value,deletedAt:null,createdAt:now,updatedAt:now};
  if(kind==='director')node.outputs=[];if(kind==='timeline'){node.adopted=null;node.render=null;}
  nodes[kind]=[node];index++;
 }
 arts.push({...arts[0],id:'audit-video-result',parentId:'placement-root',title:'视频结果',videoUrl:'/media/fixture-result.mp4',canvasX:120,canvasY:680,prompt:Array.from({length:35},(_,i)=>`镜头 ${i+1}：晨光经过街道，保持主体与自然光线。`).join('\n')});
 const initial={nodes:structuredClone(nodes),text:structuredClone(text),videos:structuredClone(videos)},writes=[],blocked=[];
 const sound=Buffer.alloc(44+44100*3*2);sound.write('RIFF');sound.writeUInt32LE(sound.length-8,4);sound.write('WAVEfmt ',8);sound.writeUInt32LE(16,16);sound.writeUInt16LE(1,20);sound.writeUInt16LE(1,22);sound.writeUInt32LE(44100,24);sound.writeUInt32LE(88200,28);sound.writeUInt16LE(2,32);sound.writeUInt16LE(16,34);sound.write('data',36);sound.writeUInt32LE(sound.length-44,40);for(let i=0;i<44100*3;i++)sound.writeInt16LE(Math.round(Math.sin(i*440*2*Math.PI/44100)*4000),44+i*2);
 let prompt=require('../canvas-image-prompt-fixture.cjs').createImagePromptFixture({getArtworks:()=>arts,state});
 return async({req,res,url,body,json})=>{
  const p=url.pathname;
  if(p==='/media/audit.wav'){res.writeHead(200,{'content-type':'audio/wav','content-length':sound.length});res.end(sound);return true;}
  if(p==='/api/video/assets'&&req.method==='GET'){json(res,{assets:[{artworkId:'audit-audio-source',kind:'audio',title:'音频样本.wav',url:'/media/audit.wav',projectKey:'tree:placement-root'}],nextCursor:null});return true;}
  if(p==='/api/video/media-jobs/quote'){json(res,{quote:{credits:0,version:1}});return true;}
  if(p==='/api/artworks/get'){const ids=(url.searchParams.get('ids')||'').split(',');state.artworkReads||=[];state.artworkReads.push(ids);json(res,{artworks:arts.filter(art=>ids.includes(art.id))});return true;}
  if(p==='/__fixture/all-docks/reset'&&req.method==='POST'){
   for(const kind of Object.keys(nodes))nodes[kind]=structuredClone(initial.nodes[kind]);
   Object.assign(text,structuredClone(initial.text));videos.splice(0,videos.length,...structuredClone(initial.videos));writes.length=0;blocked.length=0;
   const audioIndex=arts.findIndex(art=>art.id==='audit-audio-source');if(audioIndex>=0)arts.splice(audioIndex,1);
   if(url.searchParams.get('mode')==='populated'){
    arts.push({...arts[0],id:'audit-audio-source',parentId:'placement-root',title:'音频样本.wav',category:'audio',image:'',videoUrl:'/media/audit.wav',canvasX:-500,canvasY:1600});
    nodes.audio[0].audio=domain.withAudioSource('audit-audio-source');
    if(url.searchParams.get('unbound')==='1')nodes.audio[0].audio=domain.newAudioProject();
    const project=nodes.timeline[0].timeline;
    project.tracks[0].clips=[{id:'audit-clip',artworkId:'placement-root',position:0,inPoint:0,duration:3,gain:1,fadeIn:0,fadeOut:0,audioEnabled:false,transitionIn:0}];
    for(let i=0;i<5;i++)project.tracks.push({id:'audit-track-'+i,name:'附加画面 '+i,kind:'video',muted:false,gain:1,clips:[]});
   }
   prompt=require('../canvas-image-prompt-fixture.cjs').createImagePromptFixture({getArtworks:()=>arts,state});json(res,{ok:true});return true;
  }
  if(p==='/api/canvas/image-prompts'){const response=await prompt.request(req.method,req.method==='GET'?Object.fromEntries(url.searchParams):body);json(res,response.body,response.status);return true;}
  if(p==='/__fixture/all-docks'){json(res,{nodes,writes,blocked,paidCalls:state.paidCalls});return true;}
  if(p==='/api/canvas/workflow-import'&&req.method==='GET'){json(res,{manifests:[]});return true;}
  const match=p.match(/^\/api\/canvas\/(character|scene|director|audio|timeline)-nodes(?:\/([^/]+))?(.*)$/);
  if(match){const [,kind,id,tail]=match;
   if(kind==='timeline'&&tail==='/materials'&&req.method==='GET'){
    const ids=JSON.parse(url.searchParams.get('ids')||'[]');
    json(res,{materials:ids.map(artworkId=>({artworkId,kind:'image',durationSeconds:null,hasAudio:false,key:artworkId,sha256:'fixture',url:arts.find(art=>art.id===artworkId)?.image||arts[0].image}))});return true;
   }
   if(tail){blocked.push({path:p,method:req.method});json(res,{error:'审查不调用外部生成或媒体处理'},409);return true;}
   if(req.method==='GET'){json(res,{nodes:nodes[kind]});return true;}
   let node=nodes[kind].find(n=>n.id===(id||body.id));
   if(req.method==='POST'&&!node){node={...structuredClone(nodes[kind][0]),...body,revision:1};nodes[kind].push(node);}
   else if(node&&body.expectedRevision!==undefined&&body.expectedRevision!==node.revision){json(res,{error:'版本冲突'},409);return true;}
   else if(node)Object.assign(node,body,{revision:node.revision+1,updatedAt:new Date().toISOString()});
   writes.push({kind,body});json(res,{node,persisted:true});return true;
  }
  if(p==='/api/canvas/text-nodes'&&req.method==='POST'){
   const next=(body.nodes||[body]).find(n=>n.id===text.id);if(next)Object.assign(text,next);writes.push({kind:'text',body});json(res,{node:text,nodes:[text],persisted:true});return true;
  }
  return false;
 };
};
