import "server-only";
export async function readImagegenBody(request:Request,limit:number){
 if(Number(request.headers.get("content-length"))>limit)throw new Error("请求内容过大");
 const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit)throw new Error("请求内容过大");chunks.push(part.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
export async function readImagegenJson(request:Request){return JSON.parse((await readImagegenBody(request,2*1024*1024)).toString("utf8"));}
