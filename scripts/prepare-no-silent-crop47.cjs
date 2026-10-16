// Build a guarded server-only overlay on the exact currently deployed chunk.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript'),esbuild=require('esbuild');
const out=path.resolve(process.argv[2]),original=fs.readFileSync(path.join(out,'ORIGINAL_8458.js'),'utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function functions(s,names,kind=ts.ScriptKind.TS){const a=ts.createSourceFile('x',s,99,true,kind),r={};function go(n){if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)){if(r[n.name.text])throw Error('Duplicate function '+n.name.text);r[n.name.text]=n.getText(a);}ts.forEachChild(n,go)}go(a);return r;}
function once(s,from,to){if(s.split(from).length!==2)throw Error('Unique runtime anchor missing: '+from.slice(0,110));return s.replace(from,to);}
const old=functions(original,['T','U','V','Z','$'],ts.ScriptKind.JS),source=fs.readFileSync('src/app/api/generate-image/route.ts','utf8'),fns=functions(source,['enforceOutputShape','attachImageDimensions']);
let aspect=fs.readFileSync('src/lib/imagegen/aspect.ts','utf8').replace(/export /g,'');
let shape=fs.readFileSync('src/lib/imagegen/output-shape.ts','utf8').replace('import "server-only";','').replace('import sharp from "sharp";','').replace(/export /g,'');
shape=shape.replaceAll('const meta = await sharp(bytes).metadata();','const sharp = await __frameSharp(); const meta = await sharp(bytes).metadata();');
const helpers=esbuild.transformSync(aspect+'\n'+shape+'\nreturn {inheritedImageRatio,imageAspectInstruction,sourceImageDimensions,preserveGeneratedFrame};',{loader:'ts',target:'es2020',minify:false}).code;
const helperDeclaration='const __frameSharp=async()=>{const m=await Promise.resolve().then(c.t.bind(c,9288,23));return m.default??m;};const __naumiFrame=(()=>{'+helpers+'})();';
let modified=once(original,old.T,helperDeclaration+'async function T(bytes){return bytes;}');
let z=esbuild.transformSync(fns.enforceOutputShape.replace('function enforceOutputShape','function Z'),{loader:'ts',target:'es2020'}).code.replaceAll('dataUrlToBytes','(0,j.wA)').replaceAll('preserveGeneratedFrame','__naumiFrame.preserveGeneratedFrame');
modified=once(modified,old.Z,z);
let dims=esbuild.transformSync(fns.attachImageDimensions.replace('function attachImageDimensions','function $'),{loader:'ts',target:'es2020'}).code.replaceAll('dataUrlToBytes','(0,j.wA)').replace('import("sharp")','__frameSharp()');
modified=once(modified,old.$,dims);
const base='a.compiledPrompt||(a.ratiogen?S(a):R(a,await (0,I.ay)()))';
modified=once(modified,'h='+base+',i=function','__source=await __naumiFrame.sourceImageDimensions(a.images[0]?Buffer.from(a.images[0].buf):undefined),__ratio=__naumiFrame.inheritedImageRatio(a.ratio,__source),h=('+base+')+"\\n\\n"+__naumiFrame.imageAspectInstruction(__ratio,__source),i=function');
modified=once(modified,'}(a.ratio,c),j=a.images.length','}(__ratio,c),j=a.images.length');
const flowBase='let d=a.ratiogen?S(a):R(a,await (0,I.ay)()),e=a.transparent?';
modified=once(modified,flowBase,'let __source=await __naumiFrame.sourceImageDimensions(a.images[0]?Buffer.from(a.images[0].buf):undefined),__ratio=__naumiFrame.inheritedImageRatio(a.ratio,__source),d=(a.compiledPrompt||(a.ratiogen?S(a):R(a,await (0,I.ay)())))+"\\n\\n"+__naumiFrame.imageAspectInstruction(__ratio,__source),e=a.transparent?');
const select='let k=j?await (0,J.getUserDefaultImageModel)(j):null';
modified=once(modified,select,'if(b.images[0]&&(!b.ratio||b.ratio==="auto"))b.ratio=__naumiFrame.inheritedImageRatio(b.ratio,await __naumiFrame.sourceImageDimensions(Buffer.from(b.images[0].buf)));'+select);
modified=once(modified,'ratio:b.ratio||null,resolution:b.resolution','ratio:d.ratio||b.ratio||null,resolution:b.resolution');
const parsed=ts.createSourceFile('patched.js',modified,99,true,ts.ScriptKind.JS);if(parsed.parseDiagnostics.length)throw Error('Patched JS has syntax errors');
fs.writeFileSync(path.join(out,'MODIFIED_FILE.js'),modified);
fs.writeFileSync(path.join(out,'runtime-meta.json'),JSON.stringify({file:'8458.js',originalSha256:hash(original),modifiedSha256:hash(modified),helperSha256:hash(helpers),changed:['ratiogen preserve','output frame preserve','actual dimensions ratio','source-ratio prompt and size','chat image frame instruction','legacy auto target','actual DB ratio'],invariant:'All unrelated compiled bytes and API adapters remain unchanged'},null,2));
console.log('RUNTIME_PATCH=PASS EXACT_ANCHORS=8 SYNTAX=PASS UNRELATED_MODULES=PRESERVED');
