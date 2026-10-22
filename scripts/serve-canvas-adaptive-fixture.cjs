const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
process.env.FIXTURE_PORT||='14951';process.env.FIXTURE_DIST||='.next-canvas-adaptive';process.env.FIXTURE_OUT||='output/canvas-key-frame-long-image-20261021/browser';
let source=fs.readFileSync('scripts/serve-agent-chat-attachments-fixture.cjs','utf8');
source=source.replace("width:320,height:260,canvasWidth:320,canvasHeight:260", "width:96,height:288,canvasWidth:180,canvasHeight:540");
const at=source.indexOf(" if(p==='/api/config')");if(at<0)throw Error('Fixture boundary missing');
source=source.slice(0,at)+`
 if(p==='/demos/suite-demo/suppl-src.png'||p==='/api/download'||p==='/__fixture/long.png'){res.writeHead(200,{'content-type':'image/png'});res.end(fs.readFileSync('output/canvas-key-frame-long-image-20261021/reference.png'));return;}
 if(p==='/api/imagegen/inputs'){
  const form=await new Request('http://fixture',{method:'POST',headers:{'content-type':req.headers['content-type']},body:raw}).formData();const file=form.get('image');
  state.inputs||=[];const id='asset-'+crypto.randomUUID();state.inputs.push({id,bytes:file.size});return json(res,{artworkId:id,url:'http://127.0.0.1:'+port+'/__fixture/long.png',width:96,height:288});
 }
 if(p==='/api/imagegen/plan'){state.plans||=[];state.plans.push(body);return json(res,{request:body,steps:[{operation:'edit'}],intent:{background:null},totalCredits:0,billingVersion:1,modelVersion:1,warnings:[],confirmationRequired:false});}
 if(p==='/api/imagegen'&&req.method==='POST'){
  state.generations||=[];state.generations.push(body);const id='adaptive-result-'+state.generations.length;
  arts.push({...art,id,title:'自适应结果',parentId:'attachment-root',source:'derived',ratio:body.parameters.ratio,width:96,height:288,canvasX:900});return json(res,{jobId:id});
 }
 if(p==='/api/generate-image'&&req.method==='GET'){
  const result=arts.find(a=>a.id===u.searchParams.get('job'));return json(res,{status:'done',images:result?[{id:result.id,url:result.image,width:96,height:288}]:[],user});
 }
`+source.slice(at);
const m=new Module(path.resolve('scripts/.canvas-adaptive-fixture.cjs'),module);m.filename=path.resolve('scripts/.canvas-adaptive-fixture.cjs');m.paths=module.paths;m._compile(source,m.filename);
