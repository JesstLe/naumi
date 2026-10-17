import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

export const NODE_IMAGE='node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f';
export const POSTGRES_IMAGE='postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685';
export const serviceRoot=fileURLToPath(new URL('.',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}':JSON.stringify(v);
export async function buildLinux({output,allowDevelopment=false}={}) {
  const out=resolve(output||join(serviceRoot,'output/linux-build'));
  await mkdir(out,{recursive:true});
  execFileSync(process.execPath,['build.mjs'],{cwd:serviceRoot,stdio:'inherit'});
  const dist=join(serviceRoot,'dist'),manifest=JSON.parse(await readFile(join(dist,'manifest.json'),'utf8'));
  assert(allowDevelopment||(!manifest.sourceDirty&&/^[a-f0-9]{40}$/.test(manifest.gitRevision)),'LINUX_CLEAN_RELEASE_REQUIRED');
  const {releaseId,...payload}=manifest;assert.equal(releaseId,hash(stable(payload)));
  assert.equal(manifest.productSha256,hash(await readFile(join(serviceRoot,'../../design/enterprise-demo/preview.html'))));
  // Only enumerated public artifacts enter the build context; never the repository or local data.
  const context=await mkdtemp(join(out,'context-'+releaseId.slice(0,16)+'-'));await mkdir(join(context,'dist'),{recursive:true});
  for(const [name,digest]of Object.entries(manifest.files)) {
    assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(name));
    const bytes=await readFile(join(dist,name));assert.equal(hash(bytes),digest);
    await writeFile(join(context,'dist',name),bytes);
  }
  await copyFile(join(dist,'manifest.json'),join(context,'dist/manifest.json'));
  for(const name of ['package.json','package-lock.json']) {
    const b=await readFile(join(serviceRoot,name));assert.equal(hash(b),manifest.files['runtime-'+name]);await writeFile(join(context,name),b);
  }
  for(const name of ['Dockerfile','healthcheck.mjs'])await copyFile(join(serviceRoot,'deploy/linux',name),join(context,name));
  const image='naumi-enterprise-runtime:'+releaseId.slice(0,16);
  execFileSync('docker',['build','--platform','linux/amd64','--build-arg','NODE_IMAGE='+NODE_IMAGE,'--build-arg','RELEASE_ID='+releaseId,'--build-arg','GIT_REVISION='+(manifest.gitRevision||'development'),'--tag',image,context],{cwd:serviceRoot,stdio:'inherit',timeout:600000});
  const inspection=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8'}))[0];
  assert.equal(inspection.Config.User,'1000:1000');assert.equal(inspection.Config.Labels['org.naumi.workflow.release'],releaseId);
  assert.equal(inspection.Os,'linux');assert.equal(inspection.Architecture,'amd64');
  const report={image,imageId:inspection.Id,nodeImage:NODE_IMAGE,postgresTestImage:POSTGRES_IMAGE,releaseId,gitRevision:manifest.gitRevision,sourceDirty:manifest.sourceDirty,productSha256:manifest.productSha256,context,platform:'linux/amd64',user:inspection.Config.User};
  await writeFile(join(out,'LINUX_BUILD.json'),JSON.stringify(report,null,2));
  console.log('LINUX_BUILD_PASS: fixed_base=1 minimal_context=1 nonroot=1 platform=linux/amd64 source_dirty='+Number(manifest.sourceDirty));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { const args=process.argv.slice(2);assert(args.every((v,i)=>i%2?true:['--output','--allow-development'].includes(v))&&args.length%2===0);const opt=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2],args[i*2+1]]));assert(!opt['--allow-development']||opt['--allow-development']==='true');await buildLinux({output:opt['--output'],allowDevelopment:opt['--allow-development']==='true'}); }
  catch(e){console.error('LINUX_BUILD_FAILED: '+e.message);process.exitCode=1;}
}
