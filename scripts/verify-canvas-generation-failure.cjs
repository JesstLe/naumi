// Compatibility CLI: the two real Canvas callers and their actual extracted owner
// are now exercised together; the stale duplicated closure VM has been retired.
const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(process.argv[2]||'.');
const result=spawnSync(process.execPath,[path.join(__dirname,'verify-canvas-image-task-refactor.cjs'),...(process.argv.includes('--baseline')?['--baseline']:[])],{cwd:root,env:process.env,stdio:'inherit'});
if(result.error)throw result.error;process.exit(result.status??1);
