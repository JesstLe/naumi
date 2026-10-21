import React from "react";
import {createRoot} from "react-dom/client";
import {BiDashboard} from "../src/components/admin/bi/dashboard";
import {SupplierModelLibrary} from "../src/components/admin/model-management/supplier-model-library";
const state:{requests:{id:number;path:string;search:string;method:string}[];releases:Record<number,(v:any)=>void>;exported:{name:string;url:string}|null;lastBlob?:Blob}=(window as any).adminFixture={requests:[],releases:{},exported:null};
const metadata={id:"12345678-1234-4234-8234-123456789abc",providerId:"fixture",providerName:"Fixture Provider",modelId:"fixture-image",label:"完整元数据测试模型",catalogOwner:"fixture",revision:7,lastSeenAt:"2026-10-21T00:00:00Z",updatedAt:"2026-10-21T00:00:00Z",family:"Fixture Family",brand:"Fixture Brand",modality:"image",notes:"完整编辑备注保留",capabilityState:"unknown",capabilitySource:"Fixture Source",capabilityUrl:"",checkedAt:"",prices:[],capabilities:{generate:null,edit:null,mask:null,vision:null,streaming:null,qualities:null,resolutions:["1K","2K"],ratios:null,maxReferences:null,contextTokens:null},parameterMetadata:{fixtureEvidence:"DETAIL_FULL_METADATA"}};
window.fetch=(async(input:any,init:any)=>{
  const u=new URL(String(input),location.origin),id=state.requests.length;state.requests.push({id,path:u.pathname,search:u.search,method:init?.method||"GET"});
  if(u.pathname==="/api/admin/fleet/status")return Response.json({enabled:false});
  if(u.pathname==="/api/admin/bi")return new Promise(resolve=>{state.releases[id]=(value:any)=>resolve(Response.json(value));});
  if(u.pathname.endsWith("/library")){
    if(u.searchParams.has("id"))return Response.json({schemaVersion:1,model:metadata});
    const {notes,parameterMetadata,capabilityUrl,capabilities,...rest}=metadata;
    const model=u.searchParams.get("view")==="summary"?{...rest,capabilities:{resolutions:capabilities.resolutions}}:metadata;
    return Response.json({schemaVersion:1,models:[model],total:1,page:1,pageSize:50,facets:{providers:[{id:"fixture",name:"Fixture Provider"}],families:["Fixture Family"],brands:["Fixture Brand"]},providers:[{id:"fixture",name:"Fixture Provider",enabled:true}]});
  }
  throw Error("Unexpected fixture fetch "+u);
}) as typeof fetch;
const click=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(this.download){state.exported={name:this.download,url:this.href};return;}click.call(this);};
const originalCreate=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{state.lastBlob=blob;return originalCreate(blob);};
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("library")?<SupplierModelLibrary/>:<BiDashboard/>);
