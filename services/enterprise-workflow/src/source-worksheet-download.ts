import {createHash} from 'node:crypto';
import {mkdtemp,open,rmdir,unlink,type FileHandle} from 'node:fs/promises';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Readable} from 'node:stream';
import {WorkflowError} from './contracts';

export type WorksheetDownload={name:string;mime:string;bytes:number;id:string;stream:Readable};
const CHUNK_BYTES=2*1024*1024;
// At most four verified files (256 MiB of temporary storage at the file limit) per process.
let inFlight=0;
const guardSignal=(signal?:AbortSignal)=>{if(signal?.aborted)throw new WorkflowError(499,'REQUEST_ABORTED');};

export async function prepareWorksheetDownload(bytes:number,id:string,read:(offset:number,length:number)=>Promise<Buffer>,checkCurrent:()=>Promise<void>,signal?:AbortSignal){
 guardSignal(signal);
 if(inFlight>=4)throw new WorkflowError(503,'WORKSHEET_FILE_BUSY');
 inFlight++;
 let directory:string|undefined,path:string|undefined,file:FileHandle|undefined;
 async function cleanup(){
  try{if(path)await unlink(path).catch(()=>{});if(directory)await rmdir(directory).catch(()=>{});}
  finally{inFlight--;}
 }
 try{
  directory=await mkdtemp(join(tmpdir(),'naumi-worksheet-download-'));
  path=join(directory,'verified');file=await open(path,'wx+',0o600);
  // On POSIX the open descriptor owns the bytes; a process crash cannot leave an orphan spool.
  if(process.platform!=='win32'){await unlink(path);path=undefined;await rmdir(directory);directory=undefined;}
  const digest=createHash('sha256');
  for(let offset=0;offset<bytes;offset+=CHUNK_BYTES){
   guardSignal(signal);const length=Math.min(CHUNK_BYTES,bytes-offset),chunk=await read(offset,length);
   guardSignal(signal);
   if(chunk.length!==length)throw new WorkflowError(503,'FILE_HASH_MISMATCH');
   digest.update(chunk);await file.writeFile(chunk);
  }
  if(digest.digest('hex')!==id)throw new WorkflowError(503,'FILE_HASH_MISMATCH');
  guardSignal(signal);await checkCurrent();guardSignal(signal);
  const stream=file.createReadStream({start:0,autoClose:true});
  const abort=()=>stream.destroy();signal?.addEventListener('abort',abort,{once:true});
  stream.once('close',()=>{signal?.removeEventListener('abort',abort);void cleanup();});
  return stream;
 }catch(error){try{await file?.close();}finally{await cleanup();}throw error;}
}

export async function sendWorksheetDownload(req:IncomingMessage,res:ServerResponse,download:boolean,load:(signal:AbortSignal)=>Promise<WorksheetDownload>){
 const controller=new AbortController(),abort=()=>controller.abort();
 req.once('aborted',abort);res.once('close',abort);if(req.aborted||res.destroyed)abort();
 try{
  const file=await load(controller.signal);
  if(res.destroyed){file.stream.destroy();return;}
  const inline=!download&&['image/png','image/jpeg'].includes(file.mime);
  file.stream.on('error',()=>res.destroy());
  try{
   res.writeHead(200,{'Content-Type':inline?file.mime:'application/octet-stream','Content-Length':file.bytes,'Content-Disposition':(inline?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(file.name).replaceAll("'",'%27'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':file.id});
   file.stream.pipe(res);
  }catch(error){file.stream.destroy();throw error;}
 }catch(error){if(!res.destroyed)throw error;}
 finally{req.removeListener('aborted',abort);}
}
