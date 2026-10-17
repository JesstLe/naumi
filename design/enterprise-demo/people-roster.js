/* Pure clipboard parser; embedded into the one-file product shell by build-people-roster.mjs. */
(function(root){
 'use strict';
 const headers=['人员ID','版本','真名','花名','Naumi邮箱','来源实例','来源企业ID','启用'];
 function parse(text,uuid){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>128*1024)throw Error('清单最多128KiB');
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
  const endCell=()=>{row.push(cell);cell='';closed=false;};const endRow=()=>{endCell();if(row.some(c=>c.trim()))rows.push(row);row=[];if(rows.length>101)throw Error('每批最多100条人员资料');};
  for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
   if(ch==='\t'){endCell();continue;}if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;endRow();continue;}
   if(closed)throw Error('引号结束后应为制表符或换行');if(ch==='"'){if(cell.length)throw Error('字段内的引号应使用双引号转义');quoted=true;}else cell+=ch;
  }
  if(quoted)throw Error('存在未闭合的引号');if(cell.length||row.length||closed)endRow();
  if(!rows.length||rows[0].length!==headers.length||rows[0].some((c,i)=>c.trim()!==headers[i]))throw Error('请保留模板的8列表头，使用制表符分隔');
  if(rows.length<2)throw Error('请填写至少一条人员资料');
  const entries=[],errors=[];const validId=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  for(const [index,raw]of rows.slice(1).entries()){
   if(raw.length!==8){errors.push({index,message:'应有8列，当前为'+raw.length+'列'});continue;}
   const [id,v,realName,nickname,email,instance,enterprise,enabled]=raw.map(s=>s.trim());const fail=message=>errors.push({index,message});
   if(id&&!validId(id))fail('人员ID不是完整UUID');if(id&&!/^[1-9][0-9]*$/.test(v)||!id&&v&&!/^0$/.test(v))fail('新增版本留空或0，更新必须填写原正整数版本');
   if(!realName||realName.length>100||nickname.length>100)fail('真名必填，真名和花名最多100字');
   if([email,instance,enterprise].some(Boolean)&&![email,instance,enterprise].every(Boolean))fail('账号的邮箱、来源实例、来源企业ID须同时填写');
   if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))fail('Naumi邮箱格式不正确');if(instance&&!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/.test(instance))fail('来源实例格式不正确');if(enterprise&&!validId(enterprise))fail('来源企业ID不是完整UUID');
   if(enabled&&!['是','否','true','false','1','0'].includes(enabled)||id&&!enabled)fail('启用填写是/否；更新时不可留空');
   if(raw.some(v=>/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)))fail('字段包含不支持的控制字符');
   const expectedVersion=v?Number(v):0;if(!Number.isSafeInteger(expectedVersion))fail('版本超出有效范围');
   entries.push({personId:id||uuid(),expectedVersion,realName,nickname,source:email?{instance,enterpriseId:enterprise,subject:email.toLowerCase()}:null,enabled:!['否','false','0'].includes(enabled)});
  }
  return {entries,errors};
 }
 const quote=value=>/[\t\r\n"]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;
 function fromProfiles(profiles){if(profiles.length>100)throw Error('当前超过100份资料，请按完整人员ID分批整理');return [headers,...profiles.map(p=>[p.id,String(p.version),p.realName,p.nickname,p.source?.subject||'',p.source?.instance||'',p.source?.enterpriseId||'',p.enabled?'是':'否'])].map(row=>row.map(quote).join('\t')).join('\r\n');}
 root.PeopleRoster={headers,parse,fromProfiles,template:()=>headers.join('\t')+'\r\n'};
})(typeof module==='object'&&module.exports?module.exports:globalThis);
