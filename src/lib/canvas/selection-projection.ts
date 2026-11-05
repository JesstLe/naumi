import type {Artwork} from "../mock-data";
import {canvasTextContent} from "./text-content";
import type {CanvasTextNode} from "./text-document-model";
import type {CanvasPendingNode} from "./scene-types";
import type {CanvasVideoNode} from "./video-node-schema";
import type {CanvasDirectorNode} from "./director-node-schema";
import type {CanvasCharacterNode} from "./character-node-schema";
import type {CanvasSceneNode} from "./scene-node-schema";
import type {CanvasAudioNode} from "./audio-node-schema";
import type {CanvasTimelineNode} from "./timeline-node-schema";
import type {CanvasSelection} from "./selection";
import {artworkNodeSize} from "./node-geometry";

type ProjectNode={id:string;projectKey:string;deletedAt?:string|null};
export type CanvasSelectionNodes={project:string|null;artworks:readonly Artwork[];text:readonly CanvasTextNode[];pending:readonly CanvasPendingNode[];video:readonly CanvasVideoNode[];director:readonly CanvasDirectorNode[];character:readonly CanvasCharacterNode[];scene:readonly CanvasSceneNode[];audio:readonly CanvasAudioNode[];timeline:readonly CanvasTimelineNode[]};

/** Pure view projection; no selection/document/task state or identity cache. */
const find=<T extends {id:string}>(nodes:readonly T[],id:string|null|undefined)=>nodes.find(node=>node.id===id)??null;
const inProject=<T extends ProjectNode>(nodes:readonly T[],id:string|null|undefined,project:string|null,activeOnly=false)=>nodes.find(node=>node.id===id&&node.projectKey===project&&(!activeOnly||!node.deletedAt))??null;
function nativeTargets(nodes:CanvasSelectionNodes,id:string|null|undefined,activeVideo:boolean){
  return {
    video:inProject(nodes.video,id,nodes.project,activeVideo),director:inProject(nodes.director,id,nodes.project),
    character:inProject(nodes.character,id,nodes.project),scene:inProject(nodes.scene,id,nodes.project),
    audio:inProject(nodes.audio,id,nodes.project),timeline:inProject(nodes.timeline,id,nodes.project),
  };
}

/** Focused text is already bound by the selection/document owner. Preserve its
 * original ID lookup; only focused video adds the original deleted-row filter. */
export function canvasSelectionTargets(nodes:CanvasSelectionNodes,selection:Pick<CanvasSelection,"selectedId"|"selectedTextId"|"selectedPendId">){
  return {...nativeTargets(nodes,selection.selectedId,true),artwork:find(nodes.artworks,selection.selectedId),
    text:find(nodes.text,selection.selectedTextId),pending:find(nodes.pending,selection.selectedPendId)};
}

/** A context menu addresses one explicit ID, not necessarily the focus. Its
 * original project checks and video visibility are deliberately unchanged. */
export function canvasContextTargets(nodes:CanvasSelectionNodes,id:string|undefined){
  return {...nativeTargets(nodes,id,false),artwork:find(nodes.artworks,id),text:inProject(nodes.text,id,nodes.project),pending:find(nodes.pending,id)};
}

export function canvasSelectionProperties(nodes:ReturnType<typeof canvasSelectionTargets>){
  const {text,artwork,video,director,character,scene,audio,timeline}=nodes;
  const target=text||artwork||video||director||character||scene||audio||timeline;
  if(!target)return null;
  const sized=text||video||director||character||scene||timeline||audio;
  return {id:target.id,title:target.title,kind:text?"text" as const:"image" as const,
    content:text?canvasTextContent(text):undefined,
    displaySize:sized?{width:sized.width,height:sized.height}:artworkNodeSize(artwork!),
    imageEditable:!video&&!director&&!character&&!scene&&!audio&&!timeline&&!artwork?.videoUrl,
    imageSize:artwork?.width&&artwork?.height?{width:artwork.width,height:artwork.height}:undefined};
}
