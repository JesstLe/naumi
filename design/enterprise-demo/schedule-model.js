/* Pure local prototype model. No business network adapter. */
(function(root){
 'use strict';
 const clone=v=>JSON.parse(JSON.stringify(v));
 const system=[['title','产品需求 / 制作任务',310],['image','产品图',100],['assignee','执行人',135],['owner','需求方',130],['due','承诺交付',140],['planStart','计划开始',140],['planEnd','计划结束',140],['estimatedHours','预计小时',110],['status','任务状态',115],['kind','任务类型',115],['quantity','交付数量',110],['brief','需求文档',130]];
 const tints=['white','blue','yellow','green','purple'];
 const blank=()=>({columns:system.map(([id,label,width])=>({id,label,width,visible:true,tint:id==='brief'?'yellow':id==='owner'?'blue':'white'})),group:'assignee',density:'normal',summary:true,layout:'table'});
 const create=()=>({schema:1,revision:1,published:blank(),history:[{revision:1,config:blank(),at:'2026-10-17T00:00:00Z',actor:'lead',note:'初始产品制作模板'}],draft:null,fields:[],values:{},personal:{},audit:[]});
 function fail(message){throw new Error(message);}
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function validateConfig(c,fields=[]){
  if(!c||!Array.isArray(c.columns)||!c.columns.length||c.columns.length>33)fail('列配置结构错误');
  const ids=new Set([...system.map(f=>f[0]),...fields.map(f=>f.id),'scheduleTag']),seen=new Set();
  for(const x of c.columns){if(!ids.has(x.id)||seen.has(x.id))fail('字段引用无效或重复');seen.add(x.id);if(typeof x.label!=='string'||!x.label.trim()||x.label.length>24)fail('列名称需1–24字');if(!Number.isInteger(x.width)||x.width<(x.id==='title'?240:100)||x.width>420)fail('列宽超出范围');if(typeof x.visible!=='boolean'||!tints.includes(x.tint))fail('列样式无效');}
  if(c.columns[0].id!=='title'||!c.columns[0].visible)fail('名称列必须固定显示在首列');
  if(system.some(x=>!seen.has(x[0])))fail('系统字段不可移除');
  if(!['none','assignee','owner'].includes(c.group)||!['compact','normal','relaxed'].includes(c.density)||!['table','split'].includes(c.layout)||typeof c.summary!=='boolean')fail('布局配置无效');return c;
 }
 function validateState(s){
  if(!s||s.schema!==1||!Number.isInteger(s.revision)||s.revision<1||!Array.isArray(s.fields)||s.fields.length>20||!Array.isArray(s.history)||!s.history.length||s.history.length>20||!Array.isArray(s.audit)||!s.values||Array.isArray(s.values)||typeof s.values!=='object'||!s.personal||Array.isArray(s.personal)||typeof s.personal!=='object')fail('配置结构损坏');
  const ids=new Set();for(const f of s.fields){if(!/^custom_[a-zA-Z0-9_]+$/.test(f.id)||ids.has(f.id)||typeof f.label!=='string'||!f.label.trim()||f.label.length>24||!['text','number','date','select'].includes(f.type)||!Array.isArray(f.options)||typeof f.archived!=='boolean')fail('字段结构损坏');ids.add(f.id);if(f.type==='select'&&(!f.options.length||f.options.length>12||new Set(f.options).size!==f.options.length||f.options.some(x=>typeof x!=='string'||!x.trim()||x.length>20)))fail('选项结构损坏');}
  validateConfig(s.published,s.fields);for(const h of s.history){if(!h||!Number.isInteger(h.revision)||h.revision>s.revision)fail('版本记录损坏');validateConfig(h.config,s.fields);}if(!s.history.some(h=>h.revision===s.revision))fail('当前版本缺失');
  if(s.draft){if(!Number.isInteger(s.draft.baseRevision))fail('草稿版本无效');validateConfig(s.draft.config,s.fields);}for(const p of Object.values(s.personal)){validateConfig(p.config,s.fields);if(!p.filters||typeof p.filters.query!=='string'||typeof p.filters.assignee!=='string'||typeof p.filters.status!=='string')fail('个人筛选损坏');}
  for(const row of Object.values(s.values)){if(!row||Array.isArray(row)||typeof row!=='object')fail('自定义值损坏');for(const [id,v] of Object.entries(row)){const f=s.fields.find(x=>x.id===id);if(!f)fail('自定义字段引用丢失');validateValue(f,v);}}
  return s;
 }
 function move(c,id,delta){const r=clone(c),i=r.columns.findIndex(x=>x.id===id),j=i+delta;if(i>0&&j>0&&j<r.columns.length)[r.columns[i],r.columns[j]]=[r.columns[j],r.columns[i]];return r;}
 function audit(s,actor,operation){s.audit.unshift({actor,operation,at:new Date().toISOString()});s.audit=s.audit.slice(0,100);}
 function publish(s,config,base,actor='lead',note='发布团队模板'){
  if(actor!=='lead')fail('仅主管可发布团队模板');if(s.revision!==base)fail('模板版本冲突，请保留草稿并重新载入');validateConfig(config,s.fields);const n=clone(s);n.revision++;n.published=clone(config);n.history.push({revision:n.revision,config:clone(config),at:new Date().toISOString(),actor,note});n.history=n.history.slice(-20);n.draft=null;audit(n,actor,note);return n;
 }
 function restore(s,rev,base,actor){const h=s.history.find(x=>x.revision===rev);if(!h)fail('历史版本不存在');return publish(s,h.config,base,actor,'恢复布局 v'+rev);}
 function addField(s,{label,type,options=[]},actor,id){
  if(actor!=='lead')fail('仅主管可管理团队字段');label=String(label).trim();if(!label||label.length>24)fail('字段名称需1–24字');if(s.fields.some(f=>f.label===label)||system.some(f=>f[1]===label))fail('字段名称已存在');if(s.fields.length>=20)fail('字段总数最多20个（含归档）');if(!['text','number','date','select'].includes(type))fail('字段类型无效');
  if(type==='select'&&(!options.length||options.length>12||new Set(options).size!==options.length||options.some(x=>!x.trim()||x.length>20)))fail('选项需1–12个且不得重复');
  if(!/^custom_[a-zA-Z0-9_]+$/.test(id)||s.fields.some(f=>f.id===id))fail('字段ID无效');const n=clone(s);n.fields.push({id,label,type,options:type==='select'?options:[],archived:false});audit(n,actor,'新增字段：'+label);return n;
 }
 function archiveField(s,id,actor){if(actor!=='lead')fail('仅主管可管理团队字段');const n=clone(s),f=n.fields.find(x=>x.id===id);if(!f)fail('字段不存在');f.archived=true;audit(n,actor,'归档字段：'+f.label);return n;}
 function validateValue(f,v){if(v===''||v===null)return '';if(f.type==='number'){if(typeof v!=='number'||!Number.isFinite(v))fail('请输入有效数字');}else if(f.type==='date'){if(!date(v))fail('日期无效');}else if(f.type==='select'){if(!f.options.includes(v))fail('请选择有效选项');}else if(typeof v!=='string'||v.length>500)fail('文本最多500字');return v;}
 function setValues(s,taskId,input,actor){const n=clone(s);for(const [id,v] of Object.entries(input)){const f=n.fields.find(x=>x.id===id&&!x.archived);if(!f)fail('字段不可编辑');validateValue(f,v);n.values[taskId]??={};n.values[taskId][id]=v;}audit(n,actor,'填写任务扩展字段：'+taskId);return n;}
 function schedulePatch(task,input,actor){
  if(actor!=='lead')fail('仅主管可调整团队排期');if(task.status==='accepted')fail('已验收任务不修改排期');
  const p={};for(const k of ['planStart','planEnd','due']){p[k]=input[k]||'';if(p[k]&&!date(p[k]))fail('日期无效');}if(!p.due)fail('承诺日期必填');if(Boolean(p.planStart)!==Boolean(p.planEnd))fail('计划开始和结束需同时填写');if(p.planStart>p.planEnd)fail('计划结束不能早于开始');
  p.estimatedHours=input.estimatedHours===''?null:Number(input.estimatedHours);if(p.estimatedHours!==null&&(!Number.isFinite(p.estimatedHours)||p.estimatedHours<0||p.estimatedHours>160))fail('预计小时需0–160');p.quantity=input.quantity===''?null:Number(input.quantity);if(p.quantity!==null&&(!Number.isInteger(p.quantity)||p.quantity<0||p.quantity>10000))fail('数量需0–10000整数');p.unit=input.unit;if(!['张','套','项','个'].includes(p.unit))fail('单位无效');
  if(p.planStart&&(new Date(p.planEnd+'T00:00:00Z')-new Date(p.planStart+'T00:00:00Z'))/86400000>365)fail('原型单任务计划最长366天');
  if(!String(input.reason||'').trim()||input.reason.length>200)fail('请填写1–200字变更原因');if(!['','designer','artist'].includes(input.assignee))fail('执行人无效');
  if((task.assignee||'')!==input.assignee){if(!['open','assigned','claimed'].includes(task.status))fail('执行中转派需交接流程');p.assignee=input.assignee||null;p.status=p.assignee?'assigned':'open';p.percent=0;}
  return p;
 }
 function dates(start,end){if(!date(start)||!date(end)||start>end)return [];const result=[],a=new Date(start+'T00:00:00Z');while(a.toISOString().slice(0,10)<=end&&result.length<366){result.push(a.toISOString().slice(0,10));a.setUTCDate(a.getUTCDate()+1);}return result;}
 const workday=d=>![0,6].includes(new Date(d+'T00:00:00Z').getUTCDay());
 function load(tasks,user,day){return tasks.filter(t=>t.assignee===user&&t.status!=='accepted'&&t.planStart<=day&&t.planEnd>=day&&Number.isFinite(t.estimatedHours)).reduce((sum,t)=>{const days=dates(t.planStart,t.planEnd).filter(workday);return sum+(days.includes(day)&&days.length?t.estimatedHours/days.length:0);},0);}
 function warnings(task){const out=[];if(!task.planStart||!task.planEnd||task.estimatedHours==null)out.push('排期资料不完整');if(task.planStart&&task.planEnd&&!dates(task.planStart,task.planEnd).some(workday))out.push('计划仅含休息日，需主管确认工作日历');if(task.planEnd>task.due)out.push('计划晚于承诺交付');return out;}
 function visibleColumns(c,fields){return c.columns.filter(x=>x.visible&&(!x.id.startsWith('custom_')||fields.some(f=>f.id===x.id&&!f.archived)));}
 root.ScheduleModel={clone,system,tints,blank,create,date,validateConfig,validateState,move,publish,restore,addField,archiveField,setValues,validateValue,schedulePatch,dates,workday,load,warnings,visibleColumns};
})(globalThis);
