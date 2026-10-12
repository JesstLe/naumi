import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=fs.readFileSync('src/lib/media-url.ts','utf8');
const helper=ts.transpileModule(code.replace('export function','function'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const accepted=['/media/canvas-uploads/one.png','https://supplier.test/one.png','http://fixture.test/one.png'],denied=['','canvas-add','workflow-placeholder','data:image/png;base64,x','blob:fixture','javascript:alert(1)','//supplier.test/x','/not-media/x.png',null];
const ctx=vm.createContext({});vm.runInContext(helper+';globalThis.check=isHostedImageUrl;',ctx);
for(const url of accepted)assert.equal(ctx.check(url),true);for(const url of denied)assert.equal(ctx.check(url),false);
const fixtures=['src/components/admin/admin-artworks.tsx','src/components/admin/admin-settings.tsx'];
for(const file of fixtures){
 const source=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,source,99,true,4);const functions=[];
 function walk(n){if(ts.isFunctionDeclaration(n)&&['regenHref','artworkToolHref','workHref','isCanvasOrigin'].includes(n.name?.text))functions.push(n.getText(sf));ts.forEachChild(n,walk);}walk(sf);
 const context=vm.createContext({URLSearchParams,isHostedImageUrl:ctx.check,isCutout:a=>a.category==='cutout',isFusion:a=>a.category==='fusion',...Object.fromEntries(['isVariation','isUpscale','isInpaint','isPrint','isAvatar','isStyle','isGarment','isPrintfile','isTryon','isDress3d','isPackaging3d','isDewrinkle','artIsCutout','artIsFusion'].map(n=>[n,()=>false]))});
 vm.runInContext(ts.transpileModule(functions.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const artwork={id:'local',status:'completed',category:'main',prompt:'fixture',image:'/media/one.png',source:'/media/input.png'};
 for(const name of ['regenHref','artworkToolHref'])if(context[name]){const url=new URL(context[name](artwork),'http://fixture.test');assert.equal(url.searchParams.get('gen'),artwork.image);assert.equal(url.searchParams.get('src'),artwork.source);assert.equal(new URL(context[name]({...artwork,status:'pending'}),'http://fixture.test').searchParams.get('gen'),null);}
 if(context.workHref){assert.equal(new URL(context.workHref({...artwork,category:'cutout'}),'http://fixture.test').searchParams.get('view'),artwork.image);assert.equal(context.workHref({...artwork,origin:'canvas'}),'/canvas?node=local');}
}
console.log('LOCAL_MEDIA_UI=PASS LOCAL_REMOTE=SUPPORTED INVALID_SCHEMES=REJECTED ADMIN_REGEN_REFERENCES=RETAINED ADMIN_TOOL_VIEW=RETAINED');
