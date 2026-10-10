"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MousePointer2, Sparkles, RotateCcw, Pause, Play, X } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { NaumiOrb } from "@/components/naumi-orb/naumi-orb";
import { ORB_STATES, ORB_THEMES, type OrbState, type OrbTheme } from "@/components/naumi-orb/orb-model";
import styles from "./orb-lab.module.css";

export function OrbLab() {
  const brand = useBrand();
  const [state, setState] = useState<OrbState>("idle");
  const [theme, setTheme] = useState<OrbTheme>("naumi");
  const [follow, setFollow] = useState(true);
  const [motion, setMotion] = useState(true);
  const [companion, setCompanion] = useState(true);
  const [replay, setReplay] = useState(0);
  const current = ORB_STATES.find(item => item.key === state)!;
  return (
    <div className={styles.lab}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={`${brand.name} 首页`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} width={34} height={34} alt="" />
          {!brand.logoHasText && <span>{brand.name}</span>}
        </Link>
        <span className={styles.headerTag}>DESIGN LAB <span>/</span> 01</span>
        <Link href="/dashboard" className={styles.exit}>工作台 <ArrowUpRight size={14} /></Link>
      </header>
      <div className={styles.layout}>
        <section className={styles.stage} aria-label="小球交互预览">
          <div className={styles.stageTop}><span className={styles.liveDot} /><span>实时预览</span><span className={styles.svgTag}>SVG</span></div>
          <div className={styles.stageCenter}>
            <div className={styles.orbit} aria-hidden="true" />
            <span className={`${styles.cross} ${styles.crossOne}`} aria-hidden="true">+</span>
            <span className={`${styles.cross} ${styles.crossTwo}`} aria-hidden="true">+</span>
            <div className={styles.heroOrb}>
              <NaumiOrb key={replay} state={state} theme={theme} followPointer={follow} motion={motion} label={`${brand.name} 小球`} />
              <div className={styles.shadow} aria-hidden="true" />
            </div>
          </div>
          <div className={styles.stageBottom}>
            <div className={styles.current}><span>{current.label}</span><small>{current.en}</small></div>
            <span className={styles.hint}>移动鼠标 · 点击转圈</span>
            <button type="button" onClick={() => setReplay(value => value + 1)} aria-label="重播当前表情" title="重播"><RotateCcw size={16} /></button>
          </div>
        </section>
        <aside className={styles.controls}>
          <div className={styles.title}><span className={styles.eyebrow}>ORB / 01</span><h1>品牌小球<span>。</span></h1></div>
          <section className={styles.controlSection} aria-labelledby="orb-appearance">
            <div className={styles.sectionTitle}><h2 id="orb-appearance">外观</h2><span>01 / APPEARANCE</span></div>
            <div className={styles.themes}>
              {(Object.keys(ORB_THEMES) as OrbTheme[]).map(key => <button type="button" key={key} aria-pressed={theme === key} onClick={() => setTheme(key)} className={theme === key ? styles.selectedTheme : ""}>
                <i style={{ background: ORB_THEMES[key].body }}><b style={{ background: ORB_THEMES[key].eyes }} /><b style={{ background: ORB_THEMES[key].eyes }} /></i>
                <span>{ORB_THEMES[key].label}</span>
              </button>)}
            </div>
          </section>
          <section className={styles.controlSection} aria-labelledby="orb-expressions">
            <div className={styles.sectionTitle}><h2 id="orb-expressions">表情</h2><span>02 / EXPRESSION</span></div>
            <div className={styles.states}>
              {ORB_STATES.map(item => <button type="button" key={item.key} onClick={() => setState(item.key)} aria-pressed={state === item.key} className={state === item.key ? styles.selectedState : ""}>
                <div className={styles.miniOrb}><NaumiOrb state={item.key} theme={theme} thumbnail label={`${item.label}缩略图`} /></div>
                <span>{item.label}</span>
              </button>)}
            </div>
          </section>
          <section className={styles.controlSection} aria-labelledby="orb-interaction">
            <div className={styles.sectionTitle}><h2 id="orb-interaction">互动</h2><span>03 / INTERACTION</span></div>
            <div className={styles.toggles}>
              <Toggle checked={follow} onChange={() => setFollow(!follow)} icon={<MousePointer2 size={16} />} label="跟随光标" />
              <Toggle checked={motion} onChange={() => setMotion(!motion)} icon={motion ? <Play size={16} /> : <Pause size={16} />} label="动态效果" />
              <Toggle checked={companion} onChange={() => setCompanion(!companion)} icon={<Sparkles size={16} />} label="角落小球" />
            </div>
          </section>
          <a className={styles.reference} href="https://github.com/tycoding/grok-ball" target="_blank" rel="noreferrer">参考项目 · grok-ball <ArrowUpRight size={13} /></a>
        </aside>
      </div>
      {companion && <div className={styles.companion}>
        <button type="button" onClick={() => setCompanion(false)} className={styles.closeCompanion} aria-label="收起角落小球"><X size={11} /></button>
        <NaumiOrb state={state} theme={theme} followPointer={follow} motion={motion} label={`${brand.name} 角落小球`} />
      </div>}
    </div>
  );
}

function Toggle({ checked, onChange, icon, label }: { checked: boolean; onChange: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={onChange} className={styles.toggle}>
    {icon}<span>{label}</span><i className={checked ? styles.switchOn : styles.switchOff}><b /></i>
  </button>;
}
