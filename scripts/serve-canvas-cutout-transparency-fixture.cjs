// Reuse the actual Canvas Next fixture and replace only local HTTP I/O ports.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{build}=require('esbuild'),sharp=require('sharp');
const {loadCutoutFixture}=require('./cutout-transparency-fixture.cjs');
(async()=>{
 process.env.FIXTURE_PORT||='14957';process.env.FIXTURE_DIST||='.next-cutout-transparent';process.env.FIXTURE_OUT||='output/cutout-transparent/browser';
 const result=await build({stdin:{contents:`import {fixtureModelConfig} from './scripts/model-config-unit-fixture';import {publicModelCatalog} from './src/lib/model-config/public-catalog';export function catalog(disabled){const config=fixtureModelConfig('https://fixture.invalid','fixture-credential');config.publicModels[0].toolScope={features:['canvas.image'],defaultFor:[]};config.upstreamModels[0].capabilities.transparent=true;config.publicModels.push({id:'image-cutout-verified',label:'Internal cutout',modality:'image',visible:false,enabled:!disabled,target:{type:'upstream',id:'u1'},toolScope:{features:['tool.cutout'],defaultFor:[]}});config.bindings['image.cutout']='image-cutout-verified';return publicModelCatalog({version:1,digest:'fixture',config},'image','tool.cutout')}`,resolveDir:process.cwd()},bundle:true,format:'cjs',platform:'node',packages:'external',write:false,plugins:[{name:'server-only-test',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:''}))}}]});
 const m=new Module(path.resolve('scripts/.cutout-catalog.cjs'));m.filename=path.resolve('scripts/.cutout-catalog.cjs');m.paths=module.paths;m._compile(result.outputFiles[0].text,m.filename);
 const owner=await loadCutoutFixture();const valid=await sharp({create:{width:128,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:64,height:80,channels:4,background:'#315c50'}}).png().toBuffer(),left:32,top:24}]).png().toBuffer();
 const invalid=await sharp({create:{width:128,height:128,channels:4,background:{r:220,g:220,b:220,alpha:254/255}}}).png().toBuffer();
 globalThis.__canvasCutoutFixture={owner,valid,invalid,catalog:m.exports.catalog};
 let source=fs.readFileSync('scripts/serve-agent-chat-attachments-fixture.cjs','utf8');
 source="const cutoutFixture=globalThis.__canvasCutoutFixture;\n"+source;
 const at=source.indexOf(" if(p==='/api/config')");if(at<0)throw Error('Existing fixture boundary changed');
 source=source.slice(0,at)+`
 if(p==='/__cutout/reset'){arts.splice(0,arts.length,art,{...art,id:'other-project',groupId:'other-project',title:'另一项目',canvasX:0,canvasY:0});state.cutouts=[];state.quotes=[];state.history=[];return json(res,{ok:true});}
 if(p==='/__cutout/control'){state.cutoutMode=u.searchParams.get('mode')||'hidden';return json(res,{ok:true});}
 if(p==='/api/canvas/workflow-import')return json(res,{manifests:[]});
 if(p==='/api/canvas/image-prompts')return json(res,{document:req.method==='GET'?null:body.document,revision:req.method==='GET'?0:(body.expectedRevision||0)+1,workspace:'personal',persisted:true});
 if(p==='/api/models'&&u.searchParams.get('feature')==='tool.cutout')return json(res,state.cutoutMode==='legacy'?{managed:true,supported:false,available:true,models:[]}:{managed:true,supported:true,...cutoutFixture.catalog(state.cutoutMode==='disabled')});
 if(p==='/api/download'){const url=u.searchParams.get('url')||'';res.writeHead(200,{'content-type':'image/png'});return res.end(url.includes('/cutout-result.png')?cutoutFixture.valid:fs.readFileSync('public/demos/suite-demo/suppl-src.png'));}
 if(p==='/cutout-result.png'){res.writeHead(200,{'content-type':'image/png'});return res.end(cutoutFixture.valid);}
 if(p==='/api/cutout'){
  const f=await new Request('http://fixture',{method:'POST',headers:{'content-type':req.headers['content-type']},body:raw}).formData(),image=f.get('image');state.cutouts||=[];
  state.cutouts.push({quality:f.get('quality'),headerQuality:req.headers['x-naumi-image-quality'],parentId:f.get('parentId'),operationId:req.headers['x-naumi-billing-operation-id'],imageHash:crypto.createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex')});
  const result=await cutoutFixture.owner.execute(state.cutoutMode==='invalid'?cutoutFixture.invalid:cutoutFixture.valid);
  if(result.status!==200)return json(res,result.body,result.status);
  const id=result.body.id,url='http://127.0.0.1:'+port+'/cutout-result.png';arts.push({...art,id,title:'透明抠图结果',parentId:String(f.get('parentId')),groupId:'attachment-root',image:url,canvasX:900});return json(res,{...result.body,id,url,user});
 }
 `+source.slice(at);
 source=source.replace("if(p==='/api/billing/quote')return json(res,","if(p==='/api/billing/quote'){state.quotes||=[];state.quotes.push(body);return json(res,").replace('reserveCredits:0,version:1});','reserveCredits:0,version:1});}');
 const fixture=new Module(path.resolve('scripts/.canvas-cutout-transparent-fixture.cjs'),module);fixture.filename=path.resolve('scripts/.canvas-cutout-transparent-fixture.cjs');fixture.paths=module.paths;fixture._compile(source,fixture.filename);
})().catch(e=>{console.error(e);process.exitCode=1});
