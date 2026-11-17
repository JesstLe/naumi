import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=process.cwd(),out=resolve(process.argv[2]||'output/naumi-desktop-bundle');
const rel=relative(join(root,'output'),out);
if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('BUNDLE_OUTPUT_REQUIRED_INSIDE_OUTPUT');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim()!=='';
if(dirty&&!process.argv.includes('--allow-dirty'))throw Error('BUNDLE_REQUIRES_FIXED_CLEAN_COMMIT');
await mkdir(out,{recursive:true});
const files={};
for(const [from,to]of [['public/agent/naumi.mjs','naumi.mjs'],['skills/naumi-cli/SKILL.md','skills/naumi-cli/SKILL.md'],['integrations/desktop/naumi-creation.mjs','naumi-creation.mjs'],['docs/DESKTOP_CREATION_MCP.md','DESKTOP_CREATION_MCP.md']]){
  const bytes=await readFile(from);await mkdir(resolve(out,to,'..'),{recursive:true});await writeFile(join(out,to),bytes,{flag:'wx'});files[to]=sha(bytes);
}
const manifest={schemaVersion:1,clientVersion:'1.1.0',gatewayVersion:1,node:'>=18',sourceCommit,dirty,files,transport:'stdio',desktopNamespace:'naumi_creation',outerOperation:'naumi_call.operationId',domainOperation:'arguments preserve original operation_id / request.operationId',remoteSelectionContext:false};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
for(const [file,digest]of Object.entries(files))if(sha(await readFile(join(out,file)))!==digest)throw Error('BUNDLE_REOPEN_FAILED');
console.log(JSON.stringify({result:'BUNDLE_VERIFIED',path:out,...manifest}));
