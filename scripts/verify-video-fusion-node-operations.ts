import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createVideoFixture} from "./video-fusion/harness";
import type {CanvasVideoNode} from "../src/lib/canvas/video-node-schema";
import type {CanvasTextNodeRecord} from "../src/lib/db";
import {defaultNodeSettings} from "../src/lib/canvas/node-settings";

async function main(){
  const h=await createVideoFixture({startWorker:false});
  try{
    const projectKey=`tree:${h.refs.image.id}`,a=`vnode-${randomUUID()}`,b=`vnode-${randomUUID()}`,foreign=`vnode-${randomUUID()}`,textId=`text-${randomUUID()}`;
    const beforeCredit=await h.creditState("a"),beforeTasks=await h.dbCount("app_video_tasks");
    const original=await h.request<ArrayBuffer>("a","GET",h.refs.image.url!);assert.equal(original.status,200);const originalHash=createHash("sha256").update(Buffer.from(original.body)).digest("hex");
    const text:CanvasTextNodeRecord={id:textId,projectKey,title:"完整对白",prompt:"",content:"你好。\n明天见。",status:"completed",canvasX:10,canvasY:20,width:300,height:200,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceIds:[h.refs.image.id],targetIds:[],productIds:[]};
    assert.equal((await h.request("a","POST","/api/canvas/text-nodes",text)).status,200);
    const create=async(account:"a"|"b",id:string,key:string,inputs:CanvasVideoNode["inputs"]=[])=>{
      const result=await h.request<{node:CanvasVideoNode}>(account,"POST","/api/canvas/video-nodes",{id,projectKey:key,expectedRevision:0,operationId:randomUUID(),title:"视频",x:100,y:100,config:{modelId:"video-a",providerId:"managed-video",prompt:"保留完整对白",mode:"reference",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",generateAudio:false,providerOptions:{seed:0},camera:{movement:"横移"}},inputs});assert.equal(result.status,201,JSON.stringify(result.body));return result.body.node;
    };
    let first=await create("a",a,projectKey,[{id:"image-ref",nodeId:h.refs.image.id,kind:"image",role:"reference",value:h.refs.image.url!},{id:"text-ref",nodeId:textId,kind:"text",role:"context",value:text.content}]);
    const second=await create("a",b,projectKey,[{id:"video-ref",nodeId:a,kind:"video",role:"source_video",value:"/media/pending"}]);await create("b",foreign,`tree:${foreign}`);
    const getNode=async(id:string,deleted=false)=>{const response=await h.request<{node:CanvasVideoNode}>("a","GET",`/api/canvas/video-nodes/${id}`);if(!deleted)assert.equal(response.status,200);return response;};
    const cycle=await h.request("a","PATCH",`/api/canvas/video-nodes/${a}`,{operationId:randomUUID(),expectedRevision:first.revision,inputs:[{id:"cycle-ref",nodeId:b,kind:"video",role:"source_video",value:"/media/pending"}]});assert.equal(cycle.status,422);assert.equal((await getNode(a)).body.node.revision,first.revision);
    const mixed={operationId:randomUUID(),operations:[{type:"position",id:h.refs.image.id,text:false,x:81,y:82},{type:"video-patch",id:a,expectedRevision:first.revision,fields:{x:83,y:84}}]};
    assert.equal((await h.request("a","POST","/api/canvas/history",mixed)).status,200);first=(await getNode(a)).body.node;assert.equal(first.x,83);assert.equal(first.config.generateAudio,false);assert.equal(first.config.providerOptions?.seed,0);
    assert.equal((await h.request("a","POST","/api/canvas/history",mixed)).status,200);assert.equal((await getNode(a)).body.node.revision,first.revision,"重复历史不再执行视频patch");
    assert.equal((await h.request("a","POST","/api/canvas/history",{...mixed,operations:[{type:"video-patch",id:a,expectedRevision:first.revision,fields:{x:999}}]})).status,409);
    const bad=await h.request("a","POST","/api/canvas/history",{operationId:randomUUID(),operations:[{type:"video-patch",id:a,expectedRevision:first.revision,fields:{x:999}},{type:"video-patch",id:foreign,expectedRevision:1,fields:{x:999}}]});assert.equal(bad.status,409);assert.equal((await getNode(a)).body.node.x,83,"外账号后置操作使前置修改整体回滚");
    const settings={...defaultNodeSettings(),locked:true,order:12};assert.equal((await h.request("a","POST","/api/canvas/history",{operationId:randomUUID(),operations:[{type:"node-settings",id:a,text:false,video:true,settings}]})).status,200);
    const properties=await h.request<{settings:Record<string,unknown>}>("a","GET","/api/canvas/node-settings");assert.equal(properties.status,200);assert.deepEqual(properties.body.settings[a],settings);
    const copyInput={operationId:randomUUID(),ids:[h.refs.image.id,textId,a,b]};
    const copy=await h.request<{artworkIds:string[];textNodes:CanvasTextNodeRecord[];nodes:CanvasVideoNode[];idMap:Record<string,string>;projectKey:string}>("a","POST","/api/canvas/nodes/copy",copyInput);assert.equal(copy.status,200,JSON.stringify(copy.body));
    const copiedA=copy.body.nodes.find(node=>node.id===copy.body.idMap[a])!,copiedB=copy.body.nodes.find(node=>node.id===copy.body.idMap[b])!;
    assert.equal(copiedA.inputs[0].nodeId,copy.body.idMap[h.refs.image.id]);assert.equal(copiedA.inputs[1].nodeId,copy.body.idMap[textId]);assert.equal(copiedB.inputs[0].nodeId,copiedA.id);assert.deepEqual(copiedA.config,first.config);assert.equal(copiedA.lastTaskId,null);assert.equal(copiedA.lastResultId,null);
    assert.equal(copy.body.textNodes[0].content,text.content);assert.equal(copy.body.textNodes[0].sourceIds[0],copy.body.idMap[h.refs.image.id]);
    const count=await h.dbCount("app_canvas_video_nodes");assert.equal((await h.request("a","POST","/api/canvas/nodes/copy",copyInput)).status,200);assert.equal(await h.dbCount("app_canvas_video_nodes"),count);
    assert.equal((await h.request("b","POST","/api/canvas/nodes/copy",{operationId:randomUUID(),ids:[a,b]})).status,404);
    const deleted={operationId:randomUUID(),artworkIds:copy.body.artworkIds,textIds:copy.body.textNodes.map(node=>node.id),videoIds:copy.body.nodes.map(node=>node.id)};
    assert.equal((await h.request("a","POST","/api/canvas/nodes/delete",{...deleted,operationId:randomUUID(),videoIds:[copiedA.id,foreign]})).status,500);assert.equal((await getNode(copiedA.id)).status,200,"越权删除不能部分删除");
    assert.equal((await h.request("a","POST","/api/canvas/nodes/delete",deleted)).status,200);assert.equal((await h.request("a","POST","/api/canvas/nodes/delete",deleted)).status,200);assert.equal((await getNode(copiedA.id,true)).status,404);
    const deletedList=await h.request<{nodes:CanvasVideoNode[]}>("a","GET","/api/canvas/video-nodes?includeDeleted=1");assert.ok(deletedList.body.nodes.find(node=>node.id===copiedA.id)?.deletedAt);
    const restore={operationId:randomUUID(),operations:[...copy.body.artworkIds.map(id=>({type:"visibility",id,visible:true})),...copy.body.textNodes.map(node=>({type:"text-restore",node})),...copy.body.nodes.map(node=>({type:"video-visibility",id:node.id,visible:true}))]};
    assert.equal((await h.request("a","POST","/api/canvas/history",restore)).status,200);assert.equal((await getNode(copiedA.id)).body.node.config.prompt,first.config.prompt);
    const removeProject={operationId:randomUUID(),projectKey:copy.body.projectKey};assert.equal((await h.request("a","POST","/api/canvas/nodes/delete",removeProject)).status,200);assert.equal((await h.request("a","POST","/api/canvas/nodes/delete",removeProject)).status,200);assert.equal((await getNode(copiedA.id,true)).status,404);
    assert.deepEqual(await h.creditState("a"),beforeCredit);assert.equal(await h.dbCount("app_video_tasks"),beforeTasks);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
    const after=await h.request<ArrayBuffer>("a","GET",h.refs.image.url!);assert.equal(createHash("sha256").update(Buffer.from(after.body)).digest("hex"),originalHash);
    console.log("VIDEO_NODE_OPERATIONS=PASS actual_app_db=true mixed_history_once=true atomic_ownership=true graph_copy=true delete_restore=true project_delete=true supplier_calls=0");
  }finally{await h.stop();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
