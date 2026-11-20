const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),sharp=require('sharp');
(async()=>{
 process.env.FIXTURE_PORT||='15085';process.env.FIXTURE_DIST||='.next-transparent-blend';process.env.FIXTURE_OUT||='output/canvas-transparent-blend/browser';
 const transparent=process.env.CANVAS_TRANSPARENT_SAMPLE?fs.readFileSync(process.env.CANVAS_TRANSPARENT_SAMPLE):await sharp({create:{width:240,height:400,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:100,height:280,channels:4,background:'#137b54'}}).png().toBuffer(),left:70,top:60}]).png().toBuffer();
 const metadata=await sharp(transparent).metadata();
 let source=fs.readFileSync('scripts/serve-agent-chat-attachments-fixture.cjs','utf8');
 const start=source.indexOf('const art='),end=source.indexOf('const arts=',start);if(start<0||end<0)throw Error('Existing fixture boundary changed');
 source=source.slice(0,start)+`const transparentFixture=globalThis.__transparentCanvasFixture;\nconst art={id:'attachment-root',title:'透明产品',category:'main',prompt:'去背景，保留主体',createdAt:now,status:'completed',image:'http://127.0.0.1:'+port+'/transparent-product.png',gradient:'',origin:'canvas',source:'canvas-add',groupId:'attachment-root',width:${metadata.width},height:${metadata.height},canvasWidth:225,canvasHeight:400,canvasX:500,canvasY:400,ratio:'9:16',resolution:'2K'};\n`+source.slice(end);
 source=source.replace("const arts=[art,", "const arts=[art,{...art,id:'opaque-example',title:'普通图片',image:'http://127.0.0.1:'+port+'/demos/suite-demo/suppl-src.png',width:320,height:260,canvasWidth:320,canvasHeight:260,canvasX:850,canvasY:400},");
 const at=source.indexOf(" if(p==='/api/config')");if(at<0)throw Error('Existing HTTP fixture boundary changed');
 source=source.slice(0,at)+`\n if(p==='/transparent-product.png'){res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'});return res.end(transparentFixture.bytes);}\n if(p==='/api/canvas/image-prompts')return json(res,{document:req.method==='GET'?null:body.document,revision:req.method==='GET'?0:(body.expectedRevision||0)+1,workspace:'personal',persisted:true});\n if(p==='/api/canvas/workflow-import')return json(res,{manifests:[]});\n`+source.slice(at);
 globalThis.__transparentCanvasFixture={bytes:transparent};
 const fixture=new Module(path.resolve('scripts/.canvas-transparent-fixture.cjs'),module);fixture.filename=path.resolve('scripts/.canvas-transparent-fixture.cjs');fixture.paths=module.paths;fixture._compile(source,fixture.filename);
})().catch(error=>{console.error(error);process.exitCode=1});
