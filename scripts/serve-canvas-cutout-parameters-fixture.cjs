const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
process.env.FIXTURE_PORT||='14941';process.env.FIXTURE_DIST||='.next-canvas-cutout-parameters';process.env.FIXTURE_OUT||='output/canvas-cutout-parameters-20261021/browser';
let source=fs.readFileSync('scripts/serve-agent-chat-attachments-fixture.cjs','utf8');
const at=source.indexOf(" if(p==='/api/config')");if(at<0)throw Error('Fixture boundary missing');
source=source.slice(0,at)+`
 if(p==='/api/download'){res.writeHead(200,{'content-type':'image/png'});res.end(fs.readFileSync('public/demos/suite-demo/suppl-src.png'));return;}
 if(p==='/api/cutout'){
  const form=await new Request('http://fixture',{method:'POST',headers:{'content-type':req.headers['content-type']},body:raw}).formData(),image=form.get('image');
  state.cutouts||=[];
  state.cutouts.push({quality:form.get('quality'),headerQuality:req.headers['x-naumi-image-quality'],parentId:form.get('parentId'),ratio:form.get('ratio'),resolution:form.get('resolution'),imageBytes:image.size,imageHash:crypto.createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex')});
  if(form.get('quality')!=='medium')return json(res,{error:'质量参数无效，请选择已开放的质量档位',code:'MODEL_INCOMPATIBLE'},400);
  const id='cut-fixture-'+state.cutouts.length;arts.push({...art,id,title:'透明结果',parentId:String(form.get('parentId')),source:'derived',image:art.image,canvasX:1000});return json(res,{ok:true,id,url:art.image,creditsUsed:1,user});
 }
`+source.slice(at);
source=source.replace("if(p==='/api/billing/quote')return json(res,", "if(p==='/api/billing/quote'){state.quotes||=[];state.quotes.push(body);return json(res,").replace("reserveCredits:0,version:1});", "reserveCredits:0,version:1});}");
const m=new Module(path.resolve('scripts/.canvas-cutout-parameters-fixture.cjs'),module);m.filename=path.resolve('scripts/.canvas-cutout-parameters-fixture.cjs');m.paths=module.paths;m._compile(source,m.filename);
