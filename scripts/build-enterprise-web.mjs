import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
export const WEB_NODE_IMAGE='node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20';
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
export async function buildEnterpriseWeb({output,allowDevelopment=false}={}){
 const out=resolve(output||join(root,'output/enterprise-web-build'));await mkdir(out,{recursive:true});
 const revision=git('rev-parse','HEAD'),dirty=!!git('status','--porcelain');assert(allowDevelopment||!dirty,'CLEAN_WEB_SOURCE_REQUIRED');
 const context=await mkdtemp(join(out,'context-')),names=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),hash=createHash('sha256');
 for(const name of [...new Set(names)].sort()){
  if(/(^|\/)\.env(?:\.|$)/.test(name)||/^(output|data|node_modules|\.git)\//.test(name))continue;
  assert(!name.startsWith('/')&&!name.split('/').includes('..'));
  const bytes=await readFile(join(root,name));hash.update(name+'\0').update(bytes);await mkdir(dirname(join(context,name)),{recursive:true});await writeFile(join(context,name),bytes);
 }
 const sourceHash=hash.digest('hex'),productSha256=createHash('sha256').update(await readFile(join(context,'design/enterprise-demo/preview.html'))).digest('hex'),buildVersion=git('show','-s','--format=%ct','HEAD');
 const image='naumi-enterprise-web:'+revision.slice(0,12)+(dirty?'-dev-'+sourceHash.slice(0,8):''),depsImage='naumi-enterprise-web-deps:'+createHash('sha256').update(WEB_NODE_IMAGE).update(await readFile(join(context,'package-lock.json'))).update(await readFile(join(context,'scripts/patch-next-body.mjs'))).digest('hex').slice(0,16);
 const common=['build','--platform','linux/amd64','--build-arg','NODE_BASE_IMAGE='+WEB_NODE_IMAGE];
 execFileSync('docker',[...common,'--target','deps','--tag',depsImage,context],{stdio:'inherit',timeout:600000});
 execFileSync('docker',[...common,'--build-arg','SOURCE_COMMIT='+revision,'--build-arg','BUILD_VERSION='+buildVersion,'--build-arg','BUILD_NODE_OPTIONS=--max-old-space-size=6144','--build-arg','NAUMI_BUILD_CPUS=2','--label','org.naumi.web.git-revision='+revision,'--label','org.naumi.web.source-hash='+sourceHash,'--label','org.naumi.web.product-sha256='+productSha256,'--label','org.naumi.web.source-dirty='+Number(dirty),'--tag',image,context],{stdio:'inherit',timeout:1200000});
 const inspected=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8'}))[0],depsId=execFileSync('docker',['image','inspect',depsImage,'--format','{{.Id}}'],{encoding:'utf8'}).trim();
 assert.equal(inspected.Os,'linux');assert.equal(inspected.Architecture,'amd64');assert.equal(inspected.Config.User,'nextjs');assert(inspected.Config.Env.includes('SOURCE_COMMIT='+revision));assert.equal(inspected.Config.Labels['org.naumi.web.product-sha256'],productSha256);
 const report={image,imageId:inspected.Id,depsImage,depsId,nodeImage:WEB_NODE_IMAGE,gitRevision:revision,sourceDirty:dirty,sourceHash,productSha256,buildVersion,context,recipe:'repository Dockerfile; complete standalone Web and media runtime',platform:'linux/amd64'};
 await writeFile(join(out,'WEB_BUILD.json'),JSON.stringify(report,null,2));console.log('WEB_BUILD_PASS: complete_repository_dockerfile=1 standalone=1 pinned_node=1 nonroot=1 source_dirty='+Number(dirty));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);assert(args.length%2===0&&args.every((v,i)=>i%2||['--output','--allow-development'].includes(v)));const options=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2],args[i*2+1]]));assert(!options['--allow-development']||options['--allow-development']==='true');await buildEnterpriseWeb({output:options['--output'],allowDevelopment:options['--allow-development']==='true'});}catch(e){console.error('WEB_BUILD_FAILED: '+e.message);process.exitCode=1;}
}
