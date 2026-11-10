/** Actual gateway Routes, PostgreSQL, shipped CLI/MCP and loopback HTTP.
 * Internal tool endpoints are explicit fixtures; no real supplier is called. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  const out=path.resolve(process.env.AGENT_CHAIN_EVIDENCE||"output/agent-chain-gateway"),cliPath=path.resolve("public/agent/naumi.mjs");await mkdir(out,{recursive:true});
  let checks=0,internalCalls=0,disconnect=false,lastOperation="",mode="ok";
  let routes:{calls:any;status:any;tools:any;uploads:any};
  const fixture=await createModelFixture(async(req,res)=>{
    try{
      const url=req.url||"/",chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
      if(url.startsWith("/api/agent-gateway/")){
        const request=new Request(fixture.origin+url,{method:req.method,headers:req.headers as Record<string,string>,...(!["GET","HEAD"].includes(req.method||"GET")?{body:bytes}: {})});
        let response:Response;
        if(url.endsWith("/calls")){lastOperation=JSON.parse(bytes.toString()).operationId;response=await routes.calls.POST(request);}
        else if(url.includes("/calls/"))response=await routes.status.GET(request,{params:Promise.resolve({operationId:url.split("/").at(-1)})});
        else if(url.endsWith("/tools"))response=await routes.tools.GET(request);
        else throw Error("Unexpected gateway path");
        if(disconnect&&url.endsWith("/calls")){disconnect=false;await response.text();req.socket.destroy();return;}
        res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)for await(const chunk of response.body as any)res.write(chunk);res.end();return;
      }
      internalCalls++;
      if(url.startsWith("/api/account")){res.setHeader("content-type","application/json");res.end(JSON.stringify({user:{creditsTotal:0,creditsUsed:0},artworks:[]}));return;}
      if(url.startsWith("/api/models")){res.statusCode=402;res.setHeader("content-type","application/json");res.end(JSON.stringify({error:"fixture refusal",code:"INSUFFICIENT_CREDITS"}));return;}
      if(url.startsWith("/api/agent/verify-image")){res.statusCode=503;res.setHeader("content-type","application/json");res.end(JSON.stringify({error:"fixture inspection unavailable"}));return;}
      res.statusCode=500;res.end("Unexpected fixture endpoint "+mode);
    }catch(error){res.statusCode=500;res.end(String(error));}
  });
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${fixture.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_RELEASE_RUNTIME:"0",INTERNAL_APP_ORIGIN:fixture.origin,NAUMI_ROUTER_MANAGEMENT_URL:fixture.origin,MODEL_CONFIG_TRUSTED_ORIGINS:fixture.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-router-token-00000000000000",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-envelope-key-00000000000000",MEDIA_DIR:path.join(out,"media"),STORAGE_DRIVER:"local",AGENT_API_KEY:"fixture-key",OPENAI_API_KEY:"fixture-key"});
  const db=await import("../src/lib/db"),tokens=await import("../src/lib/agent-gateway/tokens"),ledger=await import("../src/lib/agent-gateway/calls"),native=await import("../src/lib/native-auth");
  const owner=`gateway-${randomUUID()}@example.test`;let mcp:Client|undefined;
  const pass=(value:unknown,name:string)=>{assert.ok(value,name);checks++;console.log("PASS "+name);};
  try{
    await fixture.repo.current();await db.getOrCreateUser(owner,"Gateway fixture");
    const {getBillingRuntime}=await import("../src/lib/billing/runtime"),billing=await getBillingRuntime(),original=await billing.config.current(),config=structuredClone(original.config);
    config.switches.metering="on";config.features["image.aplus"].pricing={mode:"fixed",credits:24};await billing.config.publish({id:randomUUID(),expectedVersion:original.version,config,actor:"fixture",reason:"A-plus exposure test"});
    const read=await tokens.createAgentToken(owner,{name:"readonly",scopes:["read"],dailyCreditLimit:0,expiresInDays:1});
    const write=await tokens.createAgentToken(owner,{name:"write",scopes:["read","write"],dailyCreditLimit:5,expiresInDays:1});
    routes={calls:await import("../src/app/api/agent-gateway/v1/calls/route"),status:await import("../src/app/api/agent-gateway/v1/calls/[operationId]/route"),tools:await import("../src/app/api/agent-gateway/v1/tools/route"),uploads:await import("../src/app/api/agent-gateway/v1/uploads/route")};
    const headers=(secret=write.secret)=>({authorization:`Bearer ${secret}`,"content-type":"application/json"});
    const call=async(body:object)=>{const response=await routes.calls.POST(new Request(fixture.origin+"/api/agent-gateway/v1/calls",{method:"POST",headers:headers(),body:JSON.stringify(body)}));return {status:response.status,body:await response.text()};};
    const result=(wire:string)=>JSON.parse(wire.trim().split("\n").find(line=>JSON.parse(line).type==="result")!).call;
    const id=randomUUID(),input={operationId:id,tool:"get_balance",arguments:{},request:"original request"};
    const first=await call(input);pass(first.status===200&&result(first.body).state==="succeeded","real token and gateway execution receipt");
    const before=internalCalls;const replay=await call(input);pass(result(replay.body).state==="succeeded"&&internalCalls===before,"same request replays without a second tool call");
    const changed=await call({...input,request:"changed original request"});pass(changed.status===409&&internalCalls===before,"changed original request conflicts before execution");

    const png=await sharp({create:{width:16,height:16,channels:3,background:"white"}}).png().toBuffer();
    const form=()=>{const body=new FormData();body.append("file",new File([png],"fixture.png",{type:"image/png"}));body.append("operationId",randomUUID());return body;};
    const countBefore=Number((await db.getPool().query("SELECT count(*) AS n FROM app_artworks WHERE email=$1",[owner])).rows[0].n);
    const denied=await routes.uploads.POST(new Request(fixture.origin+"/api/agent-gateway/v1/uploads",{method:"POST",headers:{authorization:`Bearer ${read.secret}`},body:form()}));
    pass(denied.status===403,"read token cannot upload through actual Route");
    pass(Number((await db.getPool().query("SELECT count(*) AS n FROM app_artworks WHERE email=$1",[owner])).rows[0].n)===countBefore,"denied upload creates no artwork");
    const uploaded=await routes.uploads.POST(new Request(fixture.origin+"/api/agent-gateway/v1/uploads",{method:"POST",headers:{authorization:`Bearer ${write.secret}`},body:form()}));assert.equal(uploaded.status,201,await uploaded.clone().text());const image=await uploaded.json();
    pass(!!image.url,"write token retains owned upload path");
    const runtime=await import("../src/lib/agent/runtime");const vision=await runtime.resolveVisionImages([new URL(image.url).pathname],"",owner,[fixture.origin]);pass(vision.length===1,"real owned media bytes reach model vision without cookie forwarding");
    const failed=await call({operationId:randomUUID(),tool:"list_image_models",arguments:{}}),failedView=result(failed.body);
    pass(failedView.state==="rejected"&&failedView.error.submitted===false&&failedView.error.code==="INSUFFICIENT_CREDITS","actual internal 402 survives Harness as known refusal");
    const inspection=await call({operationId:randomUUID(),tool:"verify_image_output",arguments:{image_url:image.url,goal:"inspect"}}),inspectionView=result(inspection.body);
    pass(inspectionView.state==="failed"&&inspectionView.error.code==="VERIFICATION_UNAVAILABLE","inspection outage is not succeeded");

    const {quoteGatewayCall}=await import("../src/lib/agent-gateway/executor"),{withFrozenCreation}=await import("../src/lib/saas/creation-scope");
    const caller={email:owner,token:write.token,origin:fixture.origin,internalOrigin:fixture.origin,origins:[fixture.origin]};
    const quote=await withFrozenCreation({actorEmail:owner,scopeKind:"personal",tenantId:null},()=>quoteGatewayCall(caller,{tool:"generate_aplus",arguments:{image_url:image.url,platform:"amazon",lang:"en",format:"aplus-web",modules:["hero"],text:"product"}}));
    pass(quote.allowed&&quote.credits===0&&!quote.billed,"actual A-plus quote costs zero budget with an empty wallet");
    const budget=await tokens.createAgentToken(owner,{name:"concurrency",scopes:["read","write"],dailyCreditLimit:5,expiresInDays:1});
    const operations=[randomUUID(),randomUUID()];const attempts=await Promise.allSettled(operations.map(operationId=>ledger.reserveCall(budget.token,{operationId,tool:"fixture",digest:operationId,credits:3,timeoutMs:1000})));
    pass(attempts.filter(v=>v.status==="fulfilled").length===1,"token row lock prevents concurrent budget overrun");
    const accepted=operations[attempts.findIndex(v=>v.status==="fulfilled")];await ledger.finishCall(budget.token,accepted,{state:"rejected",error:{code:"INSUFFICIENT_CREDITS",message:"known refusal",submitted:false}});
    pass((await ledger.budgetState(budget.token)).spentToday===0,"known rejection releases budget exposure");
    const unknown=randomUUID();await ledger.reserveCall(budget.token,{operationId:unknown,tool:"fixture",digest:unknown,credits:3,timeoutMs:1000});await ledger.finishCall(budget.token,unknown,{state:"failed",error:{code:"TOOL_TIMEOUT",message:"unknown",submitted:"unknown"}});
    pass((await ledger.budgetState(budget.token)).spentToday===3,"unknown submission keeps budget exposure");

    const env={...process.env,NAUMI_SITE:fixture.origin,NAUMI_TOKEN:write.secret,NAUMI_CONFIG:path.join(out,"no-profile.json")};
    const cli=(args:string[])=>new Promise<{code:number|null;json:any}>((resolve,reject)=>{const child=spawn(process.execPath,[cliPath,...args],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",v=>output+=v);child.stderr.resume();child.on("error",reject);child.on("close",code=>{try{resolve({code,json:JSON.parse(output)});}catch{reject(Error("CLI output was not JSON"));}});});
    disconnect=true;const disconnected=await cli(["call","get_balance"]),cliOperation=lastOperation;
    pass(disconnected.code===5&&JSON.stringify(disconnected.json).includes(cliOperation),"CLI retains operation ID after pre-header disconnect");
    const resumed=await cli(["status",cliOperation]);pass(resumed.code===0&&resumed.json.operationId===cliOperation,"CLI recovers accepted task by original ID");
    // Actual shipped exit code for a failed call whose submission remains unknown.
    const ownUnknown=randomUUID();await ledger.reserveCall(write.token,{operationId:ownUnknown,tool:"fixture",digest:ownUnknown,credits:0,timeoutMs:1000});await ledger.finishCall(write.token,ownUnknown,{state:"failed",error:{code:"TOOL_TIMEOUT",message:"unknown",submitted:"unknown"}});
    pass((await cli(["status",ownUnknown])).code===5,"CLI status uses unknown exit code for uncertain failure");
    mcp=new Client({name:"agent-chain-fixture",version:"1"});await mcp.connect(new StdioClientTransport({command:process.execPath,args:[cliPath,"mcp"],env:env as Record<string,string>,stderr:"pipe"}));
    disconnect=true;const mcpFailure=await mcp.callTool({name:"get_balance",arguments:{}}),mcpOperation=lastOperation;
    pass(mcpFailure.isError&&JSON.stringify(mcpFailure).includes(mcpOperation),"MCP preserves its internally generated operation ID");
    const recovered=await mcp.callTool({name:"naumi_call_status",arguments:{operationId:mcpOperation}});pass(!recovered.isError&&JSON.stringify(recovered).includes('succeeded'),"MCP recovers original result without resubmission");
    await mcp.close();mcp=undefined;
    await writeFile(path.join(out,"gateway-result.json"),JSON.stringify({checks,internalFixtureCalls:internalCalls,realSupplierCalls:0,realPostgres:true,realCliMcp:true},null,2));
    console.log(`AGENT_CHAIN_GATEWAY_PG=PASS CHECKS=${checks} REAL_PG=1 CLI_MCP=1 SUPPLIER=0`);
  }finally{await mcp?.close().catch(()=>{});await db.getPool().end();await fixture.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
