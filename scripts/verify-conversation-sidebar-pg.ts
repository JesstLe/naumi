import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  let providerCalls=0,checks=0;
  const fixture=await createModelFixture((_req,res)=>{providerCalls++;res.writeHead(500);res.end("No generation in history tests");});
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${fixture.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_RELEASE_RUNTIME:"1",NAUMI_INSTANCE_ID:"conversation-sidebar-fixture",SOURCE_COMMIT:"c".repeat(40),NAUMI_RELEASE_ADMISSION_START:"open"});
  const db=await import("../src/lib/db"),repo=await import("../src/lib/agent/session-repository"),release=await import("../src/lib/release-runtime/store"),api=await import("../src/app/api/agent/session/route"),auth=await import("../src/lib/native-auth");
  const owner=`sidebar-${randomUUID()}@example.test`,other=`other-${randomUUID()}@example.test`;
  const headers={cookie:`nv_user=${auth.signUserSession(owner,Date.now())}`,"Content-Type":"application/json"};
  const req=(method:string,body?:unknown,id?:string)=>new Request(fixture.origin+"/api/agent/session"+(id?"?id="+id:""),{method,headers,body:body?JSON.stringify(body):undefined});
  const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;console.log("PASS "+label);};
  try{
    await db.getOrCreateUser(owner,"Sidebar fixture");await db.getOrCreateUser(other,"Other fixture");
    await repo.saveAgentSession(owner,"old-pin","旧标题",[{role:"assistant",content:"![旧](/media/old.png)"}],[],null);
    await repo.saveAgentSession(owner,"recent","近期对话",[{role:"assistant",content:"![新](/media/new.png)"}],[{type:"tool_start",tool:"generate_image"}],null);
    await repo.saveAgentSession(other,"old-pin","其他账户",[],[],null);
    const before=(await repo.getAgentSession(owner,"old-pin"))!.revision;
    let response=await api.PATCH(req("PATCH",{id:"old-pin",pinned:true}));check(response.status===200,"HTTP pin succeeds");
    const pinned=await response.json();check(typeof pinned.pinnedAt==="string","server supplies durable pin timestamp");
    check((await repo.getAgentSession(owner,"old-pin"))!.revision===before,"pin does not invalidate content CAS");
    check(!(await repo.listAgentSessions(other))[0].pinned_at,"pin cannot mutate same id on other account");
    response=await api.GET(req("GET"));let list=(await response.json()).sessions;
    check(list[0].id==="old-pin"&&!!list[0].pinnedAt,"HTTP refreshed list keeps pin ordering");
    check(list.find((x:any)=>x.id==="recent").preview.status==="generating","history projects running image state");
    check(list[0].preview.image==="/media/old.png","history exposes only actual latest image URL");
    const active=await release.beginAgentActivity(owner,"old-pin","workbench");
    response=await api.PATCH(req("PATCH",{id:"old-pin",pinned:false}));check(response.status===200,"pin metadata can change during accepted run");
    response=await api.PATCH(req("PATCH",{id:"old-pin",title:"不得覆盖"}));check(response.status===409,"running rename remains blocked by owner lock");
    response=await api.DELETE(req("DELETE",undefined,"old-pin"));check(response.status===409,"running delete remains blocked by owner lock");await release.finishActivity(active);
    response=await api.PATCH(req("PATCH",{id:"old-pin",title:"  新的  标题  "}));check(response.status===200,"idle rename succeeds via HTTP");check((await repo.getAgentSession(owner,"old-pin"))!.title==="新的 标题","rename persisted normalized title");
    response=await api.PATCH(req("PATCH",{id:"old-pin",pinned:"true"}));check(response.status===400,"invalid pin type rejected");
    response=await api.PATCH(req("PATCH",{id:"old-pin",pinned:true,title:"mixed"}));check(response.status===400,"ambiguous mutation rejected");
    response=await api.PATCH(req("PATCH",{id:"missing",pinned:true}));check(response.status===404,"unknown session not fabricated");
    response=await api.PATCH(req("PATCH",{id:"cv-private",pinned:true}));check(response.status===400,"canvas history not mutated through workbench");
    const anonymous=await api.PATCH(new Request(fixture.origin+"/api/agent/session",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"old-pin",pinned:true})}));check(anonymous.status===401,"anonymous mutation rejected");
    response=await api.DELETE(req("DELETE",undefined,"old-pin"));check(response.status===200&&!await repo.getAgentSession(owner,"old-pin"),"idle delete removes owned session");check(!!await repo.getAgentSession(other,"old-pin"),"delete preserves other account same id");
    await assert.rejects(repo.saveAgentSession(owner,"old-pin","stale",[],[],before));checks++;check(!await repo.getAgentSession(owner,"old-pin"),"late save cannot resurrect deleted row");
    check(providerCalls===0,"no generation/provider requests");
    console.log(`CONVERSATION_SIDEBAR_PG_PASS checks=${checks} realPostgres=1 realRoutes=1 supplierCalls=0`);
  }finally{await release.releasePool().end();await db.getPool().end();await fixture.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
