import type {DeliveryOutcome,NotificationAdapter} from './notification-contracts';
// Fixed official endpoints. Secrets never leave this server-side adapter or enter returned errors.
export function createDingTalkNotificationAdapter(config:{appKey:string;appSecret:string;agentId:number;productUrl:string},request:typeof fetch=fetch):NotificationAdapter{
 const url=new URL(config.productUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!Number.isSafeInteger(config.agentId)||config.agentId<=0||!config.appKey||!config.appSecret)throw Error('DINGTALK_CONFIG_INVALID');
 let cached:{value:string;until:number}|null=null,pending:Promise<string>|null=null;
 const json=async(url:string,init?:RequestInit)=>{const r=await request(url,{...init,redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('DINGTALK_HTTP_ERROR');const reader=r.body?.getReader();if(!reader)throw Error('DINGTALK_EMPTY_RESPONSE');let size=0;const chunks:Uint8Array[]=[];for(;;){const b=await reader.read();if(b.done)break;size+=b.value.byteLength;if(size>65536){await reader.cancel();throw Error('DINGTALK_RESPONSE_LIMIT');}chunks.push(b.value);}const d=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!d||typeof d!=='object'||Array.isArray(d))throw Error('DINGTALK_RESPONSE_INVALID');return d;};
 const token=async()=>{if(cached&&cached.until>Date.now())return cached.value;if(pending)return pending;pending=(async()=>{const d=await json('https://oapi.dingtalk.com/gettoken?'+new URLSearchParams({appkey:config.appKey,appsecret:config.appSecret}));if(d.errcode!==0||typeof d.access_token!=='string'||!d.access_token||!Number.isFinite(d.expires_in)||d.expires_in<=60)throw Error('DINGTALK_TOKEN_REJECTED');cached={value:d.access_token,until:Date.now()+Math.min(d.expires_in-60,7140)*1000};return cached.value;})();try{return await pending;}finally{pending=null;}};
 const call=(path:string,t:string,body:unknown)=>json('https://oapi.dingtalk.com/topapi/message/corpconversation/'+path+'?'+new URLSearchParams({access_token:t}),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 return {
  async send(input){
   let t:string;try{t=await token();}catch{return {state:'retry',code:'DINGTALK_TOKEN_UNAVAILABLE'};}
   const content=`${input.title}\n请登录企业协作查看。\n${config.productUrl}\n通知编号：${input.id}`;
   if(Buffer.byteLength(JSON.stringify({msgtype:'text',text:{content}}))>2048||!/^[a-zA-Z0-9_.@-]{1,128}$/.test(input.userid))return {state:'dead',code:'DINGTALK_PAYLOAD_INVALID'};
   try{
    const d=await call('asyncsend_v2',t,{agent_id:config.agentId,userid_list:input.userid,to_all_user:false,msg:{msgtype:'text',text:{content}}});
    if(d.errcode===0&&Number.isSafeInteger(d.task_id)&&d.task_id>0&&String(d.task_id).length<=15)return {state:'accepted',receipt:String(d.task_id)};
    if(typeof d.errcode==='number'&&d.errcode!==0){if([40014,42001].includes(d.errcode))cached=null;return {state:[40014,42001,88,130101,-1].includes(d.errcode)?'retry':'dead',code:'DINGTALK_SEND_REJECTED'};}
    return {state:'unknown',code:'DINGTALK_SEND_RESPONSE_INVALID'};
   }catch{return {state:'unknown',code:'DINGTALK_SEND_UNCERTAIN'};}
  },
  async poll(input):Promise<DeliveryOutcome>{
   try{
    const t=await token(),d=await call('getsendresult',t,{agent_id:config.agentId,task_id:Number(input.receipt)});if(d.errcode!==0){if([40014,42001].includes(d.errcode))cached=null;return {state:'pending'};}
    const r=d.send_result;if(!r||typeof r!=='object')return {state:'pending'};
    if(['invalid_user_id_list','forbidden_user_id_list','failed_user_id_list'].some(k=>Array.isArray(r[k])&&r[k].includes(input.userid))||Array.isArray(r.forbidden_list)&&r.forbidden_list.some((x:{userid?:string})=>x.userid===input.userid))return {state:'dead',code:'DINGTALK_RECIPIENT_REJECTED'};
    if(Array.isArray(r.read_user_id_list)&&r.read_user_id_list.includes(input.userid))return {state:'delivered',read:true};
    if(Array.isArray(r.unread_user_id_list)&&r.unread_user_id_list.includes(input.userid))return {state:'delivered',read:false};
    return {state:'pending'};
   }catch{return {state:'pending'};}
  }
 };
}
