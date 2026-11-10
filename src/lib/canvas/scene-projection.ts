import type {CanvasTimelineNode} from "./timeline-node-schema";
import type {CanvasAudioNode} from "./audio-node-schema";
import type {CanvasSceneNode} from "./scene-node-schema";
import {parseVisualInputIdentity} from "./visual-input-identity";
import type {CanvasCharacterNode} from "./character-node-schema";
import type {Node,Edge} from "@xyflow/react";
import type {Artwork} from "../mock-data";
import type {CanvasPoint} from "./stable-placement";
import {stableArtworkPositions} from "./stable-placement";
import {explicitCanvasParent} from "./input-references";
import {artworkImageSize,artworkNodeSize,estimateTextNodeHeight,TEXT_NODE_MAX_W,TEXT_NODE_MAX_H} from "./node-geometry";
import {generationPlaceholderSize,placeGenerationPreview} from "./generation-feedback";
import {generationFailureTitle} from "./generation-failure";
import {defaultNodeSettings,type CanvasNodeSettings} from "./node-settings";
import type {CanvasGenerationTask,CanvasPendingNode,CanvasSceneActions,CanvasArtNodeData,CanvasTextNodeData,CanvasPendingNodeData} from "./scene-types";
import type {CanvasTextNode} from "./text-document-model";
import type {CanvasVideoNode} from "./video-node-schema";
import {type PublicVideoTaskView} from "../video/queries";
import type {ImportedManifest} from "./workflow-clipboard";
import type {VideoPlayerAction} from "../video/player-actions";
const DEFAULT_CANVAS_SETTINGS=defaultNodeSettings();

export function layoutGraph(
  arts: Artwork[],
  rootLabel: string,
  onDimensions: (id: string, width: number, height: number) => void,
  onCanvasResize: (
    id: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) => void,
  onCanvasRatioRepair: (id: string, width: number, height: number) => void,
  onRenameRequest: (id: string, label: string) => void,
  onVideoExtract: (id: string, action: VideoPlayerAction) => void,
  generatedPositions = new Map<string, CanvasPoint>()
): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(arts.map((a) => [a.id, a]));
  const sorted = [...arts].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  // Rendering allocates only missing positions; only tidyLayout performs a global layout.
  const positions = stableArtworkPositions(sorted.map(art => ({ ...art, ...artworkNodeSize(art) })), generatedPositions);
  const nodes: Node<CanvasArtNodeData>[] = sorted.map((a, idx) => {
    const isRoot = !(a.parentId && byId.has(a.parentId));
    const canvasSize = artworkImageSize(a);
    const position = positions.get(a.id) ?? { x: 0, y: 0 };
    return {
      id: a.id,
      type: "art",
      position,
      data: {
        id: a.id,
        category: a.category,
        image: a.image,
        videoUrl: a.videoUrl ?? undefined,
        label: a.title,
        rootLabel: isRoot ? rootLabel : null,
        version: idx + 1, // 项目内按生成时间的版本序号
        prompt: a.prompt,
        date: a.createdAt,
        marked: !!a.marked,
        canvasGroupId: a.canvasGroupId ?? null,
        ratio: a.ratio,
        width: canvasSize.width,
        height: canvasSize.height,
        intrinsicWidth: a.width,
        processingKind: a.processingKind,
        intrinsicHeight: a.height,
        onDimensions,
        onCanvasResize,
        onCanvasRatioRepair,
        onRenameRequest,
        onVideoExtract,
      },
      style: {
        width: canvasSize.width,
        // 标题是负 top 的绝对定位元素，不占节点边界；节点高度必须等于图片卡高度。
        height: canvasSize.height,
      },
    };
  });
  const edges: Edge[] = [];
  for (const a of sorted) {
    // primary 血缘边(canvas-add 独立节点不画)
    if (a.parentId && byId.has(a.parentId) && explicitCanvasParent(a, a.parentId)) {
      edges.push({
        id: `e-${a.parentId}-${a.id}`,
        source: a.parentId as string,
        sourceHandle: "out",
        target: a.id,
        targetHandle: "in",
        type: "default",
      });
    }
    // 多输入额外边(显式连接,总是画)
    for (const pid of a.parentIds ?? []) {
      if (pid && byId.has(pid) && pid !== a.parentId) {
        edges.push({
          id: `e-${pid}-${a.id}`,
          source: pid,
          sourceHandle: "out",
          target: a.id,
          targetHandle: "in",
          type: "default",
        });
      }
    }
  }
  return { nodes, edges };
}


export function lineageChain(
  members: Artwork[],
  selectedId: string | null
): Set<string> {
  const chain = new Set<string>();
  if (!selectedId) return chain;
  const byId = new Map(members.map((m) => [m.id, m]));
  // 项目归属不是输入；显式连线仍参与血缘和助手上下文。
  const parentsOf = (m: Artwork): string[] => {
    const ps = new Set<string>();
    if (m.parentId && byId.has(m.parentId) && explicitCanvasParent(m, m.parentId)) ps.add(m.parentId);
    for (const pid of m.parentIds ?? [])
      if (pid && byId.has(pid)) ps.add(pid);
    return [...ps];
  };
  const childrenOf = new Map<string, string[]>();
  for (const m of members) {
    for (const p of parentsOf(m)) {
      const arr = childrenOf.get(p) ?? [];
      arr.push(m.id);
      childrenOf.set(p, arr);
    }
  }
  // 上溯祖先(含多输入父,BFS)
  const up = [selectedId];
  let guard = 0;
  while (up.length && guard++ < 2000) {
    const id = up.pop() as string;
    if (chain.has(id)) continue;
    chain.add(id);
    const m = byId.get(id);
    if (m) for (const p of parentsOf(m)) up.push(p);
  }
  // 下延衍生(BFS)
  const stack = [selectedId];
  while (stack.length) {
    const id = stack.pop() as string;
    for (const c of childrenOf.get(id) ?? []) {
      if (!chain.has(c)) {
        chain.add(c);
        stack.push(c);
      }
    }
  }
  return chain;
}


import type {CanvasDirectorNode} from "./director-node-schema";
export type CanvasSceneInput={
  nodes:Node[];edges:Edge[];active:{members:Artwork[]}|null;activeKey:string|null;
  generationTasks:Omit<CanvasGenerationTask,"isVisible">[];taskPositions:Record<string,CanvasPoint>;pendNodes:CanvasPendingNode[];
  textBusyIds?:ReadonlySet<string>;textNodes:CanvasTextNode[];videoNodes:CanvasVideoNode[];directorNodes?:CanvasDirectorNode[];characterNodes?:CanvasCharacterNode[];sceneNodes?:CanvasSceneNode[];audioNodes?:CanvasAudioNode[];timelineNodes?:CanvasTimelineNode[];videoTasks:PublicVideoTaskView[];works:Artwork[]|null;
  selectedId:string|null;selectedPendId:string|null;selectedTextId:string|null;multiSel:string[];expandedTextIds:Set<string>;
  locale:string;lightCanvas:boolean;nodeSettings:Record<string,CanvasNodeSettings>;nodeSettingsReady:boolean;readOnly:boolean;
  cutoutAvailable:boolean;operations:ReadonlySet<string>;workflowManifests:ImportedManifest[];actions:CanvasSceneActions;
};
/** Pure view composition: the document and task owners supply DTOs; renderers
 * receive presentation and commands only. No network, persistence or React state. */
export function projectCanvasScene(input:CanvasSceneInput):{displayNodes:Node[];displayEdges:Edge[]}{
  const {nodes,edges,active,activeKey,generationTasks,taskPositions,pendNodes,textNodes,videoNodes,directorNodes=[],characterNodes=[],sceneNodes=[],audioNodes=[],timelineNodes=[],videoTasks,works,selectedId,selectedPendId,selectedTextId,multiSel,expandedTextIds,locale,lightCanvas,nodeSettings,nodeSettingsReady,readOnly,cutoutAvailable,operations,workflowManifests,actions}=input;
  const baseIds=new Set(nodes.map(node=>node.id)),memberById=new Map((active?.members||[]).map(art=>[art.id,art])),memberIds=new Set(memberById.keys());
  const textIds=new Set(textNodes.map(node=>node.id)),projectTextIds=new Set(textNodes.filter(node=>node.projectKey===activeKey).map(node=>node.id)),videoIds=new Set(videoNodes.map(node=>node.id));
  const busyArtworkIds=new Set([...pendNodes.filter(node=>node.generating&&!node.generationFailure&&node.operationKey?.startsWith("node:")).map(node=>node.operationKey!.slice(5)),...generationTasks.filter(task=>!task.failure).map(task=>task.sourceId)]);
  const videoTaskById=new Map(videoTasks.map(task=>[task.id,task])),workById=new Map((works||[]).map(art=>[art.id,art]));
    const baseNodes = [...nodes];
    const baseEdges = [...edges];
    const currentReplacement=new Map<string,string>();
    for(const task of generationTasks)if(task.replaceNode&&!task.displaySuperseded)currentReplacement.set(task.sourceId,task.id);
    // 每个生成任务都有自己的占位节点。后端超过并发上限时自行排队，画布不再全局锁死。
    for (const task of generationTasks) {
      if (!baseIds.has(task.sourceId)) continue;
      if(task.replaceNode){if(currentReplacement.get(task.sourceId)!==task.id)continue;const index=baseNodes.findIndex(node=>node.id===task.sourceId);if(index>=0)baseNodes[index]={...baseNodes[index],data:{...baseNodes[index].data,regenerating:!task.failure,regenerationFailure:!!task.failure,generationStage:task.stage,generationStartedAt:task.startedAt,generationCount:task.count,generationCompleted:task.completed}};continue;}
      const pos = taskPositions[task.id] ?? task.position;
      const previewSize = task.previewSize ?? generationPlaceholderSize("1:1");
      baseNodes.push({
          id: task.id,
          type: "art",
          position: pos,
          style: previewSize,
          data: { id: task.id, pending: true, label: task.failure ? generationFailureTitle(task.failure, locale === "en") : task.label, lightCanvas, ...previewSize,
            generationStage: task.stage, generationStartedAt: task.startedAt,
            generationCount: task.count, generationCompleted: task.completed, generationFailure: task.failure, onGenerationRetry: task.onRetry } satisfies CanvasArtNodeData,
          selectable: !!task.failure,
          draggable: true,
        });
      baseEdges.push({
          id: `e-${task.id}`,
          source: task.sourceId,
          sourceHandle: "out",
          target: task.id,
          targetHandle: "in",
          type: "comet",
          data: { lit: !task.failure, dim: false },
          animated: false,
          selectable: false,
        });
    }
    const chain = active
      ? lineageChain(active.members, selectedId)
      : new Set<string>();
    const hasSel = !!selectedId && chain.size > 0;
    const displayNodes: Node[] = baseNodes.map((n) => ({
      ...n,
        data: {
          ...(n.data as Record<string, unknown>),
          inChain: hasSel && chain.has(n.id),
          inspectOriginal: n.id === selectedId && multiSel.length <= 1,
          lightCanvas,
      },
      className:
        hasSel && !chain.has(n.id) && !n.id.startsWith("task-")
          ? "cw-dim"
          : undefined,
    }));
    const displayEdges: Edge[] = baseEdges.map((e) => {
      if (e.target.startsWith("task-")) return e;
      if (!hasSel)
        return {
          ...e,
          type: "comet",
          data: { lit: false, dim: false },
          className: undefined,
          animated: false,
        };
      const lit = chain.has(e.source) && chain.has(e.target);
      return {
        ...e,
        type: "comet",
        data: { lit, dim: !lit },
        className: undefined,
        animated: false,
      };
    });
    // 追加占位/空白节点(及其连线:每个 input 一条)
    for (const p of pendNodes) {
      displayNodes.push({
        id: p.id,
        type: "pend",
        position: { x: p.x, y: p.y },
        // RF 的多选状态由 useNodesState 维护；data.selected 只表示当前编辑中的空白节点。
        data: {
          __id: p.id,
          label: p.label,
          uploading: p.uploading,
          progress: p.progress,
          fileInfo: p.fileInfo,
          generating: p.generating,
          generationFailure: p.generationFailure,
          onGenerationRetry: p.onGenerationRetry,onGenerate:actions.generatePending,
          generationStage: p.generationStage,
          generationStartedAt: p.generationStartedAt,
          generationSize: p.generationSize,
          generationCount: p.generationCount,
          generationKind: p.taskKind === "video" ? "video" : "image",
          needsAttention: p.needsAttention,
          attentionTitle: p.attentionTitle,
          attentionHint: p.attentionHint,
          attentionAction: p.attentionAction,
          attentionHref: p.attentionHref,
          selected: p.id === selectedPendId,
          lightCanvas,
        } satisfies CanvasPendingNodeData,
      } as Node);
      for (const src of p.inputs ?? []) {
        if (!src) continue;
        displayEdges.push({
          id: `e-pend-${src}-${p.id}`,
          selectable: !p.generating && !p.uploading,
          source: src,
          sourceHandle: "out",
          target: p.id,
          targetHandle: "in",
          type: "comet",
          data: { lit: false, dim: false },
        } as Edge);
      }
    }
    for(const character of characterNodes.filter(node=>node.projectKey===activeKey)){
      const appearance=character.character.appearances.find(item=>item.id===character.character.defaultAppearanceId)!,preview=workById.get(appearance.referenceArtworkIds[0])?.image,locked=!!nodeSettings[character.id]?.locked;
      displayNodes.push({id:character.id,type:"character",position:{x:character.x,y:character.y},selected:character.id===selectedId||multiSel.includes(character.id),draggable:!readOnly&&!locked,style:{width:character.width,height:character.height},data:{node:character,title:character.title,content:String(character.revision),width:character.width,height:character.height,preview,selected:character.id===selectedId,english:locale==="en",locked,onEdit:actions.characterEdit}});
      for(const source of appearance.referenceArtworkIds)if(displayNodes.some(node=>node.id===source))displayEdges.push({id:`e-character-reference-${character.id}-${source}`,source,sourceHandle:"out",target:character.id,targetHandle:"in",type:"comet",data:{lit:false,dim:false}});
    }
    for(const audio of audioNodes.filter(node=>node.projectKey===activeKey)){
      const art=workById.get(audio.audio.adopted?.artworkId||""),url=art?.videoUrl||undefined,locked=!!nodeSettings[audio.id]?.locked;
      displayNodes.push({id:audio.id,type:"audio",position:{x:audio.x,y:audio.y},selected:audio.id===selectedId||multiSel.includes(audio.id),draggable:!readOnly&&!locked,style:{width:audio.width,height:audio.height},data:{node:audio,title:audio.title,content:String(audio.revision),width:audio.width,height:audio.height,url,selected:audio.id===selectedId,english:locale==='en',locked,onEdit:actions.audioEdit}} as Node);
      if(audio.audio.sourceArtworkId&&displayNodes.some(node=>node.id===audio.audio.sourceArtworkId))displayEdges.push({id:`e-audio-source-${audio.id}`,source:audio.audio.sourceArtworkId,sourceHandle:"out",target:audio.id,targetHandle:"in",type:"comet",data:{lit:false,dim:false}} as Edge);
    }
    for(const timeline of timelineNodes.filter(node=>node.projectKey===activeKey)){
      const art=workById.get(timeline.adopted?.artworkId||""),locked=!!nodeSettings[timeline.id]?.locked;
      displayNodes.push({id:timeline.id,type:"timeline",position:{x:timeline.x,y:timeline.y},selected:timeline.id===selectedId||multiSel.includes(timeline.id),draggable:!readOnly&&!locked,style:{width:timeline.width,height:timeline.height},data:{node:timeline,title:timeline.title,content:String(timeline.revision),width:timeline.width,height:timeline.height,url:art?.videoUrl,selected:timeline.id===selectedId,english:locale==='en',locked,onEdit:actions.timelineEdit}} as Node);
    }
    for(const scene of sceneNodes.filter(node=>node.projectKey===activeKey)){
      const state=scene.scene.states.find(item=>item.id===scene.scene.defaultStateId)!,preview=workById.get(state.background?.artworkId||state.referenceArtworkIds[0])?.image,locked=!!nodeSettings[scene.id]?.locked;
      displayNodes.push({id:scene.id,type:"scene",position:{x:scene.x,y:scene.y},selected:scene.id===selectedId||multiSel.includes(scene.id),draggable:!readOnly&&!locked,style:{width:scene.width,height:scene.height},data:{node:scene,title:scene.title,content:String(scene.revision),width:scene.width,height:scene.height,preview,selected:scene.id===selectedId,english:locale==="en",locked,onEdit:actions.sceneEdit}});
      for(const source of state.referenceArtworkIds)if(displayNodes.some(node=>node.id===source))displayEdges.push({id:`e-scene-reference-${scene.id}-${source}`,source,sourceHandle:"out",target:scene.id,targetHandle:"in",type:"comet",data:{lit:false,dim:false}});
    }
    for(const director of directorNodes.filter(node=>node.projectKey===activeKey)){
      const preview=director.outputs.filter(output=>output.kind==="image").map(output=>workById.get(output.artworkId)?.image).filter(Boolean).at(-1),locked=!!nodeSettings[director.id]?.locked;
      displayNodes.push({id:director.id,type:"director",position:{x:director.x,y:director.y},selected:director.id===selectedId||multiSel.includes(director.id),draggable:!readOnly&&!locked,style:{width:director.width,height:director.height},
        data:{node:director,title:director.title,content:String(director.revision),width:director.width,height:director.height,preview,selected:director.id===selectedId,english:locale==="en",locked,onEdit:actions.directorEdit}});
      if(!director.project.sceneReference&&director.project.panoramaArtworkId&&displayNodes.some(node=>node.id===director.project.panoramaArtworkId))displayEdges.push({id:`e-director-background-${director.id}`,source:director.project.panoramaArtworkId,sourceHandle:"out",target:director.id,targetHandle:"in",type:"comet",data:{lit:false,dim:false}});
      if(director.project.sceneReference&&displayNodes.some(node=>node.id===director.project.sceneReference!.sceneId))displayEdges.push({id:`e-director-scene-${director.id}-${director.project.sceneReference.sceneId}`,source:director.project.sceneReference.sceneId,sourceHandle:"out",target:director.id,targetHandle:"in",type:"comet",data:{lit:false,dim:false}});
      for(const output of director.outputs)if(displayNodes.some(node=>node.id===output.artworkId))displayEdges.push({id:`e-director-output-${director.id}-${output.artworkId}`,source:director.id,sourceHandle:"out",target:output.artworkId,targetHandle:"in",type:"comet",selectable:false,deletable:false,data:{lit:false,dim:false}});
    }
    for(const videoNode of videoNodes.filter(node=>node.projectKey===activeKey)){
      const task=videoTaskById.get(videoNode.lastTaskId||""),result=workById.get(videoNode.displayResultId||videoNode.lastResultId||""),locked=!!nodeSettings[videoNode.id]?.locked;
      displayNodes.push({id:videoNode.id,type:"videoGeneration",position:{x:videoNode.x,y:videoNode.y},selected:videoNode.id===selectedId,draggable:!readOnly&&!locked,
        style:{width:videoNode.width,height:videoNode.height},data:{node:videoNode,title:videoNode.title,prompt:videoNode.config.prompt,content:String(videoNode.revision),width:videoNode.width,height:videoNode.height,status:task?.status,progress:task?.progress,videoUrl:result?.videoUrl||(!videoNode.displayResultId?task?.videoUrl:undefined),
          task,settings:nodeSettings[videoNode.id]||DEFAULT_CANVAS_SETTINGS,selected:videoNode.id===selectedId,lightCanvas,locked,readOnly,externalDock:true,resultUrl:result?.videoUrl||(!videoNode.displayResultId?task?.videoUrl:undefined),onEdit:actions.videoEdit,onHistory:actions.videoHistory,onGenerate:actions.videoEdit,onCancel:actions.videoCancel,
          onProcess:actions.videoProcess,onPrompt:actions.videoPrompt,onResize:actions.videoResize}} as Node);
      for(const input of videoNode.inputs){const source=parseVisualInputIdentity(input.nodeId)?.id||input.nodeId.replace(/^(?:text|image|video|audio|audio-node|timeline-node):/,"");if(!displayNodes.some(node=>node.id===source)&&!textIds.has(source)&&!videoIds.has(source))continue;
        displayEdges.push({id:`e-video-${input.id}-${videoNode.id}`,source,sourceHandle:"out",target:videoNode.id,targetHandle:"in",type:"comet",data:{lit:false,dim:false}} as Edge);}
    }
    for (const textNode of textNodes.filter((node) => node.projectKey === activeKey)) {
      const expanded = expandedTextIds.has(textNode.id);
      const displayWidth = expanded ? Math.min(760, TEXT_NODE_MAX_W) : textNode.width;
      const displayHeight = expanded
        ? Math.min(
            TEXT_NODE_MAX_H,
            Math.max(420, estimateTextNodeHeight({ ...textNode, width: displayWidth }))
          )
        : textNode.height;
      const sourceRefs = (textNode.sourceIds ?? [])
        .map((id) => memberById.get(id))
        .filter(Boolean) as Artwork[];
      // 产品绑定(帮写节点)也显示为 @引用芯片 + 连线,与 sourceIds 视觉一致
      const productRefs = (textNode.productIds ?? [])
        .filter((id) => !(textNode.sourceIds ?? []).includes(id))
        .map((id) => memberById.get(id))
        .filter(Boolean) as Artwork[];
      displayNodes.push({
        id: textNode.id,
        type: "text",
        position: { x: textNode.canvasX, y: textNode.canvasY },
        data: {
          __id: textNode.id,
          nodeKind: "text",
          title: textNode.title,
          prompt: textNode.prompt,
          content: textNode.content,
          status: textNode.status,busy:input.textBusyIds?.has(textNode.id),
          error: textNode.error,
          sourceRefs: [...sourceRefs, ...productRefs].map((reference) => ({
            id: reference.id,
            title: reference.title,
          })),
          selected: textNode.id === selectedTextId,
          lightCanvas,
          expanded,
          width: displayWidth,
          height: displayHeight,
        } satisfies CanvasTextNodeData,
        // Stored size reserves the initial/manual frame. Actual text layout may
        // grow beyond it, including while streaming and in read-only views.
        style: { width: displayWidth, height: "auto", minHeight: displayHeight },
      } as Node);
      for (const sourceId of Array.from(new Set([...(textNode.sourceIds ?? []), ...(textNode.productIds ?? [])]))) {
        if (!memberIds.has(sourceId) && !projectTextIds.has(sourceId)) continue;
        displayEdges.push({
          id: `e-image-text-${sourceId}-${textNode.id}`,
          source: sourceId,
          sourceHandle: "out",
          target: textNode.id,
          targetHandle: "in",
          type: "comet",
          data: { lit: false, dim: false },
        } as Edge);
      }
      for (const targetId of textNode.targetIds ?? []) {
        if (!memberIds.has(targetId)) continue;
        displayEdges.push({
          id: `e-text-${textNode.id}-${targetId}`,
          source: textNode.id,
          sourceHandle: "out",
          target: targetId,
          targetHandle: "in",
          type: "comet",
          data: { lit: false, dim: false },
        } as Edge);
      }
    }
    // Restored automatic outputs keep their identity and links, while unset positions
    // avoid the generator and existing mixed nodes even after task history is hidden.
    const unpositionedResults = new Map<string, { x: number; y: number; width: number }>();
    for (const videoNode of videoNodes.filter(node => node.projectKey === activeKey)) {
      const task = videoTaskById.get(videoNode.lastTaskId||"");
      for (const id of new Set([videoNode.lastResultId, ...(task?.resultAssets.map(asset => asset.artworkId) || [])])) {
        const art = workById.get(id||"");
        if (id && art && art.canvasX == null && art.canvasY == null) unpositionedResults.set(id, videoNode);
      }
    }
    if (unpositionedResults.size) {
      const sizeOf = (node: Node) => ({ width: Number(node.style?.width) || Number(node.data.width) || 420, height: Number(node.style?.height) || Number(node.data.height) || 320 });
      const occupied = displayNodes.filter(node => !unpositionedResults.has(node.id)).map(node => ({ ...node.position, ...sizeOf(node) }));
      for (let index = 0; index < displayNodes.length; index++) {
        const node = displayNodes[index], source = unpositionedResults.get(node.id);
        if (!source) continue;
        const size = sizeOf(node), position = placeGenerationPreview({ x: source.x + source.width + 96, y: source.y }, size, occupied);
        displayNodes[index] = { ...node, position };
        occupied.push({ ...position, ...size });
      }
    }
    // 防御:节点/边按 id 去重,并丢弃指向不存在节点的悬空边
    for (let index=0;index<displayNodes.length;index++) {
      const node=displayNodes[index];
      if (node.id.startsWith("pend-") || node.id.startsWith("task-")) continue;
      const settings=nodeSettings[node.id] || DEFAULT_CANVAS_SETTINGS;
      displayNodes[index]={...node,zIndex:settings.order,draggable:nodeSettingsReady && !readOnly && !settings.locked,
        data:{...node.data,settings,readOnly:readOnly || !nodeSettingsReady}};
    }
    for (const manifest of workflowManifests.filter(m => m.projectKey === activeKey)) {
      const origins = new Map(manifest.origins.map(o => [o.id, o]));
      const decorations = new Map(manifest.decorations.map(d => [d.id, d]));
      for (let i = 0; i < displayNodes.length; i++) {
        const node = displayNodes[i], origin = origins.get(node.id), decoration = decorations.get(node.id);
        const artwork = memberById.get(node.id);
        if (decoration) displayNodes[i] = { ...node, type: "workflowDecoration", zIndex: -50000 + i, connectable: false,
          data: { ...node.data, image: artwork?.image || decoration.image, intrinsicWidth: artwork?.width, intrinsicHeight: artwork?.height, rotation: decoration.rotation, flipX: decoration.flipX, opacity: decoration.opacity,
            missingAsset: artwork?.source === "workflow-placeholder", onFill: actions.workflowFill } };
        else if (origin) displayNodes[i] = { ...node, data: { ...node.data, workflowPresentation: origin,
          missingAsset: artwork?.source === "workflow-placeholder", onFill: actions.workflowFill } };
      }
      for (const group of manifest.groups) {
        const children = displayNodes.filter(n => group.members.includes(n.id));
        if (!children.length) continue;
        const left = Math.min(...children.map(n => n.position.x)), top = Math.min(...children.map(n => n.position.y));
        const right = Math.max(...children.map(n => n.position.x + Number(n.style?.width || 320))), bottom = Math.max(...children.map(n => n.position.y + Number(n.style?.height || 180)));
        displayNodes.push({ id: group.id, type: "workflowGroup", position: { x: left - 12, y: top - 58 }, style: { width: right - left + 24, height: bottom - top + 70, pointerEvents: "none" },
          draggable: false, selectable: false, connectable: false, focusable: false, zIndex: -60000,
          data: { title: group.title, members:children.map(n=>n.id), onSelect: actions.workflowSelect } });
      }
    }
    // (React Flow 遇到重复 key 或悬空边会抛出 client-side exception → 白屏)
    // Reference identity is source-based, not clip-based. Resolve after every
    // native node is projected so source visibility never depends on loop order.
    for(const timeline of timelineNodes.filter(node=>node.projectKey===activeKey)){
      for(const source of new Set(timeline.timeline.tracks.flatMap(track=>track.clips.map(clip=>clip.canvasSourceId||clip.artworkId))))if(displayNodes.some(node=>node.id===source))displayEdges.push({id:`e-timeline-input-${timeline.id}-${source}`,source,sourceHandle:"out",target:timeline.id,targetHandle:"in",type:"comet",data:{lit:false,dim:false}} as Edge);
    }
    const nSeen = new Set<string>();
    const finalNodes = displayNodes.map(node => node.type === "art" && !node.data.videoUrl && !node.data.pending ? {
      ...node, data: { ...node.data, onCutout: actions.cutout,
        cutoutBusy: busyArtworkIds.has(node.id),
        cutoutBlocked: !cutoutAvailable || operations.has(`node:${node.id}`) }
    } : node).filter((n) =>
      nSeen.has(n.id) ? false : (nSeen.add(n.id), true)
    );
    const nIds = nSeen;
    const eSeen = new Set<string>();
    const finalEdges = displayEdges.filter((e) =>
      !e.id ||
      eSeen.has(e.id) ||
      !e.source ||
      !e.target ||
      !nIds.has(e.source) ||
      !nIds.has(e.target)
        ? false
        : (eSeen.add(e.id), true)
    );
    return { displayNodes: finalNodes, displayEdges: finalEdges };
}
