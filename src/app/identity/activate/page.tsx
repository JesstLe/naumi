"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/components/enterprise/identity-manager.module.css";
export default function ActivateIdentity() {
  const [token, setToken] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    setToken(new URLSearchParams(location.hash.slice(1)).get("token") || "");
    history.replaceState(null, "", location.pathname);
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/identity-activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "设置失败");
      setDone(true);
      setToken("");
      setPassword("");
      setConfirm("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className={styles.panel}
      style={{ maxWidth: 440, margin: "12vh auto", padding: 30 }}
    >
      <h1 style={{ fontSize: 24, color: "#253d5a" }}>
        {done ? "账号已就绪" : "设置 Naumi 密码"}
      </h1>
      {done ? (
        <Link href="/?auth=sign-in">前往登录</Link>
      ) : (
        <form className={styles.fields} onSubmit={(e) => void save(e)}>
          <label>
            新密码
            <input
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            确认密码
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <button className={styles.primary} disabled={busy || !token}>
            {busy ? "保存中…" : "设置密码"}
          </button>
        </form>
      )}
    </main>
  );
}
