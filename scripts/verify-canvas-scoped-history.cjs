const path=require('node:path'),{spawnSync}=require('node:child_process');
// Legacy CLI delegates to the real history owner; no copied closure implementation.
const result=spawnSync(process.execPath,[path.join(__dirname,'verify-canvas-history-refactor.cjs'),...process.argv.slice(2)],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
