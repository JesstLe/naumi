/** Deterministic actual-module compatibility checks; real pixel/browser coverage is separate. */
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),sharp=require('sharp');
async function main(){const file=process.argv[2]||'src/lib/browser-reference-image.ts',baseline=process.argv.includes('--baseline'),exp={};let rejectBitmap=false,absentBitmap=false,bitmapCalls=0,domCalls=0,created=0,revoked=0,closed=0;
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const policy={};vm.runInNewContext(compile('src/lib/image-upload-policy.ts'),{exports:policy,Math});
const native=async(file,options)=>{bitmapCalls++;if(options?.imageOrientation==='from-image')throw new TypeError("The provided value 'from-image' is not a valid enum value of type ImageOrientation.");if(rejectBitmap)throw new DOMException('fixture decode failure','NotSupportedError');const h=await exp.browserImageHeader(file);return{width:h.width,height:h.height,close(){closed++;}};};
class Image{src='';naturalWidth=80;naturalHeight=120;async decode(){domCalls++;}}
const ctx={exports:exp,require:n=>{assert.equal(n,'./image-upload-policy');return policy;},File,Blob,DataView,Uint8Array,Math,Error,URL:{createObjectURL(){created++;return'blob:fixture';},revokeObjectURL(){revoked++;}},Image,document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:(fn,type)=>fn(new Blob(['preview-fixture'],{type}))})},createImageBitmap:native};vm.createContext(ctx);vm.runInContext(compile(file),ctx);
const png=new File([await sharp({create:{width:80,height:120,channels:4,background:{r:1,g:2,b:3,alpha:.5}}}).png().toBuffer()],'actual.png',{type:'image/png'}),before=Buffer.from(await png.arrayBuffer());
if(baseline){await assert.rejects(exp.prepareOriginalImage(png),/not a valid enum/);assert.equal(domCalls,0);console.log('BITMAP_BASELINE=REPRODUCED ENUM_REJECTED=TRUE UPLOAD_PREVIEW_FAILED=TRUE DOM_FALLBACK=0');return;}
let p=await exp.prepareOriginalImage(png);assert.equal(p.width,80);assert.equal(p.height,120);assert(p.thumbnail.size);assert.equal(closed,1);assert.equal(domCalls,0);
rejectBitmap=true;p=await exp.prepareOriginalImage(png);assert.equal(p.width,80);assert.equal(p.height,120);assert.equal(domCalls,1);assert.equal(created,1);assert.equal(revoked,1);
ctx.createImageBitmap=undefined;p=await exp.prepareOriginalImage(png);assert.equal(p.width,80);assert.equal(domCalls,2);assert.equal(revoked,2);
assert.deepEqual(Buffer.from(await png.arrayBuffer()),before);await assert.rejects(exp.prepareOriginalImage(new File(['bad'],'bad.png')),/格式或尺寸/);
console.log('BITMAP_MODIFIED=PASS DEFAULT_OPTIONS=TRUE BITMAP_REJECTION_DOM=TRUE ABSENT_BITMAP_DOM=TRUE URL_CLEANUP=TRUE ORIGINAL_UNCHANGED=TRUE CORRUPT_REJECTED=TRUE');}
main().catch(e=>{console.error(e);process.exitCode=1;});
