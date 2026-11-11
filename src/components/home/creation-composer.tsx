"use client";
import { useEffect,useRef,useState } from "react";
import { ArrowUp,ChevronDown,Eraser,Images,Loader2,Plus,SlidersHorizontal,Square,Waves,X } from "lucide-react";
import { TextModelSelect } from "@/components/ui/text-model-select";
import { CreationSettingsPanel } from "./creation-settings-panel";
import { SkillBook } from "@/components/image-skills/skill-book";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { useWorkspaceRouter } from "@/lib/desktop/navigation";
import { CachedImage } from "@/components/cached-image";
import { agentMediaUrl } from "@/lib/agent/media-policy";
import type { CreationWorkbenchPort } from "./creation-contract";
import styles from "./creation-workbench.module.css";

export function CreationComposer({port}:{port:CreationWorkbenchPort}){
  const {user}=useAuth(),{openAuth}=useAuthModal(),{can}=useFeatureAccess(),router=useWorkspaceRouter();
  const [settings,setSettings]=useState(false),[works,setWorks]=useState(false),[mode,setMode]=useState(false),[steer,setSteer]=useState("");
  const root=useRef<HTMLDivElement>(null),files=useRef<HTMLInputElement>(null),text=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node)){setSettings(false);setMode(false);}};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[]);
  useEffect(()=>{setSettings(false);setWorks(false);setMode(false);setSteer("");},[user?.email,port.sessionId]);
  function chooseFiles(){if(!user){openAuth("sign-in");return;}files.current?.click();}
  function paste(event:React.ClipboardEvent<HTMLTextAreaElement>){const images=Array.from(event.clipboardData.files).filter(f=>f.type.startsWith("image/"));if(!images.length)return;event.preventDefault();if(!user){openAuth("sign-in");return;}port.addFiles(images);}
  const disabled=port.busy||port.uploading||!!port.loadingId||port.unavailable;
  return <div ref={root} className={styles.composerRoot} onKeyDown={event=>{if(event.key==="Escape"){setSettings(false);setWorks(false);setMode(false);}}}>
    {port.error&&<p className={styles.error} role="alert">{port.error}</p>}
    {port.running&&<div className={styles.steer}><input aria-label="插话修正" value={steer} onChange={e=>setSteer(e.target.value)} placeholder="插话修正" onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing&&steer.trim()){port.interject(steer);setSteer("");}}}/><button type="button" disabled={!steer.trim()} onClick={()=>{port.interject(steer);setSteer("");}}>发送插话</button><button type="button" onClick={port.stop}><Square/>停止</button></div>}
    <div className={styles.composer} data-testid={port.conversation?"chat-composer":"dashboard-composer"}>
      <div className={styles.composerBody}>
        <button type="button" className={styles.upload} disabled={disabled} aria-label="添加参考图片" onClick={chooseFiles}><Plus/></button>
        <textarea ref={text} data-testid={port.conversation?"chat-textarea":"dashboard-textarea"} aria-label="创作描述" value={port.text} maxLength={3900} rows={3} onPaste={paste} onChange={e=>port.setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!disabled)port.send();}}} placeholder="描述商品与创作需求，上传参考图，选择技能开始创作"/>
      </div>
      {!!port.refs.length&&<div className={styles.attachments}>{port.refs.map((url,i)=><div key={url+":"+i}><CachedImage src={url} alt={`参考图 ${i+1}`}/><button type="button" disabled={disabled} aria-label={`移除参考图 ${i+1}`} onClick={()=>port.removeRef(i)}><X/></button></div>)}</div>}
      <div className={styles.composerToolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.relative}><button type="button" className={styles.agentMode} aria-expanded={mode} onClick={()=>setMode(!mode)}><Waves/><span>Agent 模式</span><ChevronDown/></button>{mode&&<div className={styles.modeMenu}><button type="button" onClick={()=>setMode(false)}>Agent 模式</button>{can("generate")&&<button type="button" onClick={()=>{const query=new URLSearchParams({prompt:port.text});const reference=port.refs.find(url=>agentMediaUrl(url));if(reference)query.set("src",reference);router.push("/generate?"+query);}}>直接生成</button>}</div>}</div>
          <button type="button" aria-label="创作设置" aria-expanded={settings} onClick={()=>setSettings(!settings)}><SlidersHorizontal/><span className={styles.settingsLabel}>创作设置</span></button>
          <SkillBook compact selected={port.skill} onSelect={port.setSkill} accountKey={user?.email||""} busy={disabled} sessionId={port.sessionId} hasConversation={port.messages.some(m=>m.role==="assistant"&&!m.pending&&!!m.content)} onUse={prompt=>{if(!port.text.trim())port.setText(prompt);text.current?.focus();}}/>
          {can("works")&&<button type="button" aria-label="从作品选图" disabled={disabled} onClick={()=>{if(!user)openAuth("sign-in");else setWorks(true);}}><Images/></button>}
        </div>
        <div className={styles.toolbarRight}><span aria-label="对话 Agent 模型"><TextModelSelect compact direction="up"/></span><button type="button" aria-label="清空输入" disabled={disabled} onClick={()=>port.stage("",[])}><Eraser/></button><button type="button" className={styles.send} aria-label="发送" disabled={disabled||!port.text.trim()||!can("agent")} onClick={port.send}>{port.busy||port.uploading?<Loader2 className="animate-spin"/>:<ArrowUp/>}</button></div>
      </div>
      <input ref={files} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e=>{const selected=Array.from(e.target.files||[]);e.target.value="";port.addFiles(selected);}}/>
      {settings&&<CreationSettingsPanel value={port.creationSettings} onChange={port.setCreationSettings} onClose={()=>setSettings(false)}/>}
    </div>
    {works&&<div className={styles.modalShade} onClick={()=>setWorks(false)}><section className={styles.worksDialog} role="dialog" aria-modal="true" aria-label="从作品选图" onClick={e=>e.stopPropagation()}><header><h2>从作品选图</h2><button type="button" autoFocus aria-label="关闭作品选择" onClick={()=>setWorks(false)}><X/></button></header><div className={styles.workGrid}>{port.recent?.map(work=><button type="button" key={work.id} aria-label={work.title||"选择作品"} onClick={()=>{port.addReference(work.image);setWorks(false);}}><CachedImage src={work.image} alt={work.title||"作品"}/></button>)}</div>{port.recent?.length===0&&<p className={styles.empty}>还没有可用作品</p>}{port.recent===null&&<p role="status">正在读取作品</p>}</section></div>}
  </div>;
}
