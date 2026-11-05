"use client";
import {useState} from "react";
import {Loader2} from "lucide-react";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {encryptCredential} from "../model-config/credentials";
import type {VideoModelDefinition,VideoWireProfile} from "@/lib/video/capability-schema";
import {VideoCapabilityEditor} from "../model-config/video-capability-editor";
import {api} from "./client";
import styles from "./model-management.module.css";
import {Dialog} from "./dialog";


const protocols = [
  ["openai-images", "OpenAI 图片", "https://api.example.com/v1"],
  ["new-api-flow", "New API 图片", "https://api.example.com/v1"],
  ["apimart-images", "APIMart 图片", "https://api.apimart.ai"],
  ["openai-chat", "OpenAI 文字", "https://api.example.com/v1"],
  ["openai-videos", "OpenAI 视频", "https://api.example.com/v1"],
  ["ark", "火山方舟视频", "https://ark.example.com/api/v3"],
  ["kie", "KIE 视频", "https://api.example.com/api/v1"],
  ["apimart", "API Mart 视频", "https://api.apimart.ai"],
  ["gemini", "Gemini 视频", "https://generativelanguage.googleapis.com"],
  ["minimax", "MiniMax H3", "https://api.example.com"],
  ["metaso", "METASO H3", "https://api.example.com"],
  ["tokendance", "TokenDance", "https://api.example.com"],
  ["tfrouter", "TF-router 视频", "https://api.toonflow.net/v1"],
  ["compshare", "Compshare 视频", "https://api.modelverse.cn"],
  ["comfyui", "ComfyUI 工作流", "https://api.example.com"],
  ["autodl", "AutoDL 工作流", "https://api.example.com"],
  ["runninghub", "RunningHub 工作流", "https://api.example.com"],
];

function useArray(initial: string[] = []) {
  const [items, setItems] = useState(initial);
  return [items, (value: string) => setItems(old => old.includes(value) ? old.filter(v => v !== value) : [...old, value])] as const;
}

export function ConnectDialog({ locked, onClose, onSave }: { locked: boolean; onClose: () => void; onSave: (fields: Record<string, unknown>, id: string) => Promise<void> }) {
  const [name, setName] = useState(""), [baseUrl, setBaseUrl] = useState(""), [protocol, setProtocol] = useState("openai-images"), [key, setKey] = useState(""), [encrypting, setEncrypting] = useState(false), [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setEncrypting(true); setError("");
    try {
      const id = browserRandomUUID(), secure = !!crypto.subtle;
      const credential = await api({ action: "credential", providerId: `mvp-${id}`, ...(secure ? { ciphertext: await encryptCredential(key) } : { keyPlain: key }) });
      setKey(""); await onSave({ name, baseUrl, protocol, credentialRef: credential.id }, id);
    } catch (e) { setError(e instanceof Error ? e.message : "凭据保存失败"); } finally { setEncrypting(false); }
  }
  return <Dialog title="接入上游来源" onClose={onClose} locked={locked || encrypting}><form onSubmit={submit}><fieldset className={styles.dialogBody} disabled={locked || encrypting}><p className={styles.ruleNote}>保存后自动查询该地址的模型目录。API Key 加密保存，仅在服务端使用。</p><label className={styles.field}>来源名称<input required maxLength={100} placeholder="例如：我们的图片供应商" value={name} onChange={e => setName(e.target.value)} /></label><label className={styles.field}>接口协议<select value={protocol} onChange={e => setProtocol(e.target.value)}>{protocols.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className={styles.field}>上游 URL<input type="url" required placeholder={protocols.find(p => p[0] === protocol)![2]} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /><small>{protocol === "apimart-images" ? "填写服务根地址，目录使用 /v1/models。" : "填写 API 基地址，通常包含 /v1；目录查询会追加 /models。"}</small></label><label className={styles.field}>API Key<input type="password" required autoComplete="new-password" placeholder="输入上游访问凭据" value={key} onChange={e => setKey(e.target.value)} /></label>{error && <p role="alert" className={styles.error}>{error}</p>}</fieldset><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked || encrypting} onClick={onClose}>取消</button><button type="submit" className={styles.primary} disabled={locked || encrypting}>{(locked || encrypting) && <Loader2 size={16} className={styles.spin} />}保存并发现模型</button></footer></form></Dialog>;
}

export function RegisterDialog({ model, protocol, locked, onClose, onSave }: { model: string; protocol: string; locked: boolean; onClose: () => void; onSave: (fields: Record<string, unknown>) => void }) {
  const image = ["openai-images", "apimart-images", "new-api-flow"].includes(protocol), text = protocol === "openai-chat";
  const [edit, setEdit] = useState(false), [vision, setVision] = useState(false), [confirmed, setConfirmed] = useState(false), [references, setReferences] = useState(0);
  const [qualityRank, setQualityRank] = useState(2);
  const [videoDefinition,setVideoDefinition]=useState<VideoModelDefinition>();
  const [videoProfile,setVideoProfile]=useState<VideoWireProfile>();
  const [qualities, toggleQuality] = useArray(), [resolutions, toggleResolution] = useArray();
  return <Dialog title="添加实际模型" onClose={onClose} locked={locked}><div className={styles.dialogBody}><div className={styles.actualModel}><code>{model}</code><span>来自上游模型目录</span></div><p className={styles.ruleNote}>目录仅提供模型 ID。请按供应商文档或已有测试结果确认能力，系统不会从名称猜测能力或成本。</p><fieldset className={styles.capabilities} disabled={locked}>{image && <><label><input type="checkbox" checked={edit} onChange={e => setEdit(e.target.checked)} />支持图片编辑 / 参考图输入</label><label className={styles.field}>可用于的质量档<select value={qualityRank} onChange={e => setQualityRank(Number(e.target.value))}>{[[1,"仅草稿"],[2,"标准"],[3,"高质量"],[4,"精细"],[5,"最高"]].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><p>支持的质量参数（不支持可留空）</p><div>{["low", "medium", "high", "xhigh", "max", "auto"].map(q => <label key={q}><input type="checkbox" checked={qualities.includes(q)} onChange={() => toggleQuality(q)} />{q}</label>)}</div><p>已确认的原生尺寸</p><div>{["1K", "2K", "4K"].map(r => <label key={r}><input type="checkbox" checked={resolutions.includes(r)} onChange={() => toggleResolution(r)} />{r}</label>)}</div></>}{text && <label><input type="checkbox" checked={vision} onChange={e => setVision(e.target.checked)} />支持图片理解</label>}{(image || text) && <label className={styles.field}>最大参考图数量<input type="number" min={0} max={32} value={references} onChange={e => setReferences(Number(e.target.value))} /></label>}{!image&&!text&&<VideoCapabilityEditor value={videoDefinition} profile={videoProfile} onChange={(definition,profile)=>{setVideoDefinition(definition);setVideoProfile(profile);if(typeof definition?.limits?.images==="number")setReferences(definition.limits.images);}}/>}<label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我已确认该模型支持{image ? "图片生成" : text ? "文字生成" : "视频生成"}及上述能力，并可使用当前协议调用。</label></fieldset><p className={styles.ruleNote}>添加不会改变前端名称或当前路由。需要蒙版、保留主体等高级能力时，请使用完整配置中心。</p></div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.primary} disabled={locked || !confirmed} onClick={() => onSave({ confirmed: true, edit, vision, qualityRank, qualities, resolutions, maxReferenceImages: references,...(!image&&!text?{videoDefinition,videoProfile}:{}) })}>添加到可切换列表</button></footer></Dialog>;
}
