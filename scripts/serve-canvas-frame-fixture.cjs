// Reuse the actual CanvasClient fixture, replacing only local images/HTTP data.
// No DB, production host, worker or supplier is involved.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),sharp=require('sharp');
(async()=>{
  const dir=path.resolve('output/multi-reference-frame-20261020');fs.mkdirSync(dir,{recursive:true});
  for(const [name,width,height,color] of [['square',160,160,'#dbeafe'],['portrait',150,200,'#fce7f3'],['landscape',200,150,'#dcfce7']])
    await sharp({create:{width,height,channels:3,background:color}}).png().toFile(path.join(dir,name+'.png'));
  const file=path.resolve('scripts/serve-canvas-unified-dock-fixture.cjs');let source=fs.readFileSync(file,'utf8');
  const replace=(from,to)=>{if(!source.includes(from))throw Error('fixture source drift: '+from.slice(0,80));source=source.replace(from,to);};
  replace("const image='http://127.0.0.1:'+port+'/demos/suite-demo/suppl-src.png';","const image='http://127.0.0.1:'+port+'/__fixture/frame-square.png';const portrait='http://127.0.0.1:'+port+'/__fixture/frame-portrait.png',landscape='http://127.0.0.1:'+port+'/__fixture/frame-landscape.png';");
  replace("const arts=[art,{...art,id:'placement-second',title:'邻近图片',parentId:art.id,canvasX:1100,canvasY:600}];","const arts=[{...art,width:160,height:160,canvasWidth:320,canvasHeight:320},{...art,id:'placement-second',title:'竖版参考',image:portrait,width:150,height:200,canvasWidth:240,canvasHeight:320,parentId:art.id,canvasX:1100,canvasY:600},{...art,id:'placement-third',title:'横版参考',image:landscape,width:200,height:150,canvasWidth:320,canvasHeight:240,parentId:art.id,canvasX:1450,canvasY:600}];");
  replace("const art={id:'placement-root',","const art={canvasGroupId:'fixture-reference-group',id:'placement-root',");
  replace("ratios:['auto','1:1','3:4']","ratios:['auto','1:1','3:4','4:3']");
  replace("const app=cp.spawn", "Object.assign(state,{frameUploads:0,framePlans:[],frameMode:'mixed'});\nconst app=cp.spawn");
  replace("if(p==='/__fixture/state')",`if(p.startsWith('/__fixture/frame-')&&p.endsWith('.png')||p==='/api/download'&&String(u.searchParams.get('u')).includes('/__fixture/frame-')){
   const name=(p==='/api/download'?new URL(u.searchParams.get('u')).pathname:p).match(/frame-(square|portrait|landscape)/)[1];res.writeHead(200,{'content-type':'image/png'});return res.end(fs.readFileSync(require('node:path').resolve('output/multi-reference-frame-20261020/'+name+'.png')));
 }
 if(p==='/__fixture/frame-mode'){state.frameMode=u.searchParams.get('mode');state.frameUploads=0;state.framePlans=[];return json(res,{ok:true});}
 if(p==='/__fixture/state')`);
  replace("if(p==='/api/imagegen/inputs')return json(res,{artworkId:'asset-fixture',url:image,width:320,height:260});", "if(p==='/api/imagegen/inputs'){const n=++state.frameUploads,index=(n-1)%3;return json(res,{artworkId:'asset-frame-'+n,url:index===0?image:index===1||state.frameMode==='same'?portrait:landscape,width:index===0?160:index===1||state.frameMode==='same'?150:200,height:index===0?160:index===1||state.frameMode==='same'?200:150});}");
  replace("if(p==='/api/imagegen/plan')return json", "if(p==='/api/imagegen/plan')state.framePlans.push(body);\n  if(p==='/api/imagegen/plan')return json");
  const fixture=new Module(file,module);fixture.filename=file;fixture.paths=module.paths;fixture._compile(source,file);
})().catch(error=>{console.error(error);process.exitCode=1;});
