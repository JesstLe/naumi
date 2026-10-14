import { createServer } from "node:http";
import { randomUUID,createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const secretKey = /authorization|credential|password|secret|api.?key|token|signature/i;
export function publicFixtureValue(value, key = "") {
  if (secretKey.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map(v => publicFixtureValue(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,publicFixtureValue(v,k)]));
  if (typeof value === "string" && /^https?:\/\//.test(value)) { const u = new URL(value); u.search = ""; return u.toString(); }
  if(typeof value==="string"&&(value.startsWith("data:")||value.length>4000))return {materialString:true,length:value.length};
  return value;
}
/** @param {{assetsRoot:string,manifest:{files:any[]},token?:string,validateWire?:(call:any)=>void|Promise<void>,validatePoll?:(call:any)=>void,objectHandler?:(req:any,res:any,origin:string)=>Promise<any>,agentReply?:(request:any)=>Promise<any>|any}} options */
export async function createVideoSupplier({ assetsRoot, manifest, token = randomUUID(), validateWire, validatePoll, objectHandler, agentReply } = {}) {
  if (!assetsRoot || !manifest?.files?.length) throw new Error("A verified video manifest is required");
  const calls = [], tasks = new Map(), keys = new Map();
  let scenario = "success", origin = "";
  const respond = (res, body, status = 200) => { res.writeHead(status, {"content-type":"application/json"}); res.end(JSON.stringify(body)); };
  const getBody = async req => {
    const chunks = []; let total = 0;
    for await (const chunk of req) { total += chunk.length; if (total > 32*1024*1024) throw new Error("Fixture body exceeds limit"); chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    if (String(req.headers["content-type"]).includes("multipart/form-data")) {
      const request = new Request(origin+req.url, {method:"POST",headers: req.headers,body:bytes});
      const data = await request.formData(), out = {};
      for (const [key,value] of data){
        if(typeof value==="string")out[key]=value;
        else{const raw=Buffer.from(await value.arrayBuffer()),sha256=createHash("sha256").update(raw).digest("hex");
          out[key]={file:value.name,mimeType:value.type,bytes:value.size,sha256};calls.push({phase:"reference-read",encoding:"multipart",bytes:raw.length,sha256});}
      }
      return out;
    }
    return bytes.length ? JSON.parse(bytes.toString()) : {};
  };
  const parseUrls = (body, key = "") => {
    if (/prompt|negative|description|text/i.test(key)) return [];
    if (Array.isArray(body)) return body.flatMap(v=>parseUrls(v,key));
    if (body && typeof body === "object") return Object.entries(body).flatMap(([k,v])=>parseUrls(v,k));
    return typeof body === "string" && /^https?:\/\//.test(body) ? [body] : [];
  };
  const server = createServer(async (req,res) => {
    try {
      const url = new URL(req.url,origin || "http://127.0.0.1");
      if (objectHandler && url.pathname.startsWith("/objects/")) return await objectHandler(req,res,origin);
      if (url.pathname.startsWith("/assets/")) {
        const name = decodeURIComponent(url.pathname.slice(8)), entry = manifest.files.find(f=>f.name===name);
        if (!entry || path.basename(name)!==name) return respond(res,{error:"missing asset"},404);
        const bytes = await readFile(path.join(assetsRoot,name));
        calls.push({phase:"result-download",path:url.pathname,bytes:bytes.length});
        if (scenario === "bad-mime") { res.writeHead(200,{"content-type":"text/html"}); return res.end("bad media"); }
        if (scenario === "corrupt-video") { res.writeHead(200,{"content-type":"video/mp4"}); return res.end(Buffer.from([0,1,2,3])); }
        if (scenario === "oversized") { res.writeHead(200,{"content-type":"video/mp4","content-length":String(201*1024*1024)}); return res.end(); }
        res.writeHead(200,{"content-type":entry.mimeType,"content-length":bytes.length}); return res.end(bytes);
      }
      const declaredProtocol=url.pathname.match(/^\/protocol\/([^/]+)/)?.[1]||"openai-videos";
      if (req.headers.authorization !== `Bearer ${token}` && req.headers["x-goog-api-key"]!==token && !(declaredProtocol==="autodl"&&req.headers.authorization===token)) return respond(res,{error:"fixture authentication required"},401);
      const body = req.method === "POST" || req.method === "PUT" ? await getBody(req) : {};
      const protocol = url.pathname.match(/^\/protocol\/([^/]+)/)?.[1] || "openai-videos";
      const pathname = url.pathname.replace(/^\/protocol\/[^/]+/, "");
      if(protocol==="agent"&&req.method==="POST"&&pathname==="/v1/chat/completions"){
        if(!agentReply||body.stream!==true)return respond(res,{error:"Scripted streaming fixture required"},422);
        calls.push({phase:"agent-chat",model:body.model,toolCount:body.tools?.length||0});
        const reply=await agentReply(body),id=`chatcmpl-fixture-${randomUUID()}`,created=Math.floor(Date.now()/1000);
        res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-store"});
        const emit=(delta,finish_reason=null)=>res.write(`data: ${JSON.stringify({id,object:"chat.completion.chunk",created,model:body.model,choices:[{index:0,delta,finish_reason}]})}\n\n`);
        emit({role:"assistant"});
        if(reply.toolCalls?.length){emit({tool_calls:reply.toolCalls.map((tool,index)=>({index,id:tool.id||`fixture-tool-${randomUUID()}`,type:"function",function:{name:tool.name,arguments:JSON.stringify(tool.args)}}))});emit({},"tool_calls");}
        else{emit({content:reply.text||""});emit({},"stop");}
        res.write(`data: ${JSON.stringify({id,object:"chat.completion.chunk",created,model:body.model,choices:[],usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110}})}\n\n`);return res.end("data: [DONE]\n\n");
      }
      if(protocol==="comfyui"&&pathname==="/object_info")return respond(res,{LoadImage:{},VHS_LoadVideo:{},LoadAudio:{},CLIPTextEncode:{},SaveVideo:{},SaveImage:{},SaveAudio:{}});
      if((protocol==="comfyui"&&pathname==="/upload/image")||(protocol==="runninghub"&&pathname==="/task/openapi/upload")){
        const file=body.image||body.file;if(!file?.file||!file.bytes)return respond(res,{error:"missing uploaded media"},422);
        calls.push({phase:"workflow-upload",protocol,path:pathname,file:file.file,bytes:file.bytes,sha256:file.sha256});
        return respond(res,protocol==="comfyui"?{name:file.file,subfolder:"fixture-input"}:{code:0,data:{fileName:file.file}});
      }
      if(protocol==="comfyui"&&pathname==="/view"){
        const name=url.searchParams.get("filename"),entry=manifest.files.find(asset=>asset.name===name);
        if(!entry)return respond(res,{error:"missing graph output"},404);
        const bytes=await readFile(path.join(assetsRoot,name));calls.push({phase:"result-download",path:pathname,assetId:name,bytes:bytes.length});
        res.writeHead(200,{"content-type":entry.mimeType,"content-length":bytes.length});return res.end(bytes);
      }
      if(protocol==="image"&&req.method==="POST"&&/\/images\/(generations|edits)$/.test(pathname)){
        calls.push({phase:"image-create",path:pathname,body:publicFixtureValue(body)});
        return respond(res,{created:Math.floor(Date.now()/1000),data:[{b64_json:(await readFile(path.join(assetsRoot,"first.png"))).toString("base64")}]});
      }
      const pollId = String(body.taskId || body.taskICode || url.searchParams.get("taskId") || url.searchParams.get("task_id") || url.searchParams.get("video_id") || "");
      const task = tasks.get(pollId) || [...tasks.values()].find(t=>pathname.endsWith(`/${t.id}`) || pathname.includes(`/operations/${t.id}`));
      if (task && (req.method === "DELETE" || pathname.endsWith("/cancel"))) {
        calls.push({phase:"cancel",taskId:task.id});
        if (scenario === "cancel-unsupported") return respond(res,{error:"not supported"},405);
        task.cancelled=true; return respond(res,{id:task.id,status:"cancelled"});
      }
      if (task) {
        await validatePoll?.({protocol,path:pathname+url.search,taskId:task.id,body,method:req.method});
        calls.push({phase:"poll",taskId:task.id,path:pathname,protocol}); task.polls++;
        if (scenario === "poll-503" && task.polls===1) return respond(res,{error:"temporarily busy"},503);
        if (scenario === "malformed-poll") return respond(res,{unrecognized:"state"});
        const done=task.polls>=2, state=task.cancelled?"cancelled":scenario==="rejected"?"failed":done?"completed":"processing";
        const resultUrl=origin+"/assets/"+task.asset.name;
        if (protocol==="gemini") return respond(res,state==="failed"?{done:true,error:{code:13,message:"fixture rejected"}}:done?{done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:resultUrl}}]}}}:{done:false});
        if (protocol==="kie") return respond(res,{code:200,data:{taskId:task.id,state:state==="completed"?"success":state,resultJson:done?JSON.stringify({resultUrls:[resultUrl]}):"",failMsg:state==="failed"?"fixture rejected":""}});
        if (protocol==="apimart") return respond(res,{code:200,data:{id:task.id,status:state,progress:done?100:30,result:done?{videos:[{url:[resultUrl]}]}:{}}});
        if (protocol==="tfrouter") {
          const inlineAsset=manifest.files.find(asset=>asset.name==='landscape-30-audio.mp4');
          const value=state==='completed'&&scenario==='tfrouter-inline'?`data:video/mp4;base64,${(await readFile(path.join(assetsRoot,inlineAsset.name))).toString('base64')}`:state==='completed'?resultUrl:'';
          return respond(res,{status:state==="completed"?"success":state,data:{status:state,data:value,failReason:state==="failed"?"fixture rejected":undefined}});
        }
        if(protocol==="compshare"&&!pathname.includes("/minimax/"))return respond(res,{output:{task_id:task.id,task_status:state==="completed"?"Success":state==="failed"?"Failure":state,urls:state==="completed"?[resultUrl,...(scenario==="multi-output"?[origin+"/assets/portrait-4-audio.mp4"]:[])]:[],error_message:state==="failed"?"fixture rejected":undefined}});
        if(protocol==="tokendance"){
          if(pathname.startsWith("/kling/"))return respond(res,{data:[{id:task.id,status:state==="completed"?"succeed":state,outputs:state==="completed"?[{type:"video",url:resultUrl}]:[]}]});
          if(pathname.startsWith("/alibaba/"))return respond(res,{output:{task_id:task.id,task_status:state,video_url:state==="completed"?resultUrl:undefined}});
        }
        if(protocol==="autodl")return respond(res,{code:"success",data:{task_id:task.id,status:state,message:state==="failed"?"fixture rejected":undefined,results:state==="completed"?[{type:"video",output_type:"output",filetype:"mp4",url:resultUrl},{type:"audio",output_type:"output",filetype:"wav",url:origin+"/assets/tone-8.wav"}]:[]}});
        if(protocol==="comfyui")return respond(res,{[task.id]:{status:{status_str:state==="completed"?"success":state==="failed"?"error":"executing",completed:state==="completed"},outputs:state==="completed"?{"save-video":{gifs:[{filename:task.asset.name,subfolder:"",type:"output"}]},"save-audio":{audio:[{filename:"tone-8.wav",subfolder:"",type:"output"}]},"save-image":{images:[{filename:"first.png",subfolder:"",type:"output"}]}}:{}}});
        if(protocol==="runninghub")return respond(res,state==="completed"?{code:0,data:[{fileUrl:resultUrl,fileType:"mp4"},{fileUrl:origin+"/assets/tone-8.wav",fileType:"wav"}]}:state==="failed"?{code:805,msg:"fixture rejected"}:{code:804,msg:"processing"});
        return respond(res,{id:task.id,status:state,progress:done?100:30,content:done?{video_url:resultUrl,url:resultUrl}:{},video_url:done?resultUrl:undefined,task:{id:task.id,status:state,content:done?{url:resultUrl}:{}}});
      }
      if (req.method!=="POST") return respond(res,{error:"unknown fixture task"},404);
      const operationId=String(req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || body.idempotencyKey || "");
      calls.push({phase:"create",path:pathname,protocol,operationId,body:publicFixtureValue(body)});
      if (scenario==="create-429") return respond(res,{error:{message:"fixture quota"}},429);
      if (scenario==="create-503") return respond(res,{error:{message:"fixture unavailable"}},503);
      await validateWire?.({protocol,path:pathname,body});
      for (const ref of parseUrls(body)) {
        if (new URL(ref).origin !== origin) throw new Error("Fixture reference origin is not isolated");
        const response=await fetch(ref,{signal:AbortSignal.timeout(10_000)});
        if (!response.ok) throw new Error(`Fixture cannot read reference (${response.status})`);
        const bytes=await response.arrayBuffer(); calls.push({phase:"reference-read",path:new URL(ref).pathname,bytes:bytes.byteLength});
      }
      let id=operationId&&keys.get(operationId);
      if (!id) {
        id=`fixture-${randomUUID()}`;
        const seconds=Number(body.duration || body.seconds || body.input?.duration || body.parameters?.duration || body.settings?.duration || (body.num_frames&&body.frame_rate?(body.num_frames-1)/body.frame_rate:4));
        const ratio=body.ratio || body.aspect_ratio || body.aspectRatio || body.parameters?.ratio || body.parameters?.aspect_ratio || body.settings?.aspect_ratio || "16:9";
        const asset=manifest.files.find(f=>f.mimeType==="video/mp4"&&f.aspectRatio===ratio&&Math.abs(f.durationSeconds-seconds)<0.12&&f.audioCodecs.length)
          || manifest.files.find(f=>f.name==="landscape-4-audio.mp4");
        tasks.set(id,{id,asset,polls:0,cancelled:false}); if(operationId)keys.set(operationId,id);
      }
      if (scenario==="accepted-disconnect") return req.socket.destroy();
      if (protocol==="gemini") return respond(res,{name:`operations/${id}`});
      if (protocol==="kie") return respond(res,{code:200,data:{taskId:id}});
      if (protocol==="apimart") return respond(res,{code:200,data:[{task_id:id}]});
      if (protocol==="tfrouter") return respond(res,{status:"success",data:id});
      if(protocol==="compshare")return respond(res,pathname.includes("/minimax/")?{task_id:id}:{output:{task_id:id}});
      if(protocol==="tokendance"){
        if(pathname.startsWith("/kling/"))return respond(res,{data:[{id,status:"submitted"}]});
        if(pathname.startsWith("/alibaba/"))return respond(res,{output:{task_id:id,task_status:"pending"}});
      }
      if (protocol==="runninghub") return respond(res,{code:0,data:{taskId:id}});
      if(protocol==="autodl")return respond(res,{code:"success",data:{task_id:id,status:"queued"}});
      if(protocol==="comfyui")return respond(res,{prompt_id:id,node_errors:{}});
      return respond(res,{id,task_id:id,status:"queued"});
    } catch (error) { if(!res.headersSent)respond(res,{error:{message:error.message}},422);else res.destroy(); }
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,token,calls,tasks,setScenario(value){scenario=value;},
    async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
