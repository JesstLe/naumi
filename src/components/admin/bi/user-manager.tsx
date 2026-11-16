"use client";
import { USER_POSITIONS } from "@/lib/bi/positions";
import { useRef, useState } from "react";
import type { BiRow } from "@/lib/bi/contracts";
import styles from "./dashboard.module.css";
import {loginIdentifierToEmail} from '@/lib/account-identity';
type Command = Record<string, string | number | boolean>;
const labels: Record<string, string> = {
  create: "创建账户",
  profile: "编辑基本资料",
  adjust: "调整积分",
  ban: "封禁 / 解封",
  role: "修改权限",
  "reset-password": "重置密码",
};
export function UserManager({
  row,
  onSaved,
}: {
  row?: BiRow;
  onSaved: (email: string) => void;
}) {
  const [action, setAction] = useState(row ? "profile" : "create");
  const [name, setName] = useState(String(row?.name || "")),
    [phone, setPhone] = useState(String(row?.phone || "")),
    [note, setNote] = useState(String(row?.note || "")),
    [position, setPosition] = useState(String(row?.position || ""));
  const [email, setEmail] = useState(String(row?.email || "")),
    [password, setPassword] = useState("");
  const [delta, setDelta] = useState(""),
    [initial, setInitial] = useState("0"),
    [months, setMonths] = useState("24"),
    [reason, setReason] = useState("");
  const [role, setRole] = useState(String(row?.role || "user")),
    [banned, setBanned] = useState(!row?.banned);
  const [review, setReview] = useState<Command | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const locked = useRef(false);
  const field = (
    label: string,
    value: string,
    set: (s: string) => void,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(e) => set(e.target.value)}
        {...props}
      />
    </label>
  );
  function prepare(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cmd: Command = {
      id: crypto.randomUUID(),
      email: loginIdentifierToEmail(email),
      action,
      reason,
    };
    if (row) cmd.expectedVersion = Number(row.management_version || 0);
    if (action === "create")
      Object.assign(cmd, {
        name,
        password,
        initialCredits: Number(initial),
        months: Number(months),
      });
    if (action === "profile") Object.assign(cmd, { name, phone, note, position });
    if (action === "adjust")
      Object.assign(cmd, { delta: Number(delta), months: Number(months) });
    if (action === "ban") cmd.banned = banned;
    if (action === "role") cmd.role = role;
    if (action === "reset-password") cmd.password = password;
    if (
      action === "adjust" &&
      (Number(delta) === 0 || Number(delta) < -Number(row?.available))
    ) {
      setError("请输入非零整数，扣减不能超过当前可用积分。");
      return;
    }
    setReview(cmd);
  }
  async function apply() {
    if (!review || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/bi/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
      });
      const json = await res.json();
      setUncertain(json.uncertain === true);
      if (!res.ok) throw new Error(json.error || "操作未提交");
      onSaved(String(review.email));
    } catch (e) {
      if (e instanceof TypeError || e instanceof SyntaxError) {
        setUncertain(true);
        setError(
          "连接中断，结果尚未确认。请使用此确认页重试，同一操作编号不会重复执行。",
        );
      } else setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.profile}>
      <h3>{row ? "用户管理" : "新增用户"}</h3>
      {row && (
        <p>
          当前可用 {Number(row.available).toLocaleString("zh-CN")} 积分，预留{" "}
          {Number(row.reserved).toLocaleString("zh-CN")}{" "}
          积分。管理修改保留历史作品、订单和流水。
        </p>
      )}
      {review ? (
        <>
          <h4>确认 {labels[String(review.action)]}</h4>
          <p>目标账户：{String(review.email)}</p>
          <p>原因：{String(review.reason)}</p>
          {action === "adjust" && (
            <p>
              积分变动：{Number(review.delta) > 0 ? "+" : ""}
              {String(review.delta)}，预计可用：
              {Number(row?.available) +
                Number(review.delta)}。新增积分有效期 {String(review.months)}{" "}
              个月。
            </p>
          )}
          {action === "create" && (
            <p>
              姓名：{String(review.name)} · 初始积分{" "}
              {String(review.initialCredits)}（有效期 {String(review.months)}{" "}
              个月），权限为普通用户。
            </p>
          )}
          {action === "profile" && (
            <p>
              姓名：{String(review.name)} · 手机：
              {String(review.phone) || "留空"} · 岗位：
              {String(review.position) || "未分组"} · 备注：
              {String(review.note) || "留空"}
            </p>
          )}
          {action === "role" && (
            <p>
              新权限：
              {review.role === "admin"
                ? "管理员（可访问全部用户及管理操作）"
                : "普通用户"}
            </p>
          )}
          {action === "ban" && (
            <p>
              {review.banned
                ? "封禁后旧会话失效，不能继续登录或使用功能。已受理的任务仍按既有规则结算。"
                : "解封后需要重新登录。"}
            </p>
          )}
          {action === "reset-password" && (
            <p>
              将替换登录密码并使旧会话失效，用户需重新登录。密码不会写入审计日志。
            </p>
          )}
          <p className={styles.muted}>操作编号：{String(review.id)}</p>
          <div className={styles.manageActions}>
            <button
              className={styles.button}
              disabled={busy || uncertain}
              onClick={() => {
                setReview(null);
                setError("");
              }}
            >
              返回修改
            </button>
            <button className={styles.primary} disabled={busy} onClick={apply}>
              {busy ? "正在提交…" : uncertain ? "重试同一操作" : "确认执行"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={prepare}>
          {row ? (
            <label>
              管理操作
              <select
                aria-label="管理操作"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setPassword("");
                  setError("");
                }}
              >
                {Object.entries(labels)
                  .filter(([id]) => id !== "create")
                  .map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            field("登录账号（邮箱或花名）", email, setEmail, {
              required: true,
              type: "text",
              maxLength: 254,
            })
          )}
          {["profile", "create"].includes(action) &&
            field("用户姓名", name, setName, { required: true, maxLength: 80 })}
          {action === "profile" && (
            <>
              {field("用户手机号", phone, setPhone, { maxLength: 40 })}
              <label>
                岗位
                <select
                  aria-label="岗位"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  <option value="">未分组</option>
                  {USER_POSITIONS.filter(Boolean).map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                用户备注
                <textarea
                  aria-label="用户备注"
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </>
          )}
          {["create", "reset-password"].includes(action) &&
            field("新登录密码", password, setPassword, {
              required: true,
              type: "password",
              minLength: 8,
              maxLength: 128,
              autoComplete: "new-password",
            })}
          {action === "create" && (
            <>
              {field("初始积分", initial, setInitial, {
                required: true,
                type: "number",
                min: 0,
                max: 1000000,
                step: 1,
              })}
              <p>仅发放填写的初始积分，不额外叠加注册赠送。</p>
            </>
          )}
          {action === "adjust" &&
            field("调整积分（正数增加，负数扣减）", delta, setDelta, {
              required: true,
              type: "number",
              min: -Number(row?.available),
              max: 1000000,
              step: 1,
            })}
          {["create", "adjust"].includes(action) &&
            field("新增积分有效期（月）", months, setMonths, {
              required: true,
              type: "number",
              min: 1,
              max: 120,
              step: 1,
            })}
          {action === "role" && (
            <label>
              账户权限
              <select
                aria-label="账户权限"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </label>
          )}
          {action === "ban" && (
            <label>
              目标状态
              <select
                aria-label="目标封禁状态"
                value={String(banned)}
                onChange={(e) => setBanned(e.target.value === "true")}
              >
                <option value="true">封禁</option>
                <option value="false">解封</option>
              </select>
            </label>
          )}
          {field("管理原因", reason, setReason, {
            required: true,
            minLength: 3,
            maxLength: 500,
          })}
          <button className={styles.primary} type="submit">
            检查并确认操作
          </button>
        </form>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
