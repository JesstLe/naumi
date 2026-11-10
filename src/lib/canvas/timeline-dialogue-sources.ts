import "server-only";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import type {TimelineProject} from "../timeline/project";
import {getCanvasTextNode} from "./text-node-repository";
import {canvasTextContent} from "./text-content";
import {ModelConfigError} from "../model-config/types";
import {canonicalConfig} from "../model-config/snapshot-value";

/** Retained originals are immutable snapshots; new claims must match owned saved text. */
export async function validateDialogueSources(actor:string,projectKey:string,project:TimelineProject,previous:TimelineProject|undefined,tx?:PoolClient){
  const trusted=previous?.dialogue?.lines.flatMap(line=>line.source?[canonicalConfig(line.source)]:[])||[];
  for(const line of project.dialogue?.lines||[]){
    const source=line.source;if(!source||trusted.includes(canonicalConfig(source)))continue;
    const node=await getCanvasTextNode(actor,source.nodeId,projectKey,tx),text=node?canvasTextContent(node):"";
    if(!node||node.status!=="completed"||createHash("sha256").update(text).digest("hex")!==source.sha256||source.end>text.length||text.slice(source.start,source.end)!==source.text||[source.start,source.end].some(i=>i>0&&i<text.length&&/[\uD800-\uDBFF]/.test(text[i-1])&&/[\uDC00-\uDFFF]/.test(text[i])))throw new ModelConfigError("TIMELINE_DIALOGUE_SOURCE_CHANGED","对白原文不存在或已改变，请重新读取原稿",409);
  }
}
