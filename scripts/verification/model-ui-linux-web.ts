import {spawn,spawnSync} from "node:child_process";
import {mkdir,readFile,writeFile,rm} from "node:fs/promises";
import path from "node:path";

/** Optional local Linux dev runtime using an existing SDK's dependency layer,
 * not its old application. Every current source byte and the dependency lock
 * are checked before Next starts; no Docker socket or host business data. */
export async function startModelUiLinuxWeb(image:string,runId:string,port:number,environment:Record<string,string>){
  if(!/^sha256:[a-f0-9]{64}$/.test(image)||!runId||!process.env.NAUMI_MODEL_UI_SOURCE_MANIFEST)throw Error("LINUX_UI_FIXED_IMAGE_AND_SOURCE_REQUIRED");
  const manifest=JSON.parse(await readFile(process.env.NAUMI_MODEL_UI_SOURCE_MANIFEST,"utf8"));
  const name="naumi-model-ui-dev-"+runId,envFile=path.resolve("output/model-config-ui-fixture/linux-web.env");await mkdir(path.dirname(envFile),{recursive:true});
  await writeFile(envFile,Object.entries({...environment,SOURCE_COMMIT:manifest.commit}).map(([key,value])=>{if(/[\r\n]/.test(value))throw Error("FIXTURE_ENV_NEWLINE");return key+"="+value;}).join("\n")+"\n",{mode:0o600});
  const bootstrap=`const fs=require('fs'),p=require('path'),c=require('crypto');const m=JSON.parse(fs.readFileSync('/current-source/output/model-ui-source.json'));const h=b=>c.createHash('sha256').update(b).digest('hex');if(h(fs.readFileSync('/app/package-lock.json'))!==m.hashes['package-lock.json'])throw Error('LINUX_UI_DEPENDENCY_LOCK_MISMATCH');const root='/tmp/current-model-ui';fs.mkdirSync(root,{recursive:true});for(const[n,expected]of Object.entries(m.hashes)){const dest=p.resolve(root,n);if(!dest.startsWith(root+'/'))throw Error('LINUX_UI_SOURCE_ESCAPE');const bytes=fs.readFileSync('/current-source/'+n);if(h(bytes)!==expected)throw Error('LINUX_UI_SOURCE_CHANGED:'+n);fs.mkdirSync(p.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}fs.symlinkSync('/app/node_modules',root+'/node_modules');console.log('LINUX_UI_SOURCE=PASS FILES='+Object.keys(m.hashes).length+' LOCK=EXACT NODE='+process.version);const child=require('child_process').spawn(process.execPath,['/app/node_modules/next/dist/bin/next','dev','-H','0.0.0.0','-p','3000'],{cwd:root,env:process.env,stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'));`;
  const child=spawn("docker",["run","--rm","--init","--name",name,"--label","naumi.task=model-ui-linux-dev","--label","naumi.ui.run="+runId,"--memory","3g","--cpus","2","--publish",`127.0.0.1:${port}:3000`,"--mount","type=bind,src="+process.cwd()+",dst=/current-source,readonly","--env-file",envFile,"--entrypoint","node",image,"-e",bootstrap],{windowsHide:true,stdio:"inherit"});
  return {child,async stop(){
    const inspected=spawnSync("docker",["inspect","--format",'{{index .Config.Labels "naumi.ui.run"}}',name],{encoding:"utf8",windowsHide:true});
    if(inspected.status===0){if(inspected.stdout.trim()!==runId)throw Error("LINUX_UI_CONTAINER_OWNER_MISMATCH");const removed=spawnSync("docker",["rm","--force",name],{encoding:"utf8",windowsHide:true});if(removed.status!==0)throw Error("LINUX_UI_CONTAINER_CLEANUP_FAILED");}
    await rm(envFile,{force:true});
  }};
}
