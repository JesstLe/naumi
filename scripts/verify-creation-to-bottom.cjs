/* 回到底部按钮显隐回归：
 * 真实 creation-workbench.tsx 经 esbuild 转译 + 最小 React shim 挂载，
 * stub document.scrollingElement 滚动指标并派发 window scroll 事件。
 * 场景：初始底部隐藏 / 中段显示 / 临界阈值 / 点击回底并恢复跟随 /
 *      滚轮断开跟随 / 新消息仍显示 / 短对话不滚动 / 切换会话重置 / 首页无按钮无监听。
 */
const assert=require("assert");
const path=require("path");
const fs=require("fs");
const os=require("os");
const esbuild=require("esbuild");

const ROOT=path.join(__dirname,"..");
const SRC=path.join(ROOT,"src","components","home","creation-workbench.tsx");

let checks=0,failures=0;
function check(name,cond){checks++;if(cond){console.log("PASS",name);}else{failures++;console.log("FAIL",name);}}

/* ---------- 最小 React shim ---------- */
const shim=(()=>{const api={};
api.Fragment="@@fragment";
api.createElement=function(type,config,...kids){const props={...(config||{})};props.children=kids.length===1?kids[0]:kids;return{__el:1,type,props};};
let renderState=null;
function normalize(kid){if(kid==null||typeof kid==="boolean")return null;if(Array.isArray(kid))return kid.map(normalize).filter(Boolean);return kid;}
function walk(node){if(node==null)return null;
  if(node.__el){
    if(typeof node.type==="function"){const value=node.type(node.props);return walk(normalize(value));}
    const dom={type:node.type,props:node.props,children:[]};
    if(typeof node.props.className==="string")dom.className=node.props.className;
    if(node.props.ref&&typeof node.props.ref==="object")node.props.ref.current=dom;
    const kids=normalize(node.props.children);const list=Array.isArray(kids)?kids:[kids];
    for(const k of list){if(k==null)continue;const c=walk(k);if(c)dom.children.push(c);}
    dom.scrollIntoView=(opts)=>{globalThis.__scrollCalls.push({node:dom,opts});};
    return dom;}
  if(typeof node==="object"&&"text" in node)return node;
  return{text:String(node)};}
api.useState=function(init){const r=renderState;const i=r.hookIndex++;const slot=r.inst.slots[i]||(r.inst.slots[i]={value:typeof init==="function"?init():init});const set=(v)=>{const next=typeof v==="function"?v(slot.value):v;if(next===slot.value)return;slot.value=next;r.scheduled=true;};return[slot.value,set];};
api.useRef=function(v){const r=renderState;const i=r.hookIndex++;return r.inst.slots[i]||(r.inst.slots[i]={current:v});};
api.useEffect=function(fn,deps){const r=renderState;const i=r.hookIndex++;const slot=r.inst.slots[i]||(r.inst.slots[i]={deps:undefined,cleanup:undefined});const old=slot.deps;const changed=old===undefined||!deps||!old||deps.length!==old.length||deps.some((d,k)=>d!==old[k]);if(changed)r.pendingEffects.push({slot,fn,deps});};
api._mount=function(Component,props){
  const r={inst:{slots:[]},scheduled:false,pendingEffects:[],hookIndex:0,props};
  r.commit=function(newProps){if(newProps!==undefined)this.props=newProps;
    this.hookIndex=0;this.pendingEffects=[];
    const prev=renderState;renderState=this;
    let out;try{out=Component(this.props);}finally{renderState=prev;}
    this.dom=walk(out);
    for(const e of this.pendingEffects){if(typeof e.slot.cleanup==="function")e.slot.cleanup();e.slot.cleanup=e.fn()||undefined;e.slot.deps=e.deps;}};
  r.scheduled=true;return r;};
return api;})();
globalThis.React=shim;

/* ---------- window / document 桩 ---------- */
const listeners=new Map();
globalThis.window={addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){if(listeners.has(type))listeners.get(type).delete(fn);},dispatchEvent(ev){const set=listeners.get(ev.type);if(!set)return false;for(const fn of set)fn(ev);return true;}};
function scrollListenerCount(){return (listeners.get("scroll")||new Set()).size;}
const scrollState={scrollHeight:2000,scrollTop:2000,clientHeight:900};
globalThis.document={scrollingElement:scrollState,documentElement:{classList:{contains:()=>false}},addEventListener(){},removeEventListener(){}};
globalThis.__scrollCalls=[];
function away(v){scrollState.scrollHeight=scrollState.scrollTop+scrollState.clientHeight+v;}
let activeRenderer=null;
function flush(){const r=activeRenderer;let guard=0;while(r.scheduled&&guard++<50){r.scheduled=false;r.commit();}}
function fireScroll(){globalThis.__scrollCalls.length=0;flush();globalThis.window.dispatchEvent({type:"scroll"});flush();}
function render(props){activeRenderer.commit(props);flush();}

/* ---------- esbuild 转译真实源码 ---------- */
const STUBS={
  "react":"module.exports={createElement:globalThis.React.createElement,useState:globalThis.React.useState,useEffect:globalThis.React.useEffect,useRef:globalThis.React.useRef,Fragment:globalThis.React.Fragment};",
  "@/lib/auth-context":'module.exports={useAuth:()=>({user:{email:"t@example.com",name:"Tester"},ready:true,remaining:1000,signOut(){}})};',
  "@/lib/auth-modal-context":'module.exports={useAuthModal:()=>({openAuth(){}})};',
  "@/lib/brand-context":'module.exports={useBrand:()=>({logo:"/brand/naumi/horizontal-black.svg",logoHasText:false,name:"Naumi"})};',
  "@/lib/feature-access/client":'module.exports={useFeatureAccess:()=>({can:()=>true,canPage:()=>true})};',
  "@/lib/recharge-modal-context":'module.exports={useRecharge:()=>({openRecharge(){}})};',
  "@/components/account/account-dock-menu":'module.exports={ACCOUNT_THEME_EVENT:"theme-event",AccountDockMenu:()=>"@@null",toggleAccountTheme:()=>false,useTeamEntryAccess:()=>null};',
  "@/components/ui/surface-appearance":'module.exports={SurfaceAppearanceProvider:({children})=>children};',
  "@/components/saas/workspace-selector":'module.exports={WorkspaceSelector:()=>"@@null"};',
  "@/components/cached-image":'module.exports={CachedImage:(p)=>globalThis.React.createElement("img",{src:p.src,alt:p.alt})};',
  "@/components/site-footer":'module.exports={SiteFooter:()=>"@@null"};',
  "@/lib/site-control/client":'module.exports={useSiteProfile:()=>({mode:"platform"})};',
  "@/lib/image-skills/catalog":'module.exports={OFFICIAL_IMAGE_SKILLS:[]};',
  "./use-creation-projects":'module.exports={useCreationProjects:()=>({projects:[],loading:false,error:null,retry(){}})};',
  "./creation-composer":'module.exports={CreationComposer:()=>globalThis.React.createElement("div",{className:"stub-composer"},"composer")};',
  "./creation-discovery":'module.exports={CreationDiscovery:()=>"@@null"};',
  "./creation-message":'module.exports={CreationMessage:()=>globalThis.React.createElement("div",{className:"stub-message"},"m"),CreationImageViewer:()=>"@@null"};',
  "lucide-react":'module.exports=new Proxy({},{get:(_t,k)=>(props)=>globalThis.React.createElement("svg",{"data-icon":String(k),...props})});',
  "next/link":'module.exports=(p)=>globalThis.React.createElement("a",{href:p.href,onClick:p.onClick,className:p.className,title:p.title,"aria-label":p["aria-label"]},p.children);',
  "./creation-workbench.module.css":'const h=new Proxy({},{get:(_t,k)=>typeof k==="string"?"cx_"+k:""});export default h;',
};
const STUB_FILTER=/^(react$|@\/|lucide-react$|next\/link$|\.\/(use-creation-projects|creation-composer|creation-discovery|creation-message|creation-workbench\.module\.css)$)/;
async function build(){
  const outfile=path.join(os.tmpdir(),`verify-to-bottom-${process.pid}.cjs`);
  await esbuild.build({entryPoints:[SRC],bundle:true,format:"cjs",platform:"node",jsx:"transform",jsxFactory:"React.createElement",jsxFragment:"React.Fragment",outfile,logLevel:"silent",
    plugins:[{name:"stub",setup(b){
      b.onResolve({filter:STUB_FILTER},args=>({path:args.path,namespace:"stub"}));
      b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:STUBS[args.path]||"module.exports={};",loader:"js"}));}}]});
  return outfile;}

/* ---------- Port 夹具 ---------- */
function makePort(overrides={}){return Object.assign({conversation:true,sessions:[{id:"s1",title:"长对话",updatedAt:"2026-11-12T10:00:00Z"}],sessionId:"s1",messages:[{role:"user",text:"第一句"},{role:"assistant",text:"回复一"}],busy:false,sessionsLoading:false,loadingId:null,canNavigate:true,load(){},history(){},create(){},setSkill(){},skill:null,text:"",setText(){},refs:[],recent:[],unavailable:false,uploading:false,error:null,running:false,creationSettings:{},setCreationSettings(){}},overrides);}

(async()=>{
  const outfile=await build();
  const {CreationWorkbench}=require(outfile);

  /* t1 初始（已位于底部，away<0）不显示按钮 */
  scrollState.scrollTop=2000;scrollState.scrollHeight=2000;scrollState.clientHeight=900;
  activeRenderer=shim._mount(CreationWorkbench,{port:makePort()});
  flush();
  check("t1 initial-at-bottom-hidden",!chipNode());

  /* t2 滚到长文中段（away>80）scroll 事件后按钮出现 */
  away(2300);fireScroll();
  check("t2 mid-scroll-shows",!!chipNode());
  const btn=chipButton();
  check("t2b button-has-label",!!btn&&btn.props["aria-label"]==="滚动到底部");

  /* t3 接近底部（away=30）scroll 事件后按钮隐藏 */
  away(30);fireScroll();
  check("t3 near-bottom-hides",!chipNode());

  /* t9 临界值：away=81 显示、away=80 隐藏 */
  away(81);fireScroll();
  check("t9a threshold-81-shows",!!chipNode());
  away(80);fireScroll();
  check("t9b threshold-80-hides",!chipNode());

  /* t4 点击按钮：恢复跟随（下一条消息自动 scrollIntoView）且回到底部后隐藏 */
  away(2300);fireScroll();
  const before=globalThis.__scrollCalls.length;
  chipButton().props.onClick();
  render({port:makePort({messages:[{role:"user",text:"第一句"},{role:"assistant",text:"回复一"},{role:"assistant",text:"追加"}]})});
  const followCalls=globalThis.__scrollCalls.slice(before);
  check("t4a click-resumes-follow",followCalls.some(c=>c.opts&&c.opts.block==="end"));
  away(0);fireScroll();
  check("t4b at-bottom-after-click-hides",!chipNode());

  /* t5 滚轮断开跟随：新消息不再自动回底，但按钮保持显示 */
  away(2300);fireScroll();
  const streamNode=findAll(activeRenderer.dom,n=>n.className==="cx_messageStream")[0];
  streamNode.props.onWheel();
  const beforeWheel=globalThis.__scrollCalls.length;
  render({port:makePort({messages:[{role:"user",text:"第一句"},{role:"assistant",text:"回复一"},{role:"assistant",text:"流式追加"}]})});
  check("t5a wheel-stops-autofollow",globalThis.__scrollCalls.length===beforeWheel);
  check("t5b chip-still-visible-while-away",!!chipNode());

  /* t6 短对话（不可滚动 away<0）始终隐藏 */
  scrollState.scrollHeight=800;scrollState.scrollTop=0;scrollState.clientHeight=900;
  fireScroll();
  check("t6 unscrollable-conversation-hidden",!chipNode());

  /* t7 切换会话：重置隐藏 + 自动跳底（跟随恢复触发 scrollIntoView） */
  scrollState.scrollHeight=5000;scrollState.scrollTop=1800;scrollState.clientHeight=900;
  fireScroll();
  check("t7a visible-before-switch",!!chipNode());
  const beforeSwitch=globalThis.__scrollCalls.length;
  render({port:makePort({sessionId:"s2",sessions:[{id:"s1",title:"长对话",updatedAt:"2026-11-12T10:00:00Z"},{id:"s2",title:"新会话",updatedAt:"2026-11-12T11:00:00Z"}]})});
  check("t7b auto-jump-on-switch",globalThis.__scrollCalls.length>beforeSwitch);
  away(0);fireScroll();
  check("t7c hidden-after-switch-scroll",!chipNode());

  /* t8 回到首页：按钮不存在且 window scroll 监听已移除 */
  render({port:makePort({conversation:false,sessions:[],sessionId:"",messages:[]})});
  check("t8a home-no-chip",!chipNode());
  check("t8b home-no-scroll-listener",scrollListenerCount()===0);

  console.log(`CREATION_TO_BOTTOM={"checks":${checks},"failed":${failures},"source":"actual creation-workbench.tsx via esbuild"}`);
  fs.unlinkSync(outfile);
  process.exit(failures?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

/* ---------- 查找辅助 ---------- */
function findAll(node,pred,out=[]){if(!node)return out;if(pred(node))out.push(node);for(const c of node.children||[])findAll(c,pred,out);return out;}
function chipNode(){return findAll(activeRenderer.dom,n=>n.className==="cx_toBottom")[0];}
function chipButton(){const c=chipNode();if(!c)return null;return findAll(c,n=>n.type==="button")[0];}
