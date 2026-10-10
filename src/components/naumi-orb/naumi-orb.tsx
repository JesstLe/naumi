"use client";

import { useEffect, useRef, useState } from "react";
import { loadOrbEngine, type OrbEngine } from "./orb-engine";
import { ORB_STATES, ORB_THEMES, gazeFromPoint, orbCanAnimate, type OrbState, type OrbTheme } from "./orb-model";
import styles from "./orb.module.css";

export interface NaumiOrbProps {
  state?: OrbState;
  theme?: OrbTheme;
  followPointer?: boolean;
  motion?: boolean;
  thumbnail?: boolean;
  label?: string;
  className?: string;
}

export function NaumiOrb({ state = "idle", theme = "naumi", followPointer = true,
  motion = true, thumbnail = false, label = "Naumi 小球", className = "" }: NaumiOrbProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<OrbEngine>();
  const active = useRef(false);
  const latest = useRef({ state, motion, followPointer });
  latest.current = { state, motion, followPointer };
  const syncActivity = useRef<() => void>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let instance: OrbEngine | undefined;
    let visible = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (!instance) return;
      const shouldRun = orbCanAnimate(latest.current.motion, reduced.matches, visible, !document.hidden, thumbnail);
      active.current = shouldRun;
      instance.setActive(shouldRun);
      if (!shouldRun) { instance.clearGaze(); instance.renderStatic(); }
    };
    syncActivity.current = update;
    const observer = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      update();
    });
    observer.observe(element);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    const point = (event: PointerEvent) => {
      if (!instance || !active.current || !latest.current.followPointer || event.pointerType === "touch") return;
      const target = gazeFromPoint(event.clientX, event.clientY, element.getBoundingClientRect());
      instance.setGaze(target.x, target.y);
    };
    const reset = () => instance?.clearGaze();
    if (!thumbnail) {
      window.addEventListener("pointermove", point, { passive: true });
      window.addEventListener("blur", reset);
      document.addEventListener("pointerleave", reset);
    }
    setFailed(false);
    loadOrbEngine().then(runtime => {
      if (disposed) return;
      const palette = ORB_THEMES[theme];
      instance = runtime.create(element, {
        emotion: ORB_STATES.find(item => item.key === latest.current.state)!.id,
        color: palette.body, eyeColor: palette.eyes, eyeScale: 1.08,
        label, autostart: false, lite: thumbnail, idle: false,
      });
      engine.current = instance;
      update();
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      observer.disconnect();
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pointermove", point);
      window.removeEventListener("blur", reset);
      document.removeEventListener("pointerleave", reset);
      instance?.destroy();
      engine.current = undefined;
      active.current = false;
      syncActivity.current = undefined;
    };
  }, [theme, thumbnail, label, attempt]);

  useEffect(() => { engine.current?.setEmotion(ORB_STATES.find(item => item.key === state)!.id); }, [state]);
  useEffect(() => { syncActivity.current?.(); }, [motion]);
  useEffect(() => { if (!followPointer) engine.current?.clearGaze(); }, [followPointer]);

  const spin = () => { if (active.current) engine.current?.spin(1); };
  return (
    <div className={`${styles.orb} ${className}`} data-orb-state={state} data-orb-theme={theme}>
      {thumbnail ? <div ref={host} className={styles.surface} aria-hidden="true" /> :
        <button type="button" className={styles.orbButton} onClick={spin} aria-label={`${label}，点击转一圈`}>
          <div ref={host} className={styles.surface} aria-hidden="true" />
        </button>}
      {failed && <button className={styles.retry} type="button" onClick={() => setAttempt(value => value + 1)}>重新加载</button>}
    </div>
  );
}
