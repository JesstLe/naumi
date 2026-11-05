// Compatibility CLI: run the actual Canvas entries and their extracted owners.
// Historical closure-only assertions are retained in the fixed baseline archive.
const path=require('node:path'),{spawnSync}=require('node:child_process');
const source=process.argv.slice(2).find(arg=>!arg.startsWith('--'))||process.env.TASK_SOURCE_ROOT||process.cwd();
const result=spawnSync(process.execPath,[path.join(__dirname,'verify-canvas-task-boundaries.cjs'),...(process.argv.includes('--baseline')?['--baseline']:[])],{cwd:process.cwd(),env:{...process.env,TASK_SOURCE_ROOT:path.resolve(source)},stdio:'inherit'});
if(result.error)throw result.error;process.exit(result.status??1);
