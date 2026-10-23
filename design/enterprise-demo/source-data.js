/* Same-origin source reads. Local project sessions are not Naumi native logins; no payload persistence. */
(function(root){
 'use strict';
 const KINDS=['artworks','generations','ledger'];
 const text=v=>typeof v==='string'?v:'';
 const nullableText=v=>v===null||typeof v==='string';
 function validatePerson(person){if(person!==undefined&&person!==null&&(typeof person!=='object'||['id','realName','nickname'].some(k=>!nullableText(person[k]))))throw Error('来源成员姓名格式无效');}
 function validateContext(c){
   if(!c||c.version!==1||c.source!=='naumi'||!text(c.instanceId)||!text(c.viewer?.email)||!['shared','dedicated'].includes(c.mode)||!Array.isArray(c.enterprises)||c.enterprises.length>100||c.enterprises.some(e=>!text(e.id)||!text(e.name)))throw Error('数据源身份信息无效');
   if(c.preview&&(c.preview.transport!=='local-snapshot'||c.preview.ownership!=='legacy-unconfirmed-and-frozen-tenant'||!nullableText(c.preview.observedAt)||['from','to'].some(k=>c.preview[k]!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(c.preview[k]))))throw Error('来源快照信息无效');
   return c;
 }
 function validateMembers(p,enterpriseId){if(p?.enterprise?.id!==enterpriseId||!Array.isArray(p.members)||p.members.some(m=>!m||!text(m.email)))throw Error('来源成员范围不一致');for(const member of p.members)validatePerson(member.person);return p;}
 function validatePage(p,scope){
   if(!p||p.version!==1||p.source!=='naumi'||p.enterpriseId!==scope.enterpriseId||p.instanceId!==scope.instanceId||p.kind!==scope.kind||!Array.isArray(p.rows)||p.rows.length>100||!Number.isInteger(p.total)||p.total<0||!Number.isInteger(p.page)||p.page<1||!Number.isInteger(p.size)||p.size<1||p.size>100||p.rows.length>p.size||p.rows.length>p.total)throw Error('数据源范围或分页信息不一致');
   for(const r of p.rows){
     if(!r||r.ref?.instanceId!==scope.instanceId||r.ref?.enterpriseId!==scope.enterpriseId||!text(r.ref?.id)||!text(r.account?.email)||!r.credits||!r.attribution||r.attribution.businessOwnership!=='unconfirmed'||(r.ownership!==undefined&&!['legacy-unconfirmed','frozen-tenant'].includes(r.ownership)))throw Error('数据源记录范围不一致');
     validatePerson(r.account.person);
     for(const key of ['quoted','charged','reserved','delta',...('refunded' in r.credits?['refunded']:[])])if(r.credits[key]!==null&&(typeof r.credits[key]!=='number'||!Number.isFinite(r.credits[key])))throw Error('积分记录格式无效');
     for(const key of ['title','prompt','status','operation','sourceLabel','provenance','createdAt'])if(!nullableText(r[key]))throw Error('来源展示字段无效');
   }
   return p;
 }
 function mediaPath(row,enterpriseId){
   if(!row?.media?.available||!text(row.media.href)||!text(enterpriseId)||row.ref?.enterpriseId!==enterpriseId||!text(row.account?.email)||!text(row.ref?.id))return null;
   try{
     const origin=root.location.origin,u=new URL(row.media.href,origin),snapshot=u.pathname==='/api/enterprise/imports';
     if(u.origin!==origin||u.username||u.password||u.hash||(!snapshot&&u.pathname!=='/api/enterprise/media'))return null;
     const expected={enterpriseId,email:row.account.email,id:row.ref.id,...(snapshot?{action:'source-snapshot',op:'media'}:{})};
     if([...u.searchParams.keys()].some(k=>!Object.hasOwn(expected,k))||Object.entries(expected).some(([k,v])=>u.searchParams.getAll(k).length!==1||u.searchParams.get(k)!==v))return null;
     return u.pathname+u.search;
   }catch{return null;}
 }
 function createClient(request=root.fetch?.bind(root)){
   let session=null,transport='snapshot',snapshotConfirmed=false;
   async function readJSON(path,signal,local){
     if(!request)throw Error('当前预览未连接数据源');
     if(signal?.aborted){const error=Error('来源读取已取消');error.name='AbortError';throw error;}
     const response=await request(path,{method:'GET',credentials:'same-origin',cache:'no-store',signal,headers:{Accept:'application/json'}});
     const json=response.headers.get('content-type')?.includes('application/json');let data=null;
     if(json){try{data=await response.json();}catch{if(response.ok)throw Error('数据源响应格式无效');}}
     if(!response.ok){
       const error=Error(response.status===401?(local?'本机项目管理员会话已失效，请重新连接':'请先登录已授权的 Naumi 来源账号'):response.status===403?(local?'当前本机会话没有来源查看权限':'来源账号的企业查看授权已失效'):typeof data?.error==='string'?data.error:'数据源暂不可用');
       error.status=response.status;error.code=data?.error;throw error;
     }
     if(!json)throw Error('当前预览未连接 Naumi 数据源');
     return {data,fixture:response.headers.get('x-enterprise-fixture')==='1'};
   }
   return {async read(params,signal){
     const {action,...query}=params;if(!['context','members','records'].includes(action))throw Error('来源读取操作无效');
     if(!session)session=readJSON('/api/enterprise/imports?action=session',signal,true);
     await session;
     if(transport==='snapshot'){
       try{
         const result=await readJSON('/api/enterprise/imports?'+new URLSearchParams({action:'source-snapshot',op:action,...query}),signal,true);
         snapshotConfirmed=true;return result;
       }catch(error){
         // A missing snapshot may use the original port. Never mix a loaded snapshot with live pages.
         if(error.status!==503||action!=='context'||snapshotConfirmed||signal?.aborted)throw error;
         transport='integration';
       }
     }
     return readJSON('/api/enterprise/integration?'+new URLSearchParams({action,...query}),signal,false);
   }};
 }
 root.EnterpriseSource={KINDS,validateContext,validateMembers,validatePage,mediaPath,createClient};
})(globalThis);
