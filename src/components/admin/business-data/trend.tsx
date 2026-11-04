import { useId } from "react";
import { Activity } from "lucide-react";
import { number } from "./model";
import type { BusinessResponse } from "./types";
import styles from "./business-data.module.css";

const colors = ["#7055d9", "#d69046", "#4d83bf", "#6d9879", "#c96993"];

export function BusinessTrend({ data }: { data: BusinessResponse | null }) {
  const id = useId().replaceAll(":", ""), width = 760, height = 214, left = 45, right = 18, top = 16, bottom = 31;
  const sources = data?.sources.filter(source => source.status === "succeeded" && source.data) || [];
  const ready = Boolean(data?.complete && sources.length === data.sources.length);
  const dates = Array.from(new Set(sources.flatMap(source => source.data!.daily.map(point => point.date)))).sort();
  const max = Math.max(1, ...sources.flatMap(source => source.data!.daily.map(point => point.credits)));
  const start = dates.length ? Date.parse(dates[0] + "T00:00:00Z") : 0, end = dates.length ? Date.parse(dates.at(-1)! + "T00:00:00Z") : 0;
  const x = (date: string) => left + (end === start ? .5 : (Date.parse(date + "T00:00:00Z") - start) / (end - start)) * (width - left - right);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  return <section className={styles.trend} aria-label="积分消耗趋势">
    <div className={styles.panelTitle}><h2>消费趋势</h2><span>积分</span></div>
    {!ready ? <div className={styles.chartPending}><Activity size={27}/><span>{data?.sources.some(source => ["offline", "failed", "unknown"].includes(source.status)) ? "站点数据未完整返回" : "等待站点数据"}</span></div>
      : !dates.length ? <div className={styles.chartPending}><Activity size={27}/><span>该时段暂无消费记录</span></div>
      : <>
        <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id + "title"}>
          <title id={id + "title"}>各站点每日实际消费积分</title>
          {[0, .5, 1].map(ratio => <g key={ratio}><line x1={left} y1={y(max * ratio)} x2={width - right} y2={y(max * ratio)} stroke="#ececf4" strokeDasharray={ratio ? "4 5" : undefined}/><text x={left - 9} y={y(max * ratio) + 4} textAnchor="end" fill="#9295a5" fontSize="10">{number(max * ratio)}</text></g>)}
          {sources.map((source, index) => {
            const points = source.data!.daily, stroke = colors[index % colors.length];
            const line = points.map((point, at) => `${at ? "L" : "M"}${x(point.date)},${y(point.credits)}`).join(" ");
            return <g key={source.id}><path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>{points.length <= 35 && points.map(point => <circle key={point.date} cx={x(point.date)} cy={y(point.credits)} r={points.length === 1 ? 4 : 2.5} fill={stroke}><title>{source.name} · {point.date} · {number(point.credits)} 积分</title></circle>)}</g>;
          })}
          {[dates[0], ...(dates.length > 3 ? [dates[Math.floor(dates.length / 2)]] : []), ...(dates.length > 1 ? [dates.at(-1)!] : [])].map((date, index) => <text key={date} x={x(date)} y={height - 8} textAnchor={index === 0 && dates.length > 1 ? "start" : date === dates.at(-1) && dates.length > 1 ? "end" : "middle"} fill="#9295a5" fontSize="10">{date.slice(5).replace("-", "/")}</text>)}
        </svg>
        <div className={styles.legend}>{sources.map((source, index) => <span key={source.id}><i style={{ background: colors[index % colors.length] }}/>{source.name}<strong>{number(source.data!.totals.credits)}</strong></span>)}</div>
      </>}
  </section>;
}
