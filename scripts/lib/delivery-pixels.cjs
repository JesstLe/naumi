// Test adapter for historical array-shaped assertions. Every transform/metadata
// decision runs the current source owner; no production pixel algorithm lives here.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),sharp=require('sharp');
module.exports=function deliveryPixels(root=process.cwd()){
 const extract=(file,name)=>{const source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,99,true);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast).replace(/^export /,'');};
 const code=[extract('src/lib/imagegen/output-shape.ts','preserveGeneratedFrame'),extract('src/lib/imagegen/finish-stored-image.ts','finishStoredImage'),extract('src/lib/imagegen/output-shape.ts','sourceImageDimensions')].join('\n');
 const ctx={sharp,Buffer};vm.createContext(ctx);vm.runInContext(ts.transpileModule(code+'\nglobalThis.pixel={finishStoredImage,sourceImageDimensions};',{compilerOptions:{module:1,target:9}}).outputText,ctx);
 return {
  enforceOutputShape:async(images,p)=>{if(!(p.targetWidth>0&&p.targetHeight>0))return images;return Promise.all(images.map(async im=>({...im,url:'data:image/png;base64,'+(await ctx.pixel.finishStoredImage(Buffer.from(im.url.split(',')[1],'base64'),{...p,final:false,preset:true})).toString('base64')})));},
  attachImageDimensions:async images=>Promise.all(images.map(async im=>{const {width,height}=await ctx.pixel.sourceImageDimensions(Buffer.from(im.url.split(',')[1],'base64'));const gcd=(a,b)=>b?gcd(b,a%b):a;return {...im,width,height,ratio:`${width/gcd(width,height)}:${height/gcd(width,height)}`};})),
 };
};
