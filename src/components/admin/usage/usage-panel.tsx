"use client";
import {useMemo} from "react";
import {Activity,CalendarDays,Eye,Loader2,RefreshCw,TrendingUp,Users} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useMemberDetail} from "./use-member-detail";
import {useUsageQuery} from "./use-usage-query";
import {AdminMemberDetail} from "./member-detail";
import {Pager} from "../pager";
/** Only the usage panel reads member statistics. System configuration never
 * loads the old member/ledger payload merely because administrator auth passed. */
export function AdminUsagePanel({token,usageDays,setUsageDays,onManageUsers}:{token:string|null;usageDays:number;setUsageDays:(days:number)=>void;onManageUsers:()=>void}){
 const {usersData,setUsersData,usageData,usageLoading,usageError,page,setPage,refresh}=useUsageQuery(token,usageDays);
 const usersByEmail=useMemo(()=>new Map(usersData?.users.map(user=>[user.email,user])??[]),[usersData]);
 const usagePeak=useMemo(()=>Math.max(1,...(usageData?.daily??[]).map(row=>row.credits)),[usageData]);
 const member=useMemberDetail(token,usersData,setUsersData),{openDetail}=member;
 return <>
 {member.msg&&<p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${member.msg.ok?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-red-200 bg-red-50 text-red-600"}`}>{member.msg.text}</p>}
 {usageError&&<p role="alert" className="mb-4 text-sm text-red-600">{usageError}</p>}
<div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">用户用量管理</h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                结算流水
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border bg-card p-1">
                {[7, 30, 90, 365].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => {setPage(1);setUsageDays(days);}}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      usageDays === days
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {days === 365 ? "全年" : `${days} 天`}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={usageLoading || !token}
                onClick={refresh}
              >
                {usageLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                刷新
              </Button>
            </div>
          </div>

          {!usageData ? (
            <div className="rounded-2xl border border-border bg-card py-14 text-center text-sm text-muted-foreground card-shadow">
              {usageLoading ? "加载用量…" : "暂无用量数据"}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: TrendingUp,
                    label: `近 ${usageData.rangeDays} 天消耗积分`,
                    value: usageData.totals.credits,
                  },
                  {
                    icon: Activity,
                    label: "收费操作次数",
                    value: usageData.totals.operations,
                  },
                  {
                    icon: Users,
                    label: "活跃用户",
                    value: usageData.totals.activeUsers,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-border bg-card p-5 card-shadow"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <stat.icon className="h-4 w-4" />
                    </span>
                    <p className="mt-3 text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
                <div className="overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                      <h3 className="text-sm font-semibold">用户消耗排行</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        仅统计已结算的实际扣费，管理员手动扣减不计入用量。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onManageUsers()}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      管理余额
                    </button>
                  </div>
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b border-border text-left text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-medium">用户</th>
                        <th className="px-5 py-3 font-medium">消耗积分</th>
                        <th className="px-5 py-3 font-medium">操作次数</th>
                        <th className="px-5 py-3 font-medium">剩余积分</th>
                        <th className="px-5 py-3 font-medium">最近使用</th>
                        <th className="px-5 py-3 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageData.users.map((row) => {
                        const user = usersByEmail.get(row.email);
                        return (
                          <tr key={row.email} className="border-b border-border last:border-0">
                            <td className="px-5 py-3">
                              <div className="font-medium">{row.name || "未命名用户"}</div>
                              <div className="text-xs text-muted-foreground">{row.email}</div>
                            </td>
                            <td className="px-5 py-3 font-semibold">{row.credits}</td>
                            <td className="px-5 py-3">{row.operations}</td>
                            <td className="px-5 py-3">{row.balance}</td>
                            <td className="px-5 py-3 text-xs text-muted-foreground">
                              {row.lastUsedAt
                                ? new Date(row.lastUsedAt).toLocaleString("zh-CN")
                                : "—"}
                            </td>
                            <td className="px-5 py-3">
                              {user ? (
                                <button
                                  type="button"
                                  onClick={() => void openDetail(user)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                                >
                                  <Eye className="h-3 w-3" />
                                  查看明细
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onManageUsers()}
                                  className="text-xs text-primary hover:underline"
                                >
                                  用户管理
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {usageData.pagination&&<Pager page={page-1} totalPages={Math.max(1,Math.ceil(usageData.pagination.total/30))} onChange={value=>setPage(value+1)} disabled={usageLoading} totalLabel={`共 ${usageData.pagination.total} 位用户`}/>}
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 card-shadow">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">每日消耗</h3>
                  </div>
                  {usageData.daily.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">暂无扣费记录</p>
                  ) : (
                    <div className="space-y-3">
                      {usageData.daily.slice(-14).map((day) => (
                        <div key={day.date} className="grid grid-cols-[72px_1fr_42px] items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{day.date.slice(5)}</span>
                          <div className="h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.max(4, (day.credits / usagePeak) * 100)}%` }}
                            />
                          </div>
                          <span className="text-right font-medium">{day.credits}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-4 text-[11px] text-muted-foreground">积分 · 最近 14 个有记录的日期</p>
                </div>
              </div>
            </div>
          )}
        </div>
 <AdminMemberDetail member={member}/>
 </>;
}
