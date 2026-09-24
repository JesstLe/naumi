"use client";

import { useState } from "react";
import {
  Check,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 工作台历史会话抽屉(自 /agent 会话侧栏收编):列表/载入/重命名/删除。
// 纯 UI + 本地编辑态;数据操作通过回调由 workbench-client 完成。
// ---------------------------------------------------------------------------

export type SessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function WorkbenchSessions({
  open,
  onClose,
  sessions,
  loading,
  activeSessionId,
  busy,
  loadingId,
  onLoad,
  onRename,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  sessions: SessionSummary[];
  loading: boolean;
  activeSessionId: string;
  busy: boolean;
  loadingId: string;
  onLoad: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingId, setDeletingId] = useState("");

  if (!open) return null;

  return (
    <>
      {/* 遮罩(卡片内) */}
      <button
        type="button"
        aria-label="关闭历史会话"
        onClick={onClose}
        className="absolute inset-0 z-10 bg-black/10"
      />
      <aside className="absolute inset-y-0 right-0 z-20 flex w-[300px] max-w-[85%] flex-col border-l border-border bg-c-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <span className="flex items-center gap-2 text-[12.5px] font-semibold text-c-text2">
            <History className="h-3.5 w-3.5" />
            历史会话
            <span className="text-[11px] font-normal text-c-text4">
              {sessions.length}
            </span>
          </span>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-c-text3 transition-colors hover:bg-secondary hover:text-c-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="nv-panel-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading && sessions.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-c-text3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-4 text-xs leading-5 text-c-text3">
              还没有历史会话。发第一条消息后自动保存。
            </div>
          ) : (
            sessions.map((session) => {
              const active = session.id === activeSessionId;
              const editing = editingId === session.id;
              const deleting = deletingId === session.id;
              return (
                <div
                  key={session.id}
                  className={cn(
                    "group mb-1 rounded-lg border-l-2 px-2.5 py-2.5 transition-colors",
                    active
                      ? "border-primary bg-primary/[0.07]"
                      : "border-transparent hover:bg-secondary/70"
                  )}
                >
                  {editing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void onRename(session.id, editingTitle).then((ok) => {
                              if (ok) setEditingId("");
                            });
                          }
                          if (event.key === "Escape") setEditingId("");
                        }}
                        maxLength={120}
                        aria-label="会话名称"
                        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void onRename(session.id, editingTitle).then((ok) => {
                            if (ok) setEditingId("");
                          })
                        }
                        aria-label="保存会话名称"
                        className="grid h-7 w-7 place-items-center text-primary"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : deleting ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-c-text2">删除这条会话记录？</p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingId("");
                            void onDelete(session.id);
                          }}
                          className="h-7 rounded-md bg-red-600 px-2.5 text-[11px] font-medium text-white"
                        >
                          删除
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId("")}
                          className="h-7 rounded-md border border-border px-2.5 text-[11px] text-c-text2"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onLoad(session.id);
                          onClose();
                        }}
                        disabled={busy || loadingId === session.id}
                        className="min-w-0 flex-1 text-left disabled:opacity-60"
                      >
                        <span className="flex items-center gap-1.5">
                          {loadingId === session.id ? (
                            <Loader2 className="h-3.5 w-3.5 flex-none animate-spin" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5 flex-none text-c-text3" />
                          )}
                          <span className="truncate text-[12px] font-medium text-c-text">
                            {session.title || "未命名会话"}
                          </span>
                        </span>
                        <span className="mt-1 block pl-5 text-[10.5px] text-c-text4">
                          {formatSessionTime(session.updatedAt)} ·{" "}
                          {session.messageCount} 条消息
                        </span>
                      </button>
                      <div className="flex flex-none opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(session.id);
                            setEditingTitle(session.title);
                            setDeletingId("");
                          }}
                          aria-label={`重命名 ${session.title}`}
                          className="grid h-7 w-7 place-items-center text-c-text3 hover:text-c-text"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingId(session.id);
                            setEditingId("");
                          }}
                          disabled={busy && active}
                          aria-label={`删除 ${session.title}`}
                          className="grid h-7 w-7 place-items-center text-c-text3 hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
