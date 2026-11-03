/** Source-bound production output shared by isolated UI verification fixtures.
 * This copies the already-required build; it never builds, starts Next, changes
 * heap policy, rewrites source or falls back to a development server. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sourceIdentity,hash} from './refactor-runner.mjs';

const schema=1;
const emptyPublic=new Set(['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY']);
const configInputs=['DESKTOP_UI_BUILD','ENTERPRISE_UI_BUILD','FLEET_UI_BUILD','MEDIA_PRIVATE','BUILD_VERSION','SOURCE_COMMIT','NAUMI_BUILD_CPUS'];
const inside=(parent,child)=>{const p=path.relative(parent,child);return p!==''&&!p.startsWith('..'+path.sep)&&p!=='..'&&!path.isAbsolute(p);};
const fail=code=>{throw Error(code);};
const publicValue=(name,value)=>emptyPublic.has(name)&&(value===undefined||value===null||value==='')?'':value===undefined?null:String(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const writeJson=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});

function externalOptIn(env){
  if(env.NAUMI_MODEL_UI_LOCKED_EXTERNAL_DEPS!==undefined&&env.NAUMI_MODEL_UI_LOCKED_EXTERNAL_DEPS!=='1')fail('MODEL_UI_EXTERNAL_OPT_IN_INVALID');
  const enabled=env.NAUMI_MODEL_UI_LOCKED_EXTERNAL_DEPS==='1';
  if(enabled&&process.platform!=='win32')fail('MODEL_UI_EXTERNAL_WINDOWS_ONLY');
  return enabled;
}
async function dependencyPackage(directory,name){
  // Fresh Node resolution avoids stale module path-cache after a dependency
  // disappears; this probe resolves paths only and never loads app/packages.
  const resolved=execFileSync(process.execPath,['-e',"process.stdout.write(require('node:module').createRequire(process.argv[1]).resolve(process.argv[2]))",path.join(directory,'server.js'),name],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  const entry=await fs.realpath(resolved);
  let folder=path.dirname(entry),packageFile;
  for(;;){
    const file=path.join(folder,'package.json'),value=await readJson(file).catch(()=>null);
    if(value?.name===name){packageFile=await fs.realpath(file);break;}
    const parent=path.dirname(folder);if(parent===folder)fail('MODEL_UI_DEPENDENCY_PACKAGE_MISSING:'+name);folder=parent;
  }
  return {entry,entrySha256:hash(await fs.readFile(entry)),packageFile,packageSha256:hash(await fs.readFile(packageFile))};
}
async function callerDependencies(root,verifyInstalledGraph){
  const packageLock=path.join(root,'package-lock.json');await regular(packageLock,'MODEL_UI_CALLER_LOCK_REQUIRED');
  const realNodeModules=await fs.realpath(path.join(root,'node_modules')),installedFile=path.join(realNodeModules,'.package-lock.json');
  let installedLock=null,installedGraph=null;
  if(await fs.stat(installedFile).then(s=>s.isFile(),()=>false))installedLock={file:installedFile,sha256:hash(await fs.readFile(installedFile))};
  if(verifyInstalledGraph){
    if(!installedLock)fail('MODEL_UI_INSTALLED_LOCK_REQUIRED');
    const desired=(await readJson(packageLock)).packages,installed=(await readJson(installedFile)).packages;
    if(!desired||!installed)fail('MODEL_UI_INSTALLED_LOCK_PACKAGES_REQUIRED');
    const missingOptional=[],mismatches=[],extra=Object.keys(installed).filter(n=>n&&!Object.hasOwn(desired,n));
    const fields=row=>Object.fromEntries(['version','resolved','integrity','link'].map(n=>[n,row[n]??null]));
    for(const [name,row] of Object.entries(desired)){
      if(!name)continue;
      if(!installed[name]){if(row.optional===true)missingOptional.push(name);else mismatches.push(name+':nonoptional-missing');}
      else if(!same(fields(row),fields(installed[name])))mismatches.push(name+':identity');
    }
    if(mismatches.length||extra.length)fail('MODEL_UI_INSTALLED_DEPENDENCY_GRAPH_MISMATCH:'+mismatches.concat(extra.map(n=>n+':extra')).join(','));
    installedGraph={desiredRows:Object.keys(desired).filter(Boolean).length,installedRows:Object.keys(installed).filter(Boolean).length,missingOptional:missingOptional.sort(),nonOptionalMissing:0,mismatches:0,extra:0};
  }
  const packages={};for(const name of ['next','pg'])packages[name]=await dependencyPackage(root,name);
  return {realNodeModules,packageLock:{file:packageLock,sha256:hash(await fs.readFile(packageLock))},installedLock,installedGraph,packages};
}
async function productionDependencies(directory,allowExternal,caller){
  const packages={};let external=false;
  for(const name of ['next','pg']){
    const actual=await dependencyPackage(directory,name),embedded=inside(directory,actual.entry)&&inside(directory,actual.packageFile);
    if(actual.entrySha256!==caller.packages[name].entrySha256||actual.packageSha256!==caller.packages[name].packageSha256)fail('MODEL_UI_PRODUCTION_DEPENDENCY_BYTES_MISMATCH:'+name);
    if(!embedded){
      if(!allowExternal)fail('MODEL_UI_PRODUCTION_DEPENDENCY_NOT_EMBEDDED:'+name);
      if(!same(actual,caller.packages[name]))fail('MODEL_UI_LOCKED_EXTERNAL_DEPENDENCY_MISMATCH:'+name);
      external=true;packages[name]={location:'locked-external-windows',...actual};
    }else packages[name]={location:'embedded',entry:path.relative(directory,actual.entry).split(path.sep).join('/'),entrySha256:actual.entrySha256,packageFile:path.relative(directory,actual.packageFile).split(path.sep).join('/'),packageSha256:actual.packageSha256};
  }
  return {mode:external?'locked-external-windows':'embedded',packages};
}

/** Only explicit verification/document inputs may differ after the build.
 * Every unclassified source path is a build input, including all product,
 * package/config, public/design/service assets and non-verification scripts. */
export function isModelUiBuildInput(name){
  if(/^(?:src|services|public|design)\//.test(name))return true;
  if(name.endsWith('.md'))return false;
  if(name.startsWith('.github/workflows/'))return false;
  if(/^scripts\/(verify-|test-)/.test(name)||name.startsWith('scripts/verification/'))return false;
  if(['scripts/model-config-ui-fixture.ts','scripts/model-management-ui-fixture.ts','scripts/prepare-model-ui-production.mjs'].includes(name))return false;
  return true;
}

async function sourceSnapshot(root){
  const source=await sourceIdentity(root),modes={},inputs={},publicNames=new Set([...emptyPublic]);
  for(const name of Object.keys(source.hashes)){
    const file=path.join(root,name),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink())fail('MODEL_UI_SOURCE_MUST_BE_FILE:'+name);
    modes[name]=stat.mode&0o777;
    if(isModelUiBuildInput(name)){
      inputs[name]={sha256:source.hashes[name],mode:modes[name]};
      if(/\.(?:[cm]?[jt]sx?)$/.test(name)){
        const text=await fs.readFile(file,'utf8');
        for(const found of text.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g))publicNames.add(found[1]);
      }
    }
  }
  return {source,modes,inputs,publicNames:[...publicNames].sort()};
}

function publicEnvironment(names,env){
  return Object.fromEntries([...new Set([...names,...Object.keys(env).filter(n=>n.startsWith('NEXT_PUBLIC_'))])].sort().map(n=>[n,publicValue(n,env[n])]));
}
function buildEnvironment(env){return Object.fromEntries(configInputs.map(n=>[n,env[n]===undefined?null:String(env[n])]));}
function differentNames(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().filter(n=>!same(a[n],b[n]));}
async function regular(file,label){const stat=await fs.lstat(file).catch(()=>null);if(!stat?.isFile()||stat.isSymbolicLink())fail(label);return stat;}

async function tree(root){
  const rows={};
  const visit=async(relative='')=>{
    for(const entry of (await fs.readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=relative?relative+'/'+entry.name:entry.name,file=path.join(root,name),stat=await fs.lstat(file);
      if(stat.isDirectory()){await visit(name);continue;}
      if(stat.isSymbolicLink()){
        const link=await fs.readlink(file),resolved=await fs.realpath(file);
        if(path.isAbsolute(link)||!inside(root,resolved))fail('MODEL_UI_ARTIFACT_LINK_ESCAPE:'+name);
        rows[name]={type:'link',link,mode:stat.mode&0o777};
      }else if(stat.isFile())rows[name]={type:'file',sha256:hash(await fs.readFile(file)),bytes:stat.size,mode:stat.mode&0o777};
      else fail('MODEL_UI_ARTIFACT_NOT_FILE:'+name);
    }
  };
  await visit();return rows;
}

async function artifacts(root){
  const locations={standalone:path.join(root,'.next/standalone'),static:path.join(root,'.next/static'),public:path.join(root,'public')},groups={};
  for(const [group,folder] of Object.entries(locations)){
    const stat=await fs.lstat(folder).catch(()=>null);if(!stat?.isDirectory()||stat.isSymbolicLink())fail('MODEL_UI_BUILD_DIRECTORY_MISSING:'+group);
    groups[group]=await tree(folder);
  }
  if(!groups.standalone['server.js']||!groups.standalone['.next/BUILD_ID']||!Object.keys(groups.static).length)fail('MODEL_UI_STANDALONE_INCOMPLETE');
  return {locations,groups};
}

export async function captureModelUiProduction({root=process.cwd(),out,env=process.env}={}){
  root=await fs.realpath(root);out=path.resolve(root,out||'output/model-ui-production');
  if(!inside(path.join(root,'output'),out))fail('MODEL_UI_BUILD_EVIDENCE_OUTSIDE_OUTPUT');
  if(env.NEXT_DIST_DIR&&env.NEXT_DIST_DIR!=='.next')fail('MODEL_UI_BUILD_DIST_MUST_BE_NEXT');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
  const allowExternalWindows=externalOptIn(env),snapshot=await sourceSnapshot(root),dependencies=await callerDependencies(root,allowExternalWindows);
  const result={schema,status:'CAPTURED',root,...snapshot,allowExternalWindows,callerDependencies:dependencies,runtime:{node:process.version,platform:process.platform,arch:process.arch},publicEnvironment:publicEnvironment(snapshot.publicNames,env),configInputEnvironment:buildEnvironment(env),emptyPublicPolicy:'Only Supabase URL/key unset and empty are effective empty; nonempty never normalized (auth-mode.ts/supabase.ts use nullish empty defaults)',capturedAt:new Date().toISOString()};
  await writeJson(path.join(out,'INPUT.json'),result);
  await fs.writeFile(path.join(out,'SOURCE.txt'),snapshot.source.commit+'\n',{flag:'wx'});
  return result;
}

export async function sealModelUiProduction({root=process.cwd(),out,env=process.env}={}){
  root=await fs.realpath(root);out=path.resolve(root,out||'output/model-ui-production');
  const captured=await readJson(path.join(out,'INPUT.json')),current=await sourceSnapshot(root);
  if(captured.schema!==schema||captured.status!=='CAPTURED'||captured.root!==root)fail('MODEL_UI_BUILD_CAPTURE_IDENTITY');
  if(!same(captured.source,current.source)||!same(captured.modes,current.modes))fail('MODEL_UI_SOURCE_CHANGED_DURING_BUILD');
  if(externalOptIn(env)!==captured.allowExternalWindows)fail('MODEL_UI_EXTERNAL_OPT_IN_CHANGED');
  const caller=await callerDependencies(root,captured.allowExternalWindows);if(!same(caller,captured.callerDependencies))fail('MODEL_UI_CALLER_DEPENDENCIES_CHANGED');
  if(!same(captured.publicEnvironment,publicEnvironment(captured.publicNames,env))||!same(captured.configInputEnvironment,buildEnvironment(env)))fail('MODEL_UI_PUBLIC_ENV_CHANGED_DURING_BUILD');
  await regular(path.join(root,'.next/BUILD_ID'),'MODEL_UI_BUILD_ID_MISSING');
  await regular(path.join(root,'.next/required-server-files.json'),'MODEL_UI_REQUIRED_FILES_MISSING');
  const buildId=(await fs.readFile(path.join(root,'.next/BUILD_ID'),'utf8')).trim(),required=await readJson(path.join(root,'.next/required-server-files.json'));
  if(!buildId||required.config?.output!=='standalone'||!['.next','./.next'].includes(required.config.distDir))fail('MODEL_UI_BUILD_NOT_STANDALONE');
  const {groups}=await artifacts(root),configEnv=Object.fromEntries(Object.entries(required.config.env||{}).sort(([a],[b])=>a.localeCompare(b))),effectivePublic={...captured.publicEnvironment};
  for(const [name,value] of Object.entries(configEnv)){
    if(value!==null&&!['string','number','boolean'].includes(typeof value))fail('MODEL_UI_CONFIG_ENV_NOT_SCALAR:'+name);
    if(name.startsWith('NEXT_PUBLIC_'))effectivePublic[name]=publicValue(name,value);
  }
  const standaloneId=(await fs.readFile(path.join(root,'.next/standalone/.next/BUILD_ID'),'utf8')).trim();if(standaloneId!==buildId)fail('MODEL_UI_STANDALONE_BUILD_ID_MISMATCH');
  const dependencies=await productionDependencies(path.join(root,'.next/standalone'),captured.allowExternalWindows,caller);
  const result={schema,status:'SEALED',root,allowExternalWindows:captured.allowExternalWindows,callerDependencies:caller,productionDependencies:dependencies,source:captured.source,sourceModes:captured.modes,runtime:captured.runtime,buildInputs:captured.inputs,publicNames:captured.publicNames,configInputEnvironment:captured.configInputEnvironment,publicEnvironment:Object.fromEntries(Object.entries(effectivePublic).sort(([a],[b])=>a.localeCompare(b))),configEnv,buildId,requiredServerFiles:{sha256:hash(await fs.readFile(path.join(root,'.next/required-server-files.json'))),configEnv},artifacts:groups,sealedAt:new Date().toISOString()};
  await writeJson(path.join(out,'BUILD.json'),result);return result;
}

/** Validate source/build/public identity before first copy. Every destination is
 * newly created under the invoking checkout's output; source artifacts stay read-only. */
export async function prepareOwnedModelUiProduction({root=process.cwd(),source,target,manifestFile,env=process.env,onCopyComplete}={}){
  root=await fs.realpath(root);target=path.resolve(target);manifestFile=path.resolve(root,manifestFile||'output/model-ui-production/BUILD.json');
  if(!inside(path.join(root,'output'),target)||await fs.lstat(target).then(()=>true,()=>false))fail('MODEL_UI_NEW_OWNED_APP_REQUIRED');
  const sealed=await readJson(manifestFile),current=await sourceSnapshot(root);
  if(sealed.schema!==schema||sealed.status!=='SEALED'||sealed.root!==root)fail('MODEL_UI_BUILD_NOT_SEALED');
  if(!same(sealed.runtime,{node:process.version,platform:process.platform,arch:process.arch}))fail('MODEL_UI_BUILD_RUNTIME_MISMATCH');
  if(externalOptIn(env)!==sealed.allowExternalWindows)fail('MODEL_UI_EXTERNAL_OPT_IN_CHANGED');
  const caller=await callerDependencies(root,sealed.allowExternalWindows);if(!same(caller,sealed.callerDependencies))fail('MODEL_UI_CALLER_DEPENDENCIES_CHANGED');
  if(!source||!same(current.source,source))fail('MODEL_UI_CURRENT_SOURCE_CHANGED');
  if(sealed.source.commit!==source.commit||(await fs.readFile(path.join(path.dirname(manifestFile),'SOURCE.txt'),'utf8')).trim()!==source.commit)fail('MODEL_UI_BUILD_SOURCE_COMMIT_MISMATCH');
  const inputDrift=differentNames(sealed.buildInputs,current.inputs);if(inputDrift.length)fail('MODEL_UI_BUILD_INPUT_CHANGED:'+inputDrift.join(','));
  const changedSource=differentNames(sealed.source.hashes,current.source.hashes),modeChanges=differentNames(sealed.sourceModes,current.modes),bridgeChanges=[...new Set([...changedSource,...modeChanges])].sort();
  if(bridgeChanges.some(isModelUiBuildInput))fail('MODEL_UI_BUILD_SOURCE_DRIFT');
  for(const [name,value] of Object.entries(env))if(name.startsWith('NEXT_PUBLIC_')&&publicValue(name,value)!==sealed.publicEnvironment[name])fail('MODEL_UI_PUBLIC_ENV_MISMATCH:'+name);
  for(const name of emptyPublic)if(sealed.publicEnvironment[name]!=='')fail('MODEL_UI_FIXTURE_REQUIRES_EMPTY_SUPABASE:'+name);
  for(const [name,value] of Object.entries(sealed.configInputEnvironment))if(env[name]!==undefined&&String(env[name])!==value)fail('MODEL_UI_CONFIG_ENV_MISMATCH:'+name);
  const currentArtifacts=await artifacts(root);if(!same(currentArtifacts.groups,sealed.artifacts))fail('MODEL_UI_BUILD_ARTIFACT_MISMATCH');
  if((await fs.readFile(path.join(root,'.next/BUILD_ID'),'utf8')).trim()!==sealed.buildId||hash(await fs.readFile(path.join(root,'.next/required-server-files.json')))!==sealed.requiredServerFiles.sha256)fail('MODEL_UI_BUILD_IDENTITY_CHANGED');
  if(!same(await productionDependencies(path.join(root,'.next/standalone'),sealed.allowExternalWindows,caller),sealed.productionDependencies))fail('MODEL_UI_PRODUCTION_DEPENDENCY_CHANGED');
  const runtimeEnv={};
  for(const [name,value] of Object.entries(sealed.configInputEnvironment))if(value!==null)runtimeEnv[name]=value;
  for(const [name,value] of Object.entries(sealed.publicEnvironment))if(value!==null)runtimeEnv[name]=value;
  for(const [name,value] of Object.entries(sealed.configEnv))if(value!==null)runtimeEnv[name]=String(value);
  const destinationRows={};
  for(const [group,rows] of Object.entries(sealed.artifacts))for(const [name,row] of Object.entries(rows)){
    const destination=group==='standalone'?name:group==='static'?'.next/static/'+name:'public/'+name;
    if(destinationRows[destination]&&!same(destinationRows[destination],row))fail('MODEL_UI_ARTIFACT_DESTINATION_CONFLICT:'+destination);
    destinationRows[destination]=row;
  }
  await fs.mkdir(target);
  for(const [group,rows] of Object.entries(sealed.artifacts))for(const [name,row] of Object.entries(rows)){
    const relative=group==='standalone'?name:group==='static'?'.next/static/'+name:'public/'+name,destination=path.resolve(target,relative);
    if(!inside(target,destination))fail('MODEL_UI_ARTIFACT_DESTINATION_ESCAPE');
    await fs.mkdir(path.dirname(destination),{recursive:true});
    if(row.type==='link'){
      if(!await fs.lstat(destination).then(()=>true,()=>false))await fs.symlink(row.link,destination);
    }else{await fs.copyFile(path.join(currentArtifacts.locations[group],name),destination);await fs.chmod(destination,row.mode);}
  }
  const observed=await tree(target);if(!same(observed,Object.fromEntries(Object.entries(destinationRows).sort(([a],[b])=>a.localeCompare(b)))))fail('MODEL_UI_OWNED_COPY_MISMATCH');
  const ownedDependencies=await productionDependencies(target,sealed.allowExternalWindows,caller);if(!same(ownedDependencies,sealed.productionDependencies))fail('MODEL_UI_OWNED_DEPENDENCY_MISMATCH');
  // Explicit unit port: the production runner never supplies this callback.
  if(onCopyComplete)await onCopyComplete();
  const after=await sourceSnapshot(root);if(!same(after.source,current.source)||!same(after.modes,current.modes))fail('MODEL_UI_SOURCE_CHANGED_DURING_COPY');
  if(!same((await artifacts(root)).groups,sealed.artifacts))fail('MODEL_UI_ROOT_BUILD_CHANGED_DURING_COPY');
  const brief=identity=>({commit:identity.commit,digest:identity.digest,dirty:identity.dirty,files:identity.files});
  return {directory:target,server:path.join(target,'server.js'),environment:runtimeEnv,evidence:{mode:'production-standalone',dependencyMode:ownedDependencies.mode,dependencies:ownedDependencies,callerDependencies:caller,manifest:manifestFile,manifestSha256:hash(await fs.readFile(manifestFile)),buildSource:brief(sealed.source),currentSource:brief(source),postCopySource:brief(after.source),bridge:{testDocumentOnlyChanges:bridgeChanges.map(name=>({name,before:sealed.source.hashes[name]??null,after:source.hashes[name]??null,modeBefore:sealed.sourceModes[name]??null,modeAfter:current.modes[name]??null})),buildInputsExact:true,sourceDirty:source.dirty,digestChanged:source.digest!==sealed.source.digest},buildId:sealed.buildId,artifactFiles:Object.keys(destinationRows).length,ownedCopyExact:true,rootBuildUnmodified:true,publicEnvironment:sealed.publicEnvironment}};
}
