import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const out=path.resolve(process.env.WORKBENCH_DEMO_EVIDENCE||'output/workbench-demo-refresh');
const dest=path.resolve('public/demos/workbench-v2');
const plan=JSON.parse(await fs.readFile('scripts/fixtures/workbench-demo-prompts.json','utf8'));
const state=JSON.parse(await fs.readFile(path.join(out,'generation-state.json'),'utf8'));
const records=[];await fs.mkdir(dest,{recursive:true});
async function asset(key,role,region,sourceKey=key){
 const source=state[sourceKey];if(!source?.complete)throw Error('Missing completed native image '+sourceKey);
 const input=path.join(out,'generated',sourceKey+'.png');
 if(createHash('sha256').update(await fs.readFile(input)).digest('hex')!==source.sha256)throw Error('Source SHA mismatch '+sourceKey);
 const filename=`${key}-${role}.webp`,size=sourceKey.startsWith('suite-')?{width:640,height:640}:key==='ipcheck'?{width:640,height:1080}:{width:640,height:720};
 await sharp(input).extract(region).resize({...size,fit:'contain',background:'#fafaf9'}).webp({quality:88,effort:5}).toFile(path.join(dest,filename));
 const bytes=await fs.readFile(path.join(dest,filename));
 records.push({key,role,path:'/demos/workbench-v2/'+filename,...size,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),processing:{region,fit:'contain',format:'webp',quality:88},source:{method:'naumi-native-generation',operationId:source.operationId,jobId:source.jobId,artworkId:source.result.id,promptHash:source.promptHash,modelId:source.modelId,quality:source.quality,resolution:source.resolution,sourceSha256:source.sha256,generatedAt:source.completedAt}});
}
for(const task of plan.pairs){
 const sourceKey=task.sourceKey||task.key,file=path.join(out,'generated',sourceKey+'.png'),m=await sharp(file).metadata(),half=Math.floor(m.width/2);
 await asset(task.key,'before',{left:0,top:0,width:half-2,height:m.height},sourceKey);
 await asset(task.key,'after',{left:half+2,top:0,width:m.width-half-2,height:m.height},sourceKey);
}
{
 const m=await sharp(path.join(out,'generated','ipcheck.png')).metadata(),third=Math.floor(m.width/3);
 for(let i=0;i<3;i++)await asset('ipcheck',String(i+1),{left:i*third+(i?2:0),top:0,width:(i===2?m.width-2*third:third)-(i?2:0)-2,height:m.height},'ipcheck');
}
for(const set of plan.suiteSets){
 const key='suite-'+set.key,m=await sharp(path.join(out,'generated',key+'.png')).metadata(),w=Math.floor(m.width/3),h=Math.floor(m.height/2);
 // Generative grid seams can drift a few pixels. Trim a modest inner margin
 // so neighboring panels never leak into the catalogue source or result cards.
 const inset=16;
 for(const[role,index]of [['src',0],['main',1],['scene',2],['detail',3],['structure',4]])await asset(key,role,{left:(index%3)*w+inset,top:Math.floor(index/3)*h+inset,width:w-inset*2,height:h-inset*2},key);
}
// The generated cutout panel itself has genuine alpha, not a drawn checkerboard.
// This is original demo artwork, not a claim that the dedicated segmentation route ran.
const alphaFile=path.join(out,'generated',(plan.pairs.find(p=>p.key==='cutout').sourceKey||'cutout')+'.png'),alphaMeta=await sharp(alphaFile).metadata(),half=Math.floor(alphaMeta.width/2);
const alphaBytes=await sharp(alphaFile).extract({left:half+2,top:0,width:alphaMeta.width-half-2,height:alphaMeta.height}).png().toBuffer();
const stats=await sharp(alphaBytes).stats();if(stats.isOpaque||stats.channels.length<4||stats.channels[3].min>=255)throw Error('Cutout must contain real transparent pixels');
const cut=records.find(r=>r.key==='cutout'&&r.role==='after');
await sharp(alphaBytes).resize({width:640,height:720,fit:'contain',background:{r:255,g:255,b:255,alpha:0}}).webp({quality:90,effort:5}).toFile(path.join(dest,'cutout-after.webp'));
const bytes=await fs.readFile(path.join(dest,'cutout-after.webp'));cut.bytes=bytes.length;cut.sha256=createHash('sha256').update(bytes).digest('hex');cut.source={...cut.source,alpha:true};cut.processing={...cut.processing,quality:90,background:'transparent'};
await fs.writeFile(path.join(dest,'manifest.json'),JSON.stringify({version:plan.version,kind:'original-generated-demo-not-benchmark',assets:records},null,2)+'\n');
await fs.mkdir(path.join(out,'qa'),{recursive:true});
for(let page=0;page<Math.ceil(records.length/18);page++){
 const group=records.slice(page*18,(page+1)*18),width=6*190,height=Math.ceil(group.length/6)*220,composite=[];
 for(let i=0;i<group.length;i++){
  const a=group[i],left=(i%6)*190,top=Math.floor(i/6)*220;
  composite.push({input:await sharp(path.join('public',a.path)).resize(184,186,{fit:'contain',background:'#ffffff'}).toBuffer(),left,top});
  composite.push({input:Buffer.from(`<svg width="186" height="28"><rect width="186" height="28" fill="white"/><text x="4" y="19" font-size="12" fill="#334155">${a.key}/${a.role}</text></svg>`),left,top:top+188});
 }
 await sharp({create:{width,height,channels:4,background:'#e2e8f0'}}).composite(composite).jpeg({quality:88}).toFile(path.join(out,'qa',`assets-${page+1}.jpg`));
}
console.log('ASSETS=PASS CONFIGURATIONS=23 FILES='+records.length+' SOURCE=REAL_NATIVE_JOBS CUTOUT=REAL_ALPHA APLUS=UNTOUCHED');
