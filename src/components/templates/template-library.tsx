"use client";

import { useState } from "react";
import { CREATION_CASES } from "@/lib/creation-cases/catalog";
import { CreationCaseGallery } from "./creation-case-gallery";
import { TemplatesClient } from "./templates-client";
import styles from "./creation-cases.module.css";

type View = "all" | "image" | "video" | "templates";
const views: { id: View; label: string }[] = [{ id: "all", label: "精选案例" }, { id: "image", label: "图片" }, { id: "video", label: "短视频" }, { id: "templates", label: "模板库" }];

/** One owner for both entry points; the existing DB template/favorite UI is retained. */
export function TemplateLibrary({ home = false }: { home?: boolean }) {
  const [view, setView] = useState<View>("all");
  const Heading = home ? "h2" : "h1";
  return <div className={styles.library} data-testid="template-library">
    <header className={styles.heading}><Heading>{home ? "创作灵感" : "模板中心"}</Heading><span>公开案例</span></header>
    <div className={styles.tabs} aria-label="内容类型">
      {views.map(tab => <button type="button" key={tab.id} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}>{tab.label}
        {(tab.id === "image" || tab.id === "video") && <span>{CREATION_CASES.filter(item => item.kind === tab.id).length}</span>}
      </button>)}
    </div>
    {view === "templates" ? <TemplatesClient variant="creation" gridClass="columns-2 lg:columns-4" /> : <CreationCaseGallery key={view} kind={view} home={home} />}
  </div>;
}
