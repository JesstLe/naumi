import {mkdir,writeFile,readFile,lstat,readdir,rm,rename,open} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {mediaJobDirectory} from '../../src/modules/media/contract.mjs';

const terminal=status=>['completed','failed','cancelled'].includes(status);

/** Durable snapshots and retirement receipts belong to the media worker, not
 * the engine or HTTP router. Paths/wire shapes stay compatible with existing
 * scratch and peer workers. No retries, task execution or paid I/O live here. */
export function createMediaStateStore(root){
  const retiredRoot=path.join(root,'.retired');
  const report=(operation,id,step,error)=>{
    const code=/^[A-Z0-9_]{1,40}$/.test(error?.code||'')?error.code:'UNKNOWN';
    console.error(JSON.stringify({event:'media-state-write-failed',operation,id,step,code}));
  };
  async function atomicJson(file,value,operation,id){
    const temporary=`${file}.${randomUUID()}.tmp`;let step='write',failure;
    try{
      await writeFile(temporary,JSON.stringify(value),{mode:0o600});
      step='rename';await rename(temporary,file);
    }catch(error){failure=error;report(operation,id,step,error);throw error;}
    finally{
      try{await rm(temporary,{force:true});}
      catch(error){report(operation,id,'cleanup',error);if(!failure)throw error;}
    }
  }
  async function retired(id){
    mediaJobDirectory(root,id);let handle;
    try{
      const directory=await lstat(retiredRoot);if(!directory.isDirectory()||directory.isSymbolicLink())return null;
      const file=path.join(retiredRoot,`${id}.json`),before=await lstat(file);
      if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>1024)return null;
      handle=await open(file,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW||0));
      const after=await handle.stat();if(!after.isFile()||before.dev!==after.dev||before.ino!==after.ino||after.size!==before.size)return null;
      const buffer=Buffer.alloc(1025),{bytesRead}=await handle.read(buffer,0,buffer.length,0);if(bytesRead!==after.size)return null;
      const receipt=JSON.parse(buffer.subarray(0,bytesRead).toString('utf8'));
      if(!receipt||receipt.id!==id||!terminal(receipt.status)||typeof receipt.retiredAt!=='string'||receipt.acknowledged!==undefined&&typeof receipt.acknowledged!=='boolean')return null;
      const at=Date.parse(receipt.retiredAt);if(!Number.isFinite(at)||new Date(at).toISOString()!==receipt.retiredAt||at>Date.now())return null;
      return receipt;
    }catch{return null;}finally{await handle?.close().catch(()=>{});}
  }
  return {
    async initialize(){await mkdir(root,{recursive:true,mode:0o700});await mkdir(retiredRoot,{recursive:true,mode:0o700});},
    async save(job){await atomicJson(path.join(mediaJobDirectory(root,job.id),'worker-state.json'),job.view,'worker-state',job.id);},
    async read(id){return readFile(path.join(mediaJobDirectory(root,id),'worker-state.json'),'utf8').then(JSON.parse).catch(()=>null);},
    retired,
    async acknowledged(id){const receipt=await retired(id);return receipt&&receipt.acknowledged!==false?receipt:null;},
    async retire(id,status,acknowledged=true){mediaJobDirectory(root,id);await atomicJson(path.join(retiredRoot,`${id}.json`),{id,status,acknowledged,retiredAt:new Date().toISOString()},'retirement',id);},
    async collectExpiredRetirements(){
      for(const entry of await readdir(retiredRoot,{withFileTypes:true})){
        if(!entry.isFile()||!/^([0-9a-f-]{36})\.json$/.test(entry.name))continue;
        const id=entry.name.slice(0,-5),receipt=await retired(id);
        if(receipt&&Date.now()-Date.parse(receipt.retiredAt)>86400000)await rm(path.join(retiredRoot,entry.name),{force:true});
      }
    },
  };
}
