"use client";
import {useEffect, useRef, useState} from "react";
import {audioGainAt, effectiveAudioEdit, type AudioEdit} from "@/lib/audio/project";

/** Real decoded peaks, and one gain envelope shared with the export recipe. */
export function useAudioPreview(url: string | undefined, edit: AudioEdit) {
  const media = useRef<HTMLAudioElement>(null), graph = useRef<{context: AudioContext; gain: GainNode} | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]), [duration, setDuration] = useState(0), [current, setCurrent] = useState(0), [playing, setPlaying] = useState(false), [error, setError] = useState("");
  const editRef = useRef(edit); editRef.current = edit;
  useEffect(() => {
    setPeaks([]); setDuration(0); setCurrent(0); setPlaying(false); setError("");
    if (!url) return;
    const controller = new AbortController(), context = new AudioContext(), player = media.current; let live = true;
    void (async () => {
      const response = await fetch(url, {credentials: "same-origin", signal: controller.signal});
      if (!response.ok) throw new Error("音频读取失败");
      const decoded = await context.decodeAudioData(await response.arrayBuffer()), count = 180, values = Array.from({length: count}, () => 0);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const samples = decoded.getChannelData(channel), step = Math.max(1, Math.floor(samples.length / count));
        for (let index = 0; index < count; index++) for (let i = index * step; i < Math.min(samples.length, (index + 1) * step); i++) values[index] = Math.max(values[index], Math.abs(samples[i]));
      }
      if (live) {setPeaks(values); setDuration(decoded.duration);}
    })().catch(cause => {if (live && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "音频解码失败");}).finally(() => {void context.close().catch(() => {});});
    return () => {live = false; controller.abort(); void context.close().catch(() => {}); player?.pause();};
  }, [url]);
  useEffect(() => {const player = media.current; return () => {player?.pause(); void graph.current?.context.close();};}, []);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const player = media.current;
      if (player) {
        setCurrent(player.currentTime);
        try {
          const range = effectiveAudioEdit(editRef.current, duration);
          if (!player.paused && player.currentTime >= range.end) {player.pause(); setPlaying(false);}
          if (graph.current) graph.current.gain.gain.setValueAtTime(audioGainAt(editRef.current, duration, player.currentTime - range.start), graph.current.context.currentTime);
        } catch {if (!player.paused) {player.pause(); setPlaying(false);}}
      }
      frame = requestAnimationFrame(update);
    };
    if (playing) frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  async function toggle() {
    const player = media.current; if (!player || !duration) return;
    try {
      if (!player.paused) {player.pause(); setPlaying(false); return;}
      const range = effectiveAudioEdit(editRef.current, duration);
      if (!graph.current) {const context = new AudioContext(), gain = context.createGain(); context.createMediaElementSource(player).connect(gain).connect(context.destination); graph.current = {context, gain};}
      await graph.current.context.resume();
      if (player.currentTime < range.start || player.currentTime >= range.end) player.currentTime = range.start;
      graph.current.gain.gain.setValueAtTime(audioGainAt(editRef.current, duration, player.currentTime - range.start), graph.current.context.currentTime);
      await player.play(); setPlaying(true); setError("");
    } catch (cause) {setError(cause instanceof Error ? cause.message : "音频预览失败");}
  }
  function seek(value: number) {if (media.current) media.current.currentTime = value; setCurrent(value);}
  return {media, peaks, duration, current, playing, error, toggle, seek, metadata: () => {if (media.current && Number.isFinite(media.current.duration)) setDuration(media.current.duration);}, ended: () => setPlaying(false)};
}
