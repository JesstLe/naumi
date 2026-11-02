"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Download, File, Play, X } from "lucide-react";
import type { CanvasShare, CollaborationAttachment, CollaborationMessage } from "@/lib/collaboration/contracts";
import { useCollaborationState } from "./collaboration-provider";
import { errorText, isAbort, safeLink } from "./transport";

export function MessageMarkdown({ body }: { body: string }) {
  return <div className="co-markdown"><ReactMarkdown skipHtml allowedElements={["p", "strong", "em", "ul", "ol", "li", "a", "code", "pre", "blockquote", "br"]} unwrapDisallowed urlTransform={url => safeLink(url) || ""} components={{ a: ({ href, children }) => <a href={safeLink(href)} target="_blank" rel="noopener noreferrer">{children}</a> }}>{body}</ReactMarkdown></div>;
}
export const sizeText = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export function Attachment({ attachment }: { attachment: CollaborationAttachment }) {
  const { client } = useCollaborationState();
  const [preview, setPreview] = useState<string | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const inline = /^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm|ogg))$/.test(attachment.mime);
  useEffect(() => () => { if (preview) client.releaseUrl(preview); }, [client, preview]);
  useEffect(() => () => pending.current?.abort(), []);
  async function load(view: boolean) {
    setBusy(true); setError("");
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    try {
      const url = await client.attachment(attachment, view, controller.signal);
      if (view) setPreview(url);
      else { const a = document.createElement("a"); a.href = url; a.download = attachment.name; a.click(); setTimeout(() => client.releaseUrl(url), 30_000); }
    } catch (e) { if (!isAbort(e)) setError(errorText(e)); } finally { if (pending.current === controller) pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="co-file">
    <File size={22} /><div><strong>{attachment.name}</strong><small>{sizeText(attachment.bytes)}</small></div>
    {inline && <button type="button" aria-label={`预览 ${attachment.name}`} disabled={busy || attachment.availability !== "ready"} onClick={() => void load(true)}><Play size={15} /></button>}
    <button type="button" aria-label={`下载 ${attachment.name}`} disabled={busy || attachment.availability !== "ready"} onClick={() => void load(false)}><Download size={16} /></button>
    {attachment.availability !== "ready" && <span>文件已失效</span>}{error && <p role="alert">{error}</p>}
    {preview && <div className="co-preview" role="dialog" aria-label="附件预览" onClick={() => setPreview(null)}><button aria-label="关闭附件预览"><X /></button>{attachment.mime.startsWith("video/") ? <video src={preview} controls onClick={e => e.stopPropagation()} /> : <img src={preview} alt={attachment.name} onClick={e => e.stopPropagation()} />}</div>}
  </div>;
}
export const shareStatus: Record<CanvasShare["status"], string> = { offered: "等待申请", requested: "待批准", approved: "已批准", rejected: "已拒绝", revoked: "已撤回" };

export function ShareCover({ share }: { share: CanvasShare }) {
  const { client } = useCollaborationState();
  const [cover, setCover] = useState<string | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let url: string | null = null;
    setCover(null); setError("");
    void client.shareCover(share, controller.signal).then(value => { url = value; if (!controller.signal.aborted) setCover(value); else if (value) client.releaseUrl(value); }).catch(e => { if (!isAbort(e)) setError(errorText(e)); });
    return () => { controller.abort(); if (url) client.releaseUrl(url); };
  }, [client, share.id, share.previewUrl, share.version]);
  if (!share.previewUrl) return null;
  return <>{cover && <img className="co-share-cover" src={cover} alt={share.title || "画布预览"} />}{error && <span role="status">{error}</span>}</>;
}

export function ShareCard({ id }: { id: string }) {
  const { client, state } = useCollaborationState();
  const [share, setShare] = useState<CanvasShare | null>(null), [error, setError] = useState("");
  const revision = state.sharesRevision;
  useEffect(() => { let active = true; void client.getShare(id).then(s => { if (active) { setShare(s); setError(""); } }).catch(e => { if (active && !isAbort(e)) { setShare(null); setError(errorText(e)); } }); return () => { active = false; }; }, [client, id, revision]);
  if (error) return <div className="co-share-card" role="status">分享访问失败：{error}</div>;
  if (!share) return <div className="co-share-card">读取分享…</div>;
  return <div className="co-share-card"><ShareCover share={share} /><strong>{share.title || (share.kind === "workflow" ? "画布流程" : "作品")}</strong><span>{shareStatus[share.status]}</span>
    {share.status === "approved" && share.requesterId === state.bootstrap?.actorId && share.resultProjectKey ? <Link href={`/canvas?project=${encodeURIComponent(share.resultProjectKey)}`}>打开独立画布 ↗</Link> : <button onClick={() => client.open({ section: "requests" })}>查看申请</button>}
  </div>;
}
export function MessageContent({ message }: { message: CollaborationMessage }) {
  if (message.withdrawnAt) return <span className="co-withdrawn">消息已撤回</span>;
  return <>{message.body && <MessageMarkdown body={message.body} />}{message.attachments.map(a => <Attachment key={a.id} attachment={a} />)}{message.shareId && <ShareCard id={message.shareId} />}</>;
}
