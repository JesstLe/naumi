// Execute the real route's output expression, not a hand-written substitute.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),esbuild=require('esbuild'),sharp=require('sharp');
const root=path.resolve(process.argv[2]||'.'),mode=process.argv[3]||'modified',out=path.resolve(process.argv[4]||'output/canvas-edit-aspect');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/app/api/canvas/annotate/route.ts'),'utf8'),ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true),statements=[];
function visit(n){if(ts.isVariableDeclaration(n)&&['result','edited'].includes(n.name.getText(ast)))statements.push(`const ${n.name.getText(ast)}=${n.initializer.getText(ast)};`);ts.forEachChild(n,visit)}visit(ast);
assert.ok(statements.some(s=>s.startsWith('const edited=')));
let helper;
if(mode!=='baseline'){
 const result=esbuild.buildSync({entryPoints:[path.join(root,'src/lib/canvas/edited-image-output.ts')],bundle:true,platform:'node',format:'cjs',write:false,external:['server-only','sharp']});
 const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(id=>id==='server-only'?{}:id==='sharp'?sharp:require(id),module,module.exports);helper=module.exports.canvasEditedImage;
}
const body=ts.transpileModule(`return (async()=>{${statements.join('\n')}return edited;})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const actual=new Function('sharp','canvasEditedImage','editedRaw','width','height',body);
async function shape(bytes){const r=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let x0=Infinity,x1=-1,y0=Infinity,y1=-1;
 for(let y=0;y<r.info.height;y++)for(let x=0;x<r.info.width;x++){const i=(y*r.info.width+x)*4;if(r.data[i]>240&&r.data[i+1]<16&&r.data[i+2]<16&&r.data[i+3]>240){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}}
 return {width:x1-x0+1,height:y1-y0+1,aspect:(x1-x0+1)/(y1-y0+1)};
}
async function pixels(bytes){return sharp(bytes).rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true})}
async function main(){
 const input=await sharp(Buffer.from('<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1536" fill="white"/><circle cx="512" cy="768" r="200" fill="#ff0000"/></svg>')).png().toBuffer();
 const result=await actual(sharp,helper,input,1200,1600),circle=await shape(result),meta=await sharp(result).metadata();
 fs.writeFileSync(path.join(out,`${mode}-provider.png`),input);fs.writeFileSync(path.join(out,`${mode}-result.png`),result);
 if(mode==='baseline')assert.ok(circle.aspect>1.12&&circle.aspect<1.13);else{assert.ok(Math.abs(circle.aspect-1)<0.001);assert.deepEqual((await pixels(result)).data,(await pixels(input)).data);assert.equal(meta.width,1024);assert.equal(meta.height,1536);}
 console.log(`${mode.toUpperCase()}=${mode==='baseline'?'REPRODUCED':'PASS'} CIRCLE=${circle.width}x${circle.height} ASPECT=${circle.aspect.toFixed(4)} SIZE=${meta.width}x${meta.height}`);
 if(mode==='baseline')return;
 let checks=1;
 for(const [width,height] of [[1200,1600],[1600,900],[1024,1024],[180,900],[1400,600]]){
  const bytes=await sharp({create:{width,height,channels:4,background:{r:60,g:120,b:180,alpha:0.4}}}).png().toBuffer(),frozen=Buffer.from(bytes),normalized=await helper(bytes);
  assert.equal(normalized.width,width);assert.equal(normalized.height,height);assert.deepEqual((await pixels(normalized.bytes)).data,(await pixels(bytes)).data);assert.deepEqual(bytes,frozen);checks++;
 }
 const jpeg=await sharp(input).jpeg().withMetadata({orientation:6}).toBuffer(),rotated=await helper(jpeg);assert.equal(rotated.width,1536);assert.equal(rotated.height,1024);assert.equal(rotated.ratio,'3:2');assert.deepEqual((await pixels(rotated.bytes)).data,(await pixels(jpeg)).data);checks++;
 const rgba=await helper(await sharp({create:{width:213,height:317,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer());assert.equal((await pixels(rgba.bytes)).data[3],0);checks++;
 const wrong=Buffer.from('not an image');await assert.rejects(()=>helper(wrong));checks++;
 fs.writeFileSync(path.join(out,'PIXEL_RESULT.json'),JSON.stringify({checks,circle,output:{width:meta.width,height:meta.height},orientationNormalized:true,pixelsUnchanged:true},null,2));
 console.log(`PIXEL_CASES=PASS CASES=${checks} STRETCH=0 CROP=0 PADDING=0 ORIENTATION=PASS`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
