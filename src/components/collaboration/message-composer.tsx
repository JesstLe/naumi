"use client";
import { useRef, useState } from "react";
import { AtSign, Bold, Italic, Link, List, Paperclip, Pause, Play, Send, Smile, X } from "lucide-react";
import { useCollaborationState } from "./collaboration-provider";
import { sizeText } from "./message-content";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const { client, state } = useCollaborationState();
  const [mentions, setMentions] = useState(false), [emoji, setEmoji] = useState(false), [drag, setDrag] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), files = useRef<HTMLInputElement>(null);
  const draft = state.drafts[conversationId] || { body: "", attachments: [], mentionIds: [] };
  const conversation = state.conversations.find(c => c.id === conversationId);
  function insert(before: string, after = "") {
    const el = input.current, start = el?.selectionStart ?? draft.body.length, end = el?.selectionEnd ?? start;
    const text = draft.body.slice(start, end);
    client.draft(conversationId, { body: draft.body.slice(0, start) + before + text + after + draft.body.slice(end) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + before.length, start + before.length + text.length); });
  }
  function addFiles(items: File[]) { client.addFiles(conversationId, items); }
  const uploading = state.uploads.filter(u => u.conversationId === conversationId && u.status !== "complete");
  return <div className={`co-composer ${drag ? "co-dragging" : ""}`} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDrag(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDrag(false); addFiles(Array.from(e.dataTransfer.files)); }}>
    {draft.replyTo && <div className="co-reply-draft"><span>回复：{state.messages[conversationId]?.items.find(m => m.id === draft.replyTo)?.body.slice(0, 80) || "原消息"}</span><button aria-label="取消引用" onClick={() => client.draft(conversationId, { replyTo: undefined })}><X size={14} /></button></div>}
    {uploading.length > 0 && <div className="co-uploads">{uploading.map(task => <div className="co-upload" key={task.id}><div><strong>{task.file.name}</strong><small>{sizeText(task.file.size)} · {task.status === "uploading" ? `${task.progress}%` : task.status === "paused" ? "已暂停" : task.status === "cancelled" ? "已取消" : task.status === "cancelling" ? "取消中" : "上传失败"}</small><progress aria-label={`${task.file.name} 上传进度`} value={task.progress} max={100} />{task.error && <span role="alert">{task.error}</span>}</div>
      {task.status === "uploading" ? <button aria-label={`暂停 ${task.file.name}`} onClick={() => client.pauseUpload(task.id)}><Pause size={14} /></button> : <button aria-label={`重试 ${task.file.name}`} disabled={task.status === "cancelling"} onClick={() => void (task.status === "cancel-failed" ? client.cancelUpload(task.id) : client.resumeUpload(task.id))}><Play size={14} /></button>}
      {task.status !== "cancelled" && <button aria-label={`取消 ${task.file.name}`} disabled={task.status === "cancelling"} onClick={() => void client.cancelUpload(task.id)}><X size={14} /></button>}
    </div>)}</div>}
    {draft.attachments.length > 0 && <div className="co-attachment-chips">{draft.attachments.map(a => <span key={a.id}><Paperclip size={12} />{a.name}<button aria-label={`移除附件 ${a.name}`} onClick={() => client.draft(conversationId, { attachments: draft.attachments.filter(item => item.id !== a.id) })}><X size={12} /></button></span>)}</div>}
    <div className="co-editor-tools">
      <button title="加粗" aria-label="加粗" onClick={() => insert("**", "**")}><Bold size={16} /></button><button title="斜体" aria-label="斜体" onClick={() => insert("*", "*")}><Italic size={16} /></button><button title="列表" aria-label="列表" onClick={() => insert("\n- ")}><List size={17} /></button><button title="链接" aria-label="插入链接" onClick={() => insert("[", "](https://)")}><Link size={16} /></button>
      <button title="表情" aria-label="表情" aria-expanded={emoji} onClick={() => setEmoji(!emoji)}><Smile size={17} /></button><button title="提及成员" aria-label="提及成员" aria-expanded={mentions} onClick={() => setMentions(!mentions)}><AtSign size={17} /></button>
      <button title="添加附件" aria-label="添加附件" onClick={() => files.current?.click()}><Paperclip size={17} /></button><input ref={files} type="file" aria-label="选择聊天附件" multiple hidden onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
    </div>
    {emoji && <div className="co-emoji">{["👍", "🎉", "😊", "❤️", "✅", "👀", "👏", "🙏"].map(item => <button key={item} onClick={() => { insert(item); setEmoji(false); }}>{item}</button>)}</div>}
    {mentions && <div className="co-mention-list"><input aria-label="查找提及成员" maxLength={100} placeholder="查找成员" onChange={e => void client.loadMembers(e.target.value).catch(error => client.report(error))} />{state.members.filter(m => conversation?.memberIds.includes(m.id) && m.id !== state.bootstrap?.actorId).map(member => <button key={member.id} onClick={() => { insert(`@${member.name} `); client.draft(conversationId, { mentionIds: [...new Set([...draft.mentionIds, member.id])] }); setMentions(false); }}>{member.name}</button>)}{state.memberCursor && <button onClick={() => void client.loadMembers(state.memberQuery, true).catch(error => client.report(error))}>更多成员</button>}</div>}
    <textarea ref={input} aria-label="消息内容" maxLength={32000} placeholder="发送消息…" value={draft.body} onChange={e => client.draft(conversationId, { body: e.target.value })} onPaste={e => { e.stopPropagation(); const images = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/")); if (images.length) { e.preventDefault(); addFiles(images); } }} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void client.send(conversationId); } }} />
    <div className="co-compose-footer"><span>{draft.mentionIds.length ? `@ ${draft.mentionIds.length} 人` : ""}</span><button type="button" className="co-primary" aria-label="发送消息" disabled={!draft.body.trim() && !draft.attachments.length} onClick={() => void client.send(conversationId)}><Send size={15} />发送</button></div>
  </div>;
}
