/* Optional same-origin, enterprise-authorized read adapter. Never stores source payloads in localStorage. */
(function(root){
 'use strict';
 const KINDS=['artworks','generations','ledger'];
 const text=v=>typeof v==='string'?v:'';
 function validateContext(c){if(!c||c.version!==1||c.source!=='naumi'||!text(c.instanceId)||!text(c.viewer?.email)||!['shared','dedicated'].includes(c.mode)||!Array.isArray(c.enterprises)||c.enterprises.length>100||c.enterprises.some(e=>!text(e.id)||!text(e.name)))throw Error('数据源身份信息无效');return c;}
 function validatePage(p,scope){if(!p||p.version!==1||p.source!=='naumi'||p.enterpriseId!==scope.enterpriseId||p.instanceId!==scope.instanceId||p.kind!==scope.kind||!Array.isArray(p.rows)||p.rows.length>100||!Number.isInteger(p.total)||p.total<0||!Number.isInteger(p.page)||p.page<1||!Number.isInteger(p.size)||p.size<1||p.size>100)throw Error('数据源范围或分页信息不一致');
   for(const r of p.rows){if(!r||r.ref?.instanceId!==scope.instanceId||r.ref?.enterpriseId!==scope.enterpriseId||!text(r.ref?.id)||!text(r.account?.email)||!r.credits||!r.attribution||r.attribution.businessOwnership!=='unconfirmed')throw Error('数据源记录范围不一致');
     for(const key of ['quoted','charged','reserved','delta'])if(r.credits[key]!==null&&(typeof r.credits[key]!=='number'||!Number.isFinite(r.credits[key])))throw Error('积分记录格式无效');
     for(const key of ['title','prompt','status','operation','sourceLabel','provenance','createdAt'])if(r[key]!==null&&typeof r[key]!=='string')throw Error('来源展示字段无效');
   }return p;}
 function mediaPath(row,enterpriseId){if(!row.media?.available||!row.media?.href)return null;try{const u=new URL(row.media.href,location.origin);if(u.origin!==location.origin||u.pathname!=='/api/enterprise/media'||u.searchParams.get('enterpriseId')!==enterpriseId||u.searchParams.get('email')!==row.account.email||u.searchParams.get('id')!==row.ref.id)return null;return u.pathname+u.search;}catch{return null;}}
 function createClient(request=root.fetch?.bind(root)){
   return {async read(params,signal){if(!request)throw Error('当前预览未连接数据源');const response=await request('/api/enterprise/integration?'+new URLSearchParams(params),{credentials:'same-origin',cache:'no-store',signal,headers:{Accept:'application/json'}});
     if(!response.headers.get('content-type')?.includes('application/json'))throw Error('当前预览未连接 Naumi 数据源');const data=await response.json();
     if(!response.ok)throw Error(response.status===401?'请先登录已授权的 Naumi 来源账号':response.status===403?'来源账号的企业查看授权已失效':data.error||'数据源暂不可用');
     return {data,fixture:response.headers.get('x-enterprise-fixture')==='1'};
   }};
 }
 root.EnterpriseSource={KINDS,validateContext,validatePage,mediaPath,createClient};
})(globalThis);
