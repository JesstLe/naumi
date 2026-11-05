"use client";
import {Ban,Globe,Loader2,X} from "lucide-react";
import {CachedImage} from "@/components/cached-image";
import {ImageLightbox} from "@/components/image-lightbox";
import {cdnUrl} from "@/lib/cdn";
import {artworkToolHref} from "./member-artwork";
import type {useMemberDetail} from "./use-member-detail";
export function AdminMemberDetail({member}:{member:ReturnType<typeof useMemberDetail>}){
 const {detailRow,detail,detailLoading,noteDraft,setNoteDraft,busy,toggleBan,banRowIp,userAction,closeDetail,memberBatches,batchEntersCanvas,lightbox,setLightbox}=member;
 return <>
      {(detailRow || detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/50"
          onClick={closeDetail}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="drawer-in h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">
                  会员详情
                  {detailRow ? ` · ${detailRow.name}` : ""}
                </h3>
                <p className="truncate text-xs text-muted-foreground">
                  {detailRow?.email ?? detail?.email}
                </p>
              </div>
              <button
                onClick={closeDetail}
                aria-label="关闭"
                className="shrink-0 rounded-md p-1 hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailRow && (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
                <Globe className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">登录 IP：</span>
                <code className="font-medium">{detailRow.lastIp ?? "—"}</code>
                {detailRow.banned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    <Ban className="h-3 w-3" />
                    已封禁
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => toggleBan(detailRow)}
                    className={`rounded-md border px-2 py-1 text-xs disabled:opacity-50 ${
                      detailRow.banned
                        ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        : "border-amber-300 text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    {detailRow.banned ? "解封用户" : "封禁用户"}
                  </button>
                  {detailRow.lastIp && (
                    <button
                      disabled={busy}
                      onClick={() => banRowIp(detailRow.lastIp as string)}
                      className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                    >
                      封禁此 IP
                    </button>
                  )}
                </div>
              </div>
            )}

            {detailRow && (
              <div className="mb-5 rounded-xl border border-border bg-secondary/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">管理备注</span>
                  <span className="text-xs text-muted-foreground">
                    仅管理员可见
                  </span>
                </div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value.slice(0, 1000))}
                  placeholder="为该用户添加内部备注（如：VIP、已退款、可疑账号…）"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-border bg-card p-2.5 text-sm outline-none focus:border-primary"
                />
                <div className="mt-2 flex items-center gap-2">
                  <span className="mr-auto text-xs text-muted-foreground">
                    {noteDraft.length}/1000
                  </span>
                  {detailRow.note && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setNoteDraft("");
                        void userAction({
                          action: "note",
                          email: detailRow.email,
                          note: "",
                        });
                      }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
                    >
                      清空
                    </button>
                  )}
                  <button
                    disabled={busy || noteDraft === (detailRow.note ?? "")}
                    onClick={() =>
                      void userAction({
                        action: "note",
                        email: detailRow.email,
                        note: noteDraft,
                      })
                    }
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    保存备注
                  </button>
                </div>
              </div>
            )}

            {detailLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载中…
              </div>
            ) : detail ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: "剩余积分",
                      value: detail.user
                        ? detail.user.creditsTotal - detail.user.creditsUsed
                        : 0,
                    },
                    {
                      label: "累计消耗",
                      value: detail.ledger
                        .filter((l) => l.delta < 0 && l.kind !== "expire")
                        .reduce((s, l) => s - l.delta, 0),
                    },
                    { label: "作品数", value: detail.artworks.length },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-border bg-secondary/40 p-3"
                    >
                      <p className="text-xs text-muted-foreground">
                        {s.label}
                      </p>
                      <p className="mt-1 text-lg font-bold">{s.value}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold">
                    生成作品（{detail.artworks.length} 张 ·{" "}
                    {memberBatches.length} 次生成）
                  </h4>
                  {detail.artworks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      该会员还没有作品。
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {memberBatches.map((batch, bi) => (
                        <div
                          key={batch[0].id}
                          className="rounded-lg border border-border p-2"
                        >
                          {/* 头部:跟前端进画布规则一致 —— 套图/多图批次或多节点血缘 → 点标题进
                              只读画布(看血缘+每张提示词);单张一次性图 → 点标题只看大图,不进画布。 */}
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                            {batchEntersCanvas(batch) ? (
                              <a
                                href={`/canvas?email=${encodeURIComponent(
                                  detailRow?.email ?? ""
                                )}&node=${encodeURIComponent(batch[0].id)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 flex-1 truncate text-muted-foreground transition-colors hover:text-primary hover:underline"
                                title={`${batch[0].prompt}\n点击进入作品页(创作画布·只读)`}
                              >
                                第 {memberBatches.length - bi} 批 ·{" "}
                                {batch[0].title}
                              </a>
                            ) : (
                              <a
                                href={artworkToolHref(batch[0])}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 flex-1 truncate text-muted-foreground transition-colors hover:text-primary hover:underline"
                                title={`${batch[0].prompt}\n点击进入对应功能页(生图/抠图/融图)`}
                              >
                                第 {memberBatches.length - bi} 批 ·{" "}
                                {batch[0].title}
                              </a>
                            )}
                            <span className="shrink-0 font-medium text-primary">
                              共 {batch.length} 张
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                            {batch.map((a) => (
                              /* 点图 → 直接大图查看(ImageLightbox) */
                              <button
                                key={a.id}
                                type="button"
                                onClick={() =>
                                  setLightbox({ src: a.image, alt: a.title })
                                }
                                className="block overflow-hidden rounded-md border border-border transition-all hover:-translate-y-0.5 hover:border-primary/50"
                                title="点击查看大图"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <CachedImage
                                  src={cdnUrl(a.image)}
                                  alt={a.title}
                                  loading="lazy"
                                  className="aspect-square w-full bg-secondary object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold">
                    积分消耗明细（{detail.ledger.length}）
                  </h4>
                  {detail.ledger.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      暂无积分流水。
                    </p>
                  ) : (
                    <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                      {detail.ledger.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-center justify-between px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {l.reason}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(l.createdAt).toLocaleString("zh-CN")}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 font-semibold ${
                              l.delta >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {l.delta >= 0 ? "+" : ""}
                            {l.delta}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          src={cdnUrl(lightbox.src)}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
 </>;
}
