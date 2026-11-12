const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const esbuild=require('esbuild');
const root=path.resolve(process.argv.find(x=>x.startsWith('--source='))?.slice(9)||process.cwd());
const baseline=process.argv.includes('--baseline');
let checks=0;
function check(name,ok){assert.ok(ok,name);checks++;}
const shell=fs.readFileSync(path.join(root,'src/components/app-shell.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'src/components/home/creation-workbench.module.css'),'utf8');
check('original creation styles retained',css.includes('.historyDots')&&css.includes('.chatComposer'));
check('page grants retained',shell.includes('user && !canPage(path)'));
check('tool file validation retained',shell.includes('toolImageError')&&shell.includes('onChangeCapture'));
check('desktop bypass retained',shell.includes('path === "/desktop"'));
check('canvas legacy navigation retained',shell.includes('<AppRail />'));
if(baseline){
 check('baseline legacy tool navigation',!shell.includes('<WorkspaceShell'));
 check('baseline independent template layout',!fs.readFileSync(path.join(root,'src/app/templates/page.tsx'),'utf8').includes('variant="creation"'));
}else{
 const file=path.join(os.tmpdir(),`naumi-workspace-policy-${process.pid}.cjs`);
 esbuild.buildSync({entryPoints:[path.join(root,'src/components/workspace/route-policy.ts')],bundle:true,platform:'node',outfile:file});
 const {workspacePresentation,workspaceActiveSection}=require(file);
 for(const route of ['/canvas','/canvas/project','/batchshot/native/workbench','/batchshot/native/single','/batchshot/native/chat-image','/admin','/admin/model-health','/desktop','/desktop/tools','/enterprise'])check('exclude '+route,workspacePresentation(route)==='excluded');
 for(const route of ['/','/dashboard','/agent'])check('creation '+route,workspacePresentation(route)==='creation');
 for(const route of ['/sign-in','/sign-up','/reset'])check('authentication '+route,workspacePresentation(route)==='auth');
 for(const route of ['/templates','/works','/tools','/generate','/video','/batchshot','/team','/account','/contact','/guides','/plans','/checkout'])check('unified '+route,workspacePresentation(route)==='page');
 for(const route of ['/studio3d','/genchat'])check('specialized '+route,workspacePresentation(route)==='immersive');
 check('tool selection',workspaceActiveSection('/retouch')==='/tools');
 check('native reference selection',workspaceActiveSection('/batchshot/native/single')==='/batchshot');
 check('account has no incorrect tool highlight',workspaceActiveSection('/account/security')==='');
 check('template reuse',fs.readFileSync(path.join(root,'src/app/templates/page.tsx'),'utf8').includes('variant="creation"'));
 check('Canvas is not wrapped',shell.includes('return isCanvas ? body : <WorkspaceShell'));
 const surface=fs.readFileSync(path.join(root,'src/components/workspace/product-surface.tsx'),'utf8');
 check('theme preference untouched',!surface.includes('localStorage')&&!surface.includes('classList'));
 check('scoped portal cleanup',surface.includes('delete document.body.dataset.workspaceSurface'));
 check('native adapter removed',!fs.existsSync(path.join(root,'src/lib/reference-workbench/chrome.ts')));
 const catalog=fs.readFileSync(path.join(root,'src/components/workspace/use-session-catalog.ts'),'utf8');
 check('catalog does not mount executor',catalog.includes('createWorkbenchSessionCatalog')&&!catalog.includes('createWorkbenchSession('));
 check('workspace fences',catalog.includes('WORKSPACE_SELECTION')&&catalog.includes('scope.active=false')&&catalog.includes('previous.key===key'));
 const style=fs.readFileSync(path.join(root,'src/components/workspace/workspace-surface.css'),'utf8');
 check('container-driven layouts',style.includes('@container workspace'));
 check('content viewport height',style.includes('--workspace-height:calc(100dvh - 64px)'));
 check('native style not injected',!fs.readFileSync(path.join(root,'src/lib/reference-workbench/ui.ts'),'utf8').includes('native-workspace.css'));
 fs.unlinkSync(file);
}
console.log('WORKSPACE_CONTRACT='+JSON.stringify({mode:baseline?'BASELINE':'MODIFIED',checks,failed:0,canvas:'legacy-preserved'}));
