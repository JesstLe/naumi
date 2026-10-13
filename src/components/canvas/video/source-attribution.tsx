"use client";
import {useVideoI18n} from "./i18n";
export function VideoSourceAttribution() { const V = useVideoI18n(); return <details className="text-[11px] opacity-60"><summary className="cursor-pointer">{V("\u5F00\u6E90\u6765\u6E90")}</summary><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1"><a href="https://github.com/tigerowo/infinite-canvas" target="_blank" rel="noreferrer">tigerowo / infinite-canvas · AGPL-3.0</a><a href="https://github.com/HBAI-Ltd/Toonflow-app" target="_blank" rel="noreferrer">HBAI-Ltd / Toonflow · MIT</a></div></details>; }
