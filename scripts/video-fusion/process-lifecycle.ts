import {spawn, type ChildProcess} from 'node:child_process';

const exited=(child:ChildProcess)=>child.exitCode!==null||child.signalCode!==null;

function waitForExit(child:ChildProcess,milliseconds:number):Promise<boolean>{
 if(exited(child))return Promise.resolve(true);
 return new Promise(resolve=>{
  const finish=(value:boolean)=>{clearTimeout(timer);child.removeListener('exit',onExit);resolve(value);};
  const onExit=()=>finish(true),timer=setTimeout(()=>finish(exited(child)),milliseconds);
  child.once('exit',onExit);
 });
}

async function stopWindowsTree(pid:number):Promise<void>{
 await new Promise<void>((resolve,reject)=>{
  const command=spawn('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let stderr='',settled=false;
  command.stderr?.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-2000);});
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
  const timer=setTimeout(()=>{command.kill();finish(new Error('Fixture taskkill deadline exceeded'));},5000);
  command.once('error',error=>finish(error));
  command.once('close',code=>finish(code===0?undefined:new Error(`Fixture taskkill exited ${code}: ${stderr}`)));
 });
}

/** Stop only a ChildProcess this fixture created. A signal or failed taskkill
 * is not an exit receipt; callers must not report cleanup PASS for it. */
export async function stopFixtureChild(child:ChildProcess|undefined):Promise<void>{
 if(!child||exited(child))return;
 if(process.platform==='win32'&&child.pid){
  let commandFailure:unknown;
  try{await stopWindowsTree(child.pid);}
  catch(error){commandFailure=error;}
  // taskkill can partly succeed while reporting an already-retired descendant.
  // Neither its success nor its failure establishes the root process state.
  if(!await waitForExit(child,5000))throw new Error(`Fixture child ${child.pid} has no exit receipt`,{cause:commandFailure});
  return;
 }
 child.kill('SIGTERM');
 if(await waitForExit(child,5000))return;
 child.kill('SIGKILL');
 if(!await waitForExit(child,2000))throw new Error(`Fixture child ${child.pid} has no exit receipt`);
}

/** spawnSync can return absent streams when process creation itself fails.
 * Preserve that diagnostic as text instead of replacing the primary failure
 * with writeFile(NaN). This does not change a command's exit/result semantics. */
export function fixtureCommandOutput(result:{stdout?:unknown;stderr?:unknown;error?:unknown}):string{
 const text=(value:unknown)=>value===null||value===undefined?'':Buffer.isBuffer(value)?value.toString('utf8'):String(value);
 return text(result.stdout)+text(result.stderr)+(result.error?'\nCOMMAND_ERROR='+text(result.error)+'\n':'');
}
