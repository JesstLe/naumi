import {build} from "esbuild";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {execFileSync} from "node:child_process";
import {createServer} from "node:http";
const mode=process.argv.includes("--baseline")?"baseline":"modified",out=resolve("output/conversation-sidebar",mode+"-browser");await mkdir(out,{recursive:true});
const root=process.cwd().replaceAll("\\","/"),base="46b2ce9a912c78dcb74164c2ec4d905ba6671b21";
const override=process.argv.find(arg=>arg.startsWith("--source-override="))?.slice("--source-override=".length);
const content=String.raw`## 商品创作方案

**主视觉**使用柔和侧光，保留商品材质与层次。

| 项目 | 设定 |
| --- | --- |
| 背景 | 奶油白 |
| 光线 | 左侧柔光 |

1. 固定商品外观
2. 调整场景与构图

> 先核对主体，再检查画面细节。

行内公式：$E=mc^2$；LaTeX 分隔符：\(a^2+b^2=c^2\)。

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

\[
\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}
\]



`+"```typescript\nconst ratio = 16 / 9;\nconsole.log(ratio);\n```\n\n"+String.raw`[查看创作记录](/works)

![商品图](/media/product.png)`;
const entry=`import React,{useState,useRef,useEffect}from'react';import{createRoot}from'react-dom/client';
import{CreationComposer}from'${root}/src/components/home/creation-composer.tsx';import{CreationMessage}from'${root}/src/components/home/creation-message.tsx';import{ConversationHistory}from'${root}/src/components/home/conversation-history.tsx';import{createWorkbenchSessionCatalog}from'${root}/src/lib/agent/workbench-session-catalog.ts';import{liveWorkbenchSessions}from'${root}/src/lib/agent/workbench-session-preview.ts';import styles from'${root}/src/components/home/creation-workbench.module.css';import'katex/dist/katex.min.css';
function Fixture(){const[rows,setRows]=useState([]),[id,setId]=useState('s1'),[text,setText]=useState(''),[error,setError]=useState(null),[messages,setMessages]=useState([{role:'user',content:'请给出商品图方案，支持 **Markdown** 与 $x^2$。'},{role:'assistant',content:${JSON.stringify(content)}}]);const scope=useRef({account:'fixture@example.test',active:true});const catalog=useRef(createWorkbenchSessionCatalog({current:()=>scope.current,owns:s=>s===scope.current&&s.active})).current;const context=()=>({ready:true,headers:async()=>({}),request:(...args)=>fetch(...args),setSessions:setRows,setLoading:()=>{},setError,sessionId:()=>id,setTitle:()=>{},deletedCurrent:()=>{setId('');setMessages([])}});useEffect(()=>{void catalog.refresh(context())},[]);const port={creationSettings:{},setCreationSettings:()=>{},conversation:!!id,messages,sessions:rows,sessionsLoading:false,sessionId:id,title:'商品主图方案',loadingId:'',busy:false,running:false,unavailable:false,uploading:false,error,text,refs:[],skill:null,recent:[],canNavigate:true,setText,setSkill:()=>{},stage:setText,addFiles:()=>{},addReference:()=>{},removeRef:()=>{},send:()=>{},stop:()=>{},interject:()=>{},create:()=>{},load:setId,history:()=>{},rename:(a,b)=>catalog.rename(a,b,context()),pin:(a,b)=>catalog.pin(a,b,context()),remove:a=>catalog.remove(a,context()),resolveArtwork:async()=>null,regenerate:()=>{}};
window.__fixture={setMessages,updateImage:()=>setMessages([{role:'assistant',content:'![新图](/media/new.png)'}]),generating:()=>setMessages([{role:'assistant',content:'![新图](/media/new.png)',pending:true,steps:[{tool:'generate_image',summary:'',status:'running'}]}]),failed:()=>setMessages([{role:'assistant',content:'![新图](/media/new.png)',steps:[{tool:'generate_image',summary:'',status:'error'}]}])};
return <div className={styles.root}><div className="fixture"><aside><h2>对话</h2><ConversationHistory sessions={liveWorkbenchSessions(rows,id,messages)} activeId={id} loadingId="" canNavigate onLoad={setId} onRename={port.rename} onPin={port.pin} onDelete={port.remove}/></aside><main><header><h1>商品主图方案</h1></header><div className="messages">{messages.map((m,i)=><CreationMessage key={i} message={m} previous={messages[i-1]} port={port} onPreview={()=>{}}/>)}</div><CreationComposer port={port}/></main></div></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const mocks={
"@/lib/auth-context":`export const useAuth=()=>({user:{email:'fixture@example.test'}})`,
"@/lib/auth-modal-context":`export const useAuthModal=()=>({openAuth:()=>{}})`,
"@/lib/feature-access/client":`export const useFeatureAccess=()=>({can:()=>true,canPage:()=>true})`,
"@/lib/desktop/navigation":`export const useWorkspaceRouter=()=>({push:()=>{}})`,
"@/components/cached-image":`import React from'react';export function CachedImage(p){return <img {...p}/>}`,
"@/components/ui/text-model-select":`import React from'react';export function TextModelSelect(){return <div><button>文本模型</button></div>}`,
"@/components/image-skills/skill-book":`import React from'react';export function SkillBook(){return <button aria-label="技能">技能</button>}`,
};
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",jsx:"automatic",outfile:join(out,"fixture.js"),loader:{".woff2":"file",".woff":"file",".ttf":"file"},define:{"process.env":"{}","process.env.NODE_ENV":'"production"'},plugins:[{name:"ports",setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:"mock"}:undefined);b.onLoad({filter:/.*/,namespace:"mock"},a=>({contents:mocks[a.path],loader:"tsx",resolveDir:process.cwd()}));b.onLoad({filter:/creation-settings-panel\.tsx$/},()=>({contents:`import React from'react';export function CreationSettingsPanel(){return <div>创作设置</div>}`,loader:"tsx",resolveDir:process.cwd()}));if(mode==="baseline"||override)b.onLoad({filter:/(creation-message\.tsx|creation-workbench\.module\.css)$/},async a=>{const rel=a.path.replaceAll("\\","/").slice(root.length+1);return{contents:override?await readFile(join(override,rel),"utf8"):execFileSync("git",["show",base+":"+rel],{encoding:"utf8"}),loader:a.path.endsWith("css")?"local-css":"tsx",resolveDir:resolve(a.path,"..")}});}}]});
await writeFile(join(out,"index.html"),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>对话管理与富文本 · 实际组件验收</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif}.fixture{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh}.fixture>aside{padding:26px 14px;background:#f8f9fb;border-right:1px solid #e6e8ec}.fixture>aside>h2{font-size:14px;margin:0 7px 18px}.fixture>main{max-width:960px;width:100%;box-sizing:border-box;padding:28px 44px}.fixture main>header{margin-bottom:25px}.fixture h1{font-size:23px}.messages{margin-bottom:24px}.messages>div{margin-bottom:20px}@media(max-width:760px){.fixture{grid-template-columns:190px minmax(0,1fr)}.fixture>main{padding:18px}.fixture>aside{padding:18px 8px}}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
let sessions=[{id:"s1",title:"商品主图方案",createdAt:"2026-11-11",updatedAt:"2026-11-11T12:00:00Z",messageCount:4,preview:{image:"/media/product.png",status:"ready"}},{id:"s2",title:"美妆包装探索",createdAt:"2026-11-10",updatedAt:"2026-11-10",messageCount:2,preview:{image:"/media/beauty.png",status:"generating"}},{id:"s3",title:"秋日场景图",createdAt:"2026-11-09",updatedAt:"2026-11-09",messageCount:2,preview:{image:"/media/scene.png",status:"failed"}}];
const events=[];
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,"http://fixture");if(url.pathname==="/api/agent/session"){let body="";for await(const chunk of req)body+=chunk;events.push({method:req.method,url:url.pathname+url.search,body:body?JSON.parse(body):null});if(req.method==="PATCH"){const data=JSON.parse(body),row=sessions.find(s=>s.id===data.id);if(data.title)row.title=data.title;if(typeof data.pinned==="boolean")row.pinnedAt=data.pinned?new Date().toISOString():null;res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({ok:true,pinnedAt:row.pinnedAt}));}if(req.method==="DELETE")sessions=sessions.filter(s=>s.id!==url.searchParams.get("id"));sessions.sort((a,b)=>Number(!!b.pinnedAt)-Number(!!a.pinnedAt)||b.updatedAt.localeCompare(a.updatedAt));res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({sessions}));}if(url.pathname==="/events"){res.setHeader("Content-Type","application/json");return res.end(JSON.stringify(events));}if(url.pathname.startsWith("/media/")){const color=url.pathname.includes("new")?"#f0a35b":url.pathname.includes("beauty")?"#dfb7be":"#9bc6b5";res.setHeader("Content-Type","image/svg+xml");return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="${color}"/><rect x="185" y="56" width="110" height="225" rx="23" fill="#fff9"/><rect x="210" y="37" width="60" height="35" rx="8" fill="#f5f4e9"/><rect x="199" y="138" width="82" height="70" rx="7" fill="#ffffffa0"/></svg>`);}const name=url.pathname==="/"?"index.html":url.pathname.slice(1);if(name.includes(".."))throw Error("bad path");const bytes=await readFile(join(out,name));res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".woff2":"font/woff2",".woff":"font/woff",".ttf":"font/ttf"})[extname(name)]||"application/octet-stream");res.end(bytes);}catch(e){res.statusCode=500;res.end(String(e));}});
server.listen(0,"127.0.0.1",()=>console.log("CONVERSATION_FIXTURE="+JSON.stringify({mode,origin:`http://127.0.0.1:${server.address().port}`})));
