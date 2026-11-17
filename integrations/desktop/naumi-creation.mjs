// Host-side thin adapter. No model, billing, task or token ownership here.
import {readFile,realpath,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,sep,join} from 'node:path';

const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(root,file)=>{const r=relative(root,file);return r&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};

/** Host supplies an account-specific protected token file, never a model input.
 * Account logout/switch MUST dispose the old registration before installing another. */
export async function naumiCreationConfig({bundle,site,account,tokenFile,workspace='',fileRoot,node=process.execPath,expectedManifestSha256,allowFixtureBundle=false}) {
  for(const p of [bundle,tokenFile,fileRoot,node])if(typeof p!=='string'||!isAbsolute(p))throw Error('NAUMI_ABSOLUTE_HOST_PATH_REQUIRED');
  const root=await realpath(bundle),manifestBytes=await readFile(join(root,'manifest.json')),manifest=JSON.parse(manifestBytes);
  if(!allowFixtureBundle&&!/^[a-f0-9]{64}$/.test(expectedManifestSha256||''))throw Error('NAUMI_EXTERNAL_MANIFEST_PIN_REQUIRED');
  if(expectedManifestSha256&&sha(manifestBytes)!==expectedManifestSha256)throw Error('NAUMI_MANIFEST_PIN_MISMATCH');
  if(manifest.schemaVersion!==1||manifest.clientVersion!=='1.1.0'||manifest.gatewayVersion!==1||!/^[a-f0-9]{40}$/.test(manifest.sourceCommit))throw Error('NAUMI_BUNDLE_INCOMPATIBLE');
  if(manifest.dirty!==false&&!allowFixtureBundle)throw Error('NAUMI_FIXED_CLEAN_BUNDLE_REQUIRED');
  for(const [file,digest]of Object.entries(manifest.files)) {
    const path=resolve(root,file);
    if(!inside(root,path)||!inside(root,await realpath(path))||sha(await readFile(path))!==digest)throw Error('NAUMI_BUNDLE_HASH_MISMATCH');
  }
  if(!manifest.files['naumi.mjs']||!manifest.files['skills/naumi-cli/SKILL.md'])throw Error('NAUMI_BUNDLE_FILES_REQUIRED');
  const url=new URL(site);
  if(url.username||url.password||url.origin!==site||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('NAUMI_SITE_INVALID');
  if(typeof account!=='string'||!account.trim()||!/^[-\w]{0,128}$/.test(workspace))throw Error('NAUMI_ACCOUNT_SCOPE_REQUIRED');
  if(!(await lstat(tokenFile)).isFile()||(await realpath(tokenFile))!==resolve(tokenFile))throw Error('NAUMI_PROTECTED_TOKEN_FILE_REQUIRED');
  const files=await realpath(fileRoot);
  if(inside(files,await realpath(tokenFile)))throw Error('NAUMI_TOKEN_MUST_BE_OUTSIDE_AGENT_WORKSPACE');
  return {mcp:{serverName:'naumi_creation',transport:'stdio',command:node,args:[join(root,'naumi.mjs'),'mcp','--desktop'],env:{NAUMI_SITE:site,NAUMI_ACCOUNT:account.trim().toLowerCase(),NAUMI_TOKEN_FILE:tokenFile,NAUMI_WORKSPACE:workspace,NAUMI_FILE_ROOT:files,NAUMI_TOKEN:'',NAUMI_CONFIG:join(root,'unused-profile.json')},toolCallTimeoutMs:660000,failOnStartupError:true},skills:{providerName:'naumi-creation',includeDefaultRoots:false,customSkillDirs:[join(root,'skills')],watch:false},compatibility:{...manifest,workspace:workspace||null}};
}

/** Consume the actual download receipt; then invoke the host's EXISTING present
 * tool through its normal policy/executor, in the originating Agent Session.
 * The callback is deliberately host-owned: no synthetic delivery event here. */
export async function presentNaumiDownload({receipt,fileRoot,present,signal,description='Naumi 创作结果'}) {
  signal?.throwIfAborted();
  if(!receipt||typeof receipt.path!=='string'||!isAbsolute(receipt.path)||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<0||!/^[a-f0-9]{64}$/.test(receipt.sha256)||typeof present!=='function')throw Error('NAUMI_DOWNLOAD_RECEIPT_REQUIRED');
  const root=await realpath(fileRoot),file=await realpath(receipt.path),info=await lstat(receipt.path);
  if(!inside(root,file)||!info.isFile()||info.size!==receipt.bytes)throw Error('NAUMI_DELIVERY_SCOPE_OR_BYTES');
  if(sha(await readFile(file))!==receipt.sha256)throw Error('NAUMI_DELIVERY_DIGEST_CHANGED');
  signal?.throwIfAborted();
  return present({files:[{path:file,description}]});
}

/** Called in a single-account/session Harness scope, not a global team context.
 * Dependencies are the Desktop's existing official MCP/Skill plugins. */
export async function installNaumiCreation(ctx,options,{mcpClient,filesystemSkills}) {
  const config=await naumiCreationConfig(options);
  const registration=ctx.inject(['tools','skills'],scope=>{
    scope.plugin(mcpClient,config.mcp);
    scope.plugin(filesystemSkills,config.skills);
  });
  return async()=>{await registration.dispose();};
}
