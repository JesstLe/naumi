"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { validatePublicReleaseNotes, type PublicReleaseNote } from "@/lib/public-release-notes";
import styles from "./release-notes.module.css";

export function ReleaseHistory({ entries, version, english = false }: { entries: PublicReleaseNote[]; version: string; english?: boolean }) {
  const language = english ? "en" : "zh";
  if (!entries.length) return <p className={styles.empty}>{english ? "No public update notes for this version yet." : "此版本暂无公开更新记录。"}</p>;
  return <div className={styles.history}>
    {entries.map(note => <article key={note.version} className={styles.release}>
      <div className={styles.meta}><span>v{releaseVersionLabel(note.version)}</span>{note.version === version && <b>{english ? "Current page" : "当前页面"}</b>}</div>
      <h3>{note.title[language]}</h3>
      {(["improvements", "fixes"] as const).map(key => note[key].length > 0 && <section key={key}>
        <h4 data-kind={key}>{key === "improvements" ? english ? "Improvements" : "优化" : english ? "Fixes" : "修复"}</h4>
        <ul>{note[key].map((item, i) => <li key={i}>{item[language]}</li>)}</ul>
      </section>)}
    </article>)}
  </div>;
}
export function releaseVersionLabel(value: string) {
  if (!/^[1-9]\d{8,10}$/.test(value)) return "dev";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(Number(value) * 1000));
  const p = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${p("year")}.${p("month")}.${p("day")}-${p("hour")}${p("minute")}${p("second")}`;
}
export function ReleaseNotes({ endpoint, version, english = false }: { endpoint: string; version: string; english?: boolean }) {
  const [state, setState] = useState<{ entries: PublicReleaseNote[]; status: "loading" | "ready" | "error" }>({ entries: [], status: "loading" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setState({ entries: [], status: "loading" });
    const timeout = setTimeout(() => controller.abort(), 10000);
    void fetch(`${endpoint}?version=${encodeURIComponent(version)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error("Unavailable"); const data = await response.json(); if (data.version !== version) throw Error("Version mismatch"); return validatePublicReleaseNotes(data.entries); })
      .then(entries => { if (active) setState({ entries, status: "ready" }); })
      .catch(() => { if (active) setState({ entries: [], status: "error" }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [endpoint, version, reload]);
  if (state.status === "loading") return <p className={styles.empty} role="status">{english ? "Loading update notes…" : "正在加载更新说明…"}</p>;
  if (state.status === "error") return <div className={styles.empty} role="status"><p>{english ? "Update notes could not be loaded." : "更新说明暂时未能加载。"}</p><button className={styles.retry} onClick={() => setReload(value => value + 1)}><RefreshCw size={12} />{english ? "Retry" : "重试"}</button></div>;
  return <ReleaseHistory entries={state.entries} version={version} english={english} />;
}
