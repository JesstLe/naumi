const fs=require('node:fs'),path=require('node:path');
/** Source-based regressions follow the implementation, including pre-extraction roots. */
module.exports=function imageGenerationSource(root=process.cwd()){
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const route=read('src/app/api/generate-image/route.ts');
  if(!fs.existsSync(path.join(root,'src/lib/imagegen/generation-runtime.ts')))return route;
  return [route,...['generation-types','generation-prompt','generation-provider','generation-output','generation-runtime','generation-submission'].map(n=>read(`src/lib/imagegen/${n}.ts`).replace(/^export /gm,''))].join('\n');
};
