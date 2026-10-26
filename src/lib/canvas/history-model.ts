import {artworkFields,type CanvasArtworkFields,type CanvasArtworkReceipt} from "./artwork-write";
import type { Artwork } from "../mock-data";
import type { CanvasVideoNode } from "./video-node-schema";
import type { CanvasNodeSettings } from "./node-settings";
import type { CanvasHistoryOperation } from "./history-contract";
import { changeCanvasParent } from "./parent-link";

import type { CanvasTextNode } from "./text-document-model";
export type { CanvasTextNode } from "./text-document-model";

export type TextPatchFields = Pick<
  CanvasTextNode,
  "title" | "content" | "sourceIds" | "targetIds" | "productIds" | "width" | "height"
> & { productIds: string[] };
export const textPatchOf = (node: CanvasTextNode): TextPatchFields => ({
  title: node.title,
  content: node.content,
  sourceIds: [...(node.sourceIds ?? [])],
  targetIds: [...(node.targetIds ?? [])],
  productIds: [...(node.productIds ?? [])],
  width: node.width,
  height: node.height,
});
export type VideoPatchFields=Partial<Pick<CanvasVideoNode,"title"|"config"|"inputs"|"x"|"y"|"width"|"height">>;
export type CanvasHistoryAction = (
  | {kind:"art-dimensions";id:string;from:{width:number;height:number};to:{width:number;height:number}}
  | {kind:"video-patch";id:string;from:VideoPatchFields;to:VideoPatchFields}
  | {kind:"video-result";id:string;from:string|null;to:string|null}
  | {kind:"video-add";records:CanvasVideoNode[]}

  | { kind: "pending-link"; id: string; from: { inputs: string[]; parentId: string | null; linked: boolean }; to: { inputs: string[]; parentId: string | null; linked: boolean } }
  | { kind: "workflow-add"; artworks: Artwork[]; textNodes: CanvasTextNode[] }
  | {kind:"mixed-add";artworks:Artwork[];textNodes:CanvasTextNode[];videoNodes:CanvasVideoNode[];projectKey:string}
  | { kind: "workflow-fill"; id: string; assetOperationId: string; from: Artwork; to: Artwork }
  | { kind: "node-settings"; id: string; text: boolean; video?:boolean; from: CanvasNodeSettings; to: CanvasNodeSettings }
  | { kind: "move"; id: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | {
      kind: "move-many";
      moves: Array<{
        id: string;
        from: { x: number; y: number };
        to: { x: number; y: number };
      }>;
    }
  | {
      kind: "canvas-group";
      changes: Array<{
        id: string;
        from: string | null;
        to: string | null;
      }>;
    }
  | { kind: "delete"; records: Artwork[] }
  | {
      kind: "mixed-delete";
      artworks: Artwork[];
      textNodes: CanvasTextNode[];
      videoNodes?:CanvasVideoNode[];
    }
  | { kind: "add"; records: Artwork[] }
  | { kind: "text-delete"; records: CanvasTextNode[] }
  | { kind: "text-add"; records: CanvasTextNode[] }
  | { kind: "text-move"; id: string; from: { x: number; y: number }; to: { x: number; y: number } }
  // 血缘连线增删(undo/redo 应用反向)
  | { kind: "parent"; targetId: string; parentId: string; added: boolean }
  // 文字节点字段级快照(内容/引用/产品绑定/尺寸):undo 应用 from,redo 应用 to
  | { kind: "text-patch"; id: string; from: TextPatchFields; to: TextPatchFields }
  | { kind: "text-patch-many"; changes: Array<{id:string;from:TextPatchFields;to:TextPatchFields}> }
  // 节点重命名
  | { kind: "rename"; id: string; from: string; to: string }
  // 图片节点画布尺寸/位置(NodeResizer 手动拖拽)
  | {
      kind: "art-size";
      id: string;
      from: { x: number; y: number; width: number; height: number };
      to: { x: number; y: number; width: number; height: number };
    }
  // 标记/取消标记(逐 id 记录原值,批量操作共用)
  | { kind: "mark"; changes: Array<{ id: string; from: boolean; to: boolean }> }) & {artworkBases?:Record<string,Partial<CanvasArtworkFields>>};

export function canvasHistoryScope(account: string, workspace: string, project: string | null) {
  return JSON.stringify([account, workspace, project || "workspace"]);
}

/** First insertion creates its project; the originating callback owns late work. */
export function canvasHistoryProject(action: CanvasHistoryAction) {
  return action.kind === "mixed-add" ? action.projectKey
    : action.kind === "video-add" || action.kind === "text-add" ? action.records[0]?.projectKey
    : action.kind === "workflow-add" ? action.textNodes[0]?.projectKey || (action.artworks[0] ? `tree:${action.artworks[0].groupId || action.artworks[0].id}` : null)
    : action.kind === "add" && action.records[0] ? `tree:${action.records[0].groupId || action.records[0].parentId || action.records[0].id}` : null;
}

/** Pure command compiler. Revisions are read after pending writes drain, once per
 * attempt. Retries use the controller's frozen body, not a fresh revision. */
export function compileCanvasHistory(action: CanvasHistoryAction, undo: boolean,
  video: (id: string) => CanvasVideoNode | undefined, initialRevision?: number): CanvasHistoryOperation[] {
  const side = undo ? "from" : "to", operations: CanvasHistoryOperation[] = [];
  const getVideo = (id: string) => { const node = video(id); if (!node) throw new Error("视频节点不存在，请刷新画布"); return node; };
  const videoPatch = (id: string, fields: VideoPatchFields) => operations.push({type:"video-patch",id,expectedRevision:getVideo(id).revision,fields});
  const position = (id: string, point: {x:number;y:number}, text = id.startsWith("text-"),expected?:{x:number;y:number}) => {
    if (video(id)) videoPatch(id,point); else operations.push({type:"position",id,text,...point,...(text&&expected?{expected}:!text&&expected?{expectedArtwork:{canvasX:expected.x,canvasY:expected.y,...(!undo?action.artworkBases?.[id]:{})}}:{})});
  };
  const expected=(id:string,base:Partial<CanvasArtworkFields>)=>({...base,...(!undo?action.artworkBases?.[id]:{})});
  const visibility = (records: Artwork[], visible: boolean) => records.forEach(record => operations.push({type:"visibility",id:record.id,visible,expectedArtwork:visible?{visible:false}:artworkFields(record,true)}));
  const texts = (records: CanvasTextNode[], visible: boolean) => records.forEach(node => operations.push(visible
    ? {type:"text-restore",node:{...node,productIds:node.productIds || []},expectMissing:true} : {type:"text-delete",id:node.id,expected:{...node,productIds:node.productIds||[]}}));
  const videos = (records: CanvasVideoNode[], visible: boolean) => records.forEach(node => operations.push({type:"video-visibility",id:node.id,visible}));
  switch (action.kind) {
    case "pending-link": break;
    case "video-patch": videoPatch(action.id,action[side]); break;
    case "video-result": operations.push({type:"video-result",id:action.id,expectedRevision:initialRevision ?? getVideo(action.id).revision,expectedArtworkId:action[undo?"to":"from"],artworkId:action[side]}); break;
    case "video-add": videos(action.records,!undo); break;
    case "move": case "text-move": position(action.id,action[side],action.kind === "text-move",action[undo?"to":"from"]); break;
    case "move-many": action.moves.forEach(move => position(move.id,move[side],undefined,move[undo?"to":"from"])); break;
    case "canvas-group": action.changes.forEach(change => operations.push({type:"group",id:change.id,value:change[side],expectedArtwork:expected(change.id,{canvasGroupId:change[undo?"to":"from"]})})); break;
    case "mixed-delete": case "workflow-add": case "mixed-add": {
      const visible = action.kind === "mixed-delete" ? undo : !undo;
      visibility(action.artworks,visible); texts(action.textNodes,visible);
      if (action.kind !== "workflow-add") videos(action.videoNodes || [],visible); break;
    }
    case "delete": case "add": visibility(action.records,action.kind === "delete" ? undo : !undo); break;
    case "text-delete": case "text-add": texts(action.records,action.kind === "text-delete" ? undo : !undo); break;
    case "parent": operations.push({type:"parent",id:action.targetId,parentId:action.parentId,add:undo?!action.added:action.added}); break;
    case "text-patch": operations.push({type:"text-patch",id:action.id,fields:action[side],expected:action[undo?"to":"from"]}); break;
    case "text-patch-many": action.changes.forEach(change=>operations.push({type:"text-patch",id:change.id,fields:change[side],expected:change[undo?"to":"from"]})); break;
    case "art-dimensions": operations.push({type:"art-dimensions",id:action.id,...action[side],expectedArtwork:expected(action.id,{canvasWidth:action[undo?"to":"from"].width,canvasHeight:action[undo?"to":"from"].height})});break;
    case "rename": operations.push({type:"rename",id:action.id,title:action[side],expectedArtwork:expected(action.id,{title:action[undo?"to":"from"]})}); break;
    case "art-size": operations.push({type:"size",id:action.id,...action[side],expectedArtwork:expected(action.id,{canvasX:action[undo?"to":"from"].x,canvasY:action[undo?"to":"from"].y,canvasWidth:action[undo?"to":"from"].width,canvasHeight:action[undo?"to":"from"].height})}); break;
    case "mark": action.changes.forEach(change => operations.push({type:"mark",id:change.id,marked:change[side],expectedArtwork:expected(change.id,{marked:change[undo?"to":"from"]})})); break;
    case "node-settings": operations.push({type:"node-settings",id:action.id,text:action.text,video:action.video,settings:action[side]}); break;
    case "workflow-fill": operations.push({type:"workflow-asset",id:action.id,assetOperationId:action.assetOperationId,filled:!undo}); break;
    default: { const exhaustive: never = action; throw new Error(`Unknown canvas history action: ${exhaustive}`); }
  }
  return operations;
}

/** Local document projection of a committed request; no fetch, React or routing. */
export function reduceHistoryArtworks(current: Artwork[] | null, operations: CanvasHistoryOperation[], action: CanvasHistoryAction, undo: boolean) {
  let next = current;
  for (const op of operations) {
    if (op.type === "visibility") {
      const records = action.kind === "mixed-delete" || action.kind === "workflow-add" || action.kind === "mixed-add" ? action.artworks
        : action.kind === "delete" || action.kind === "add" ? action.records : [];
      const record = records.find(record => record.id === op.id);
      next = op.visible && record ? [...(next || []).filter(node => node.id !== op.id),record]
        : !op.visible ? next?.filter(node => node.id !== op.id) ?? next : next;
    } else if (op.type === "workflow-asset" && action.kind === "workflow-fill") {
      next = next?.map(node => node.id === op.id ? action[undo?"from":"to"] : node) ?? next;
    } else if ("id" in op) next = next?.map(node => {
      if (node.id !== op.id) return node;
      switch (op.type) {
        case "position": return op.text ? node : {...node,canvasX:op.x,canvasY:op.y};
        case "group": return {...node,canvasGroupId:op.value};
        case "rename": return {...node,title:op.title};
        case "size": return {...node,canvasX:op.x,canvasY:op.y,canvasWidth:op.width,canvasHeight:op.height};
        case "art-dimensions": return {...node,canvasWidth:op.width,canvasHeight:op.height};
        case "mark": return {...node,marked:op.marked};
        case "parent": return {...node,...changeCanvasParent(node,op.parentId,op.add)};
        default: return node;
      }
    }) ?? next;
  }
  return next;
}

export function reduceHistoryTexts(current: CanvasTextNode[], operations: CanvasHistoryOperation[]) {
  return operations.reduce((nodes,op) => {
    if (op.type === "text-restore") return [...nodes.filter(node => node.id !== op.node.id),op.node as CanvasTextNode];
    if (op.type === "text-delete") return nodes.filter(node => node.id !== op.id);
    if (op.type === "text-patch") return nodes.map(node => node.id === op.id ? {...node,...Object.fromEntries(Object.entries(op.fields).filter(([key,value])=>!op.expected||JSON.stringify(value)!==JSON.stringify(op.expected[key as keyof typeof op.expected])))} : node);
    if (op.type === "position" && op.text) return nodes.map(node => node.id === op.id ? {...node,canvasX:op.x,canvasY:op.y} : node);
    return nodes;
  }, current);
}

export function reduceHistorySettings(current: Record<string,CanvasNodeSettings>, operations: CanvasHistoryOperation[]) {
  return operations.reduce((settings,op) => op.type === "node-settings" ? {...settings,[op.id]:op.settings} : settings,current);
}

/** Explicit keep-local rebases only metadata from the original rejected action.
 * No automatic retries against an updated same-field baseline. */
export function rebaseCanvasArtworkAction(action:CanvasHistoryAction,receipt:CanvasArtworkReceipt,undo=false):CanvasHistoryAction{
 if(undo){
  if("from" in action&&"to" in action)action={...action,from:action.to,to:action.from} as CanvasHistoryAction;
  else if(action.kind==="move-many")action={...action,moves:action.moves.map(m=>({...m,from:m.to,to:m.from}))};
  else if(action.kind==="mark"||action.kind==="canvas-group")action={...action,changes:action.changes.map(m=>({...m,from:m.to,to:m.from}))} as CanvasHistoryAction;
  else if(action.kind==="delete"||action.kind==="add")action={...action,kind:action.kind==="delete"?"add":"delete"};
  else if(action.kind==="mixed-delete"||action.kind==="mixed-add")action={...action,kind:action.kind==="mixed-delete"?"mixed-add":"mixed-delete",projectKey:"projectKey" in action?action.projectKey:`tree:${receipt.node.groupId||receipt.node.id}`} as CanvasHistoryAction;
  else if(action.kind==="workflow-add")action={kind:"mixed-delete",artworks:action.artworks,textNodes:action.textNodes};
 }
 const node=receipt.node,id=node.id,fields=artworkFields(node,receipt.visible);
 const next={...action,artworkBases:{...action.artworkBases,[id]:fields}} as CanvasHistoryAction;
 if(next.kind==="rename"&&next.id===id)next.from=node.title;
 if(next.kind==="move"&&next.id===id){next.to={x:next.to.x===next.from.x?node.canvasX??next.to.x:next.to.x,y:next.to.y===next.from.y?node.canvasY??next.to.y:next.to.y};next.from={x:node.canvasX??next.from.x,y:node.canvasY??next.from.y};}
 if(next.kind==="move-many")next.moves=next.moves.map(move=>move.id===id?{...move,to:{x:move.to.x===move.from.x?node.canvasX??move.to.x:move.to.x,y:move.to.y===move.from.y?node.canvasY??move.to.y:move.to.y},from:{x:node.canvasX??move.from.x,y:node.canvasY??move.from.y}}:move);
 if(next.kind==="art-size"&&next.id===id){const current={x:node.canvasX??next.from.x,y:node.canvasY??next.from.y,width:node.canvasWidth??next.from.width,height:node.canvasHeight??next.from.height};next.to=Object.fromEntries(Object.entries(next.to).map(([k,v])=>[k,v===next.from[k as keyof typeof next.from]?current[k as keyof typeof current]:v])) as typeof next.to;next.from=current;}
 if(next.kind==="mark")next.changes=next.changes.map(change=>change.id===id?{...change,from:!!node.marked}:change);
 if(next.kind==="art-dimensions"&&next.id===id)next.from={width:node.canvasWidth??next.from.width,height:node.canvasHeight??next.from.height};
 if(next.kind==="delete"||next.kind==="add")next.records=next.records.map(n=>n.id===id?node:n);
 if(next.kind==="mixed-delete"||next.kind==="mixed-add"||next.kind==="workflow-add")next.artworks=next.artworks.map(n=>n.id===id?node:n);
 if(next.kind==="canvas-group")next.changes=next.changes.map(change=>change.id===id?{...change,from:node.canvasGroupId??null}:change);
 return next;
}
