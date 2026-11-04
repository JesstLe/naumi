import {BarChart3,Building2,HeartPulse,ImageIcon,Layers,ShieldCheck,Users,Wallet} from 'lucide-react';
import type {BiSection} from '@/lib/bi/contracts';
export type AdminSection=BiSection|'usage'|'billing'|'pricing'|'settings'|'model-config'|'model-health'|'model-management'|'teams'|'team-access'|'feature-access'|'deployments'|'tenants'|'creations'|'supplier-balances'|'health';
export type AdminLink={label:string;href:string};
export const adminEntries:{id:AdminSection;label:string;icon:typeof Users;href:string}[]=[
{id:'overview',label:'运营概览',icon:BarChart3,href:'/admin/center'},
{id:'usage',label:'用户用量',icon:BarChart3,href:'/admin/usage'},
{id:'tenants',label:'租户管理',icon:Building2,href:'/admin/tenants'},
{id:'users',label:'用户管理',icon:Users,href:'/admin/center?section=users'},
{id:'creations',label:'创作记录',icon:ImageIcon,href:'/admin/creations'},
{id:'billing',label:'套餐与账务',icon:Wallet,href:'/admin/billing'},
{id:'model-management',label:'模型与供应商',icon:Layers,href:'/admin/model-management'},
{id:'health',label:'运行健康',icon:HeartPulse,href:'/admin/health'},
{id:'settings',label:'系统与审计',icon:ShieldCheck,href:'/admin?view=settings'},
{id:'deployments',label:'部署管理',icon:Building2,href:'/admin/deployments'}];
export const adminModuleLinks:Partial<Record<AdminSection,AdminLink[]>>={
creations:[{label:'统一创作',href:'/admin/creations'},{label:'作品数据',href:'/admin/center?section=artworks'},{label:'历史业务任务',href:'/admin/center?section=operations'},{label:'对话',href:'/admin/center?section=conversations'},{label:'调用审计',href:'/admin/center?section=calls'}],
tenants:[{label:'租户',href:'/admin/tenants'},{label:'既有团队',href:'/admin/teams'},{label:'入口授权',href:'/admin/team-access'}],
users:[{label:'用户数据',href:'/admin/center?section=users'},{label:'本站用户管理',href:'/admin/center?section=users&detail=local'},{label:'功能权限',href:'/admin/feature-access'}],
billing:[{label:'账务配置',href:'/admin/billing'},{label:'钱包与充值',href:'/admin/billing?section=wallet'},{label:'充值订单',href:'/admin/center?section=orders'},{label:'积分流水',href:'/admin/center?section=ledger'},{label:'价格表',href:'/admin/billing/price-table'},{label:'采购与对账',href:'/admin/billing/supplier-cost'},{label:'定价测算',href:'/admin/pricing'}],
'model-management':[{label:'模型管理',href:'/admin/model-management'},{label:'供应商余额',href:'/admin/supplier-balances'},{label:'完整配置',href:'/admin/bi/models'},{label:'健康巡检',href:'/admin/model-health'},{label:'质量审计',href:'/admin/center?section=models'}],
settings:[{label:'站点与接口',href:'/admin?view=settings'},{label:'管理日志',href:'/admin/center?section=management'},{label:'访问记录',href:'/admin/center?section=access'}]};
export function adminCategory(section:AdminSection):AdminSection{return ['operations','artworks','conversations','calls'].includes(section)?'creations':['teams','team-access'].includes(section)?'tenants':['model-config','model-health','models','supplier-balances'].includes(section)?'model-management':['orders','ledger','pricing'].includes(section)?'billing':['access','management'].includes(section)?'settings':section==='feature-access'?'users':section;}
/** Match links without discarding filters or existing wallet aliases. */
export function adminLinkActive(href:string,pathname:string,search:URLSearchParams):boolean{
const [path,query]=href.split('?');if(href==='/admin/model-management')return pathname===path||pathname.startsWith(path+'/');if(path!==pathname)return false;
if(path==='/admin/billing'){const wallet=['wallet','recharge','products','prices','costs','rules','credits','history','operations'].includes(search.get('section')||'')||['prices','costs','rules','products','credits','history','operations'].includes(search.get('tab')||'');return query==='section=wallet'?wallet:!wallet;}
const expected=new URLSearchParams(query);return expected.size?[...expected].every(([key,value])=>search.get(key)===value)&&(!search.has('detail')||expected.has('detail')):!search.get('section')&&!search.get('view');}
export function adminSearchLinks(deploymentsOnly:boolean,fleetEnabled:boolean){const links:(AdminLink&{group:string})[]=[];for(const entry of adminEntries){if(deploymentsOnly&&entry.id!=='deployments'||entry.id==='deployments'&&!fleetEnabled)continue;for(const link of [{label:entry.label,href:entry.href},...(adminModuleLinks[entry.id]||[])])if(!links.some(item=>item.href===link.href))links.push({...link,group:entry.label});}return links;}
