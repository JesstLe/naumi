"use client";
import {ComfyCanvasNode} from "../comfy/comfy-node";
import {TimelineCanvasNode} from "../timeline/timeline-node";
import {AudioCanvasNode} from "../audio/audio-node";
import {SceneCanvasNode} from "../scene/scene-node";
import {CharacterCanvasNode} from "../character/character-node";
import {DirectorCanvasNode} from "../director/director-node";
import {ArtNode} from "./artwork-node";
import {TextCanvasNode} from "./text-node";
import {PendNode} from "./pending-node";
import {CometEdge} from "./comet-edge";
import {VideoGenerationNode} from "../video/generation-node";
import {WorkflowDecorationNode,WorkflowGroupNode} from "../workflow-import-nodes";
/** Stable registry; adding a renderer does not modify the Canvas orchestrator. */
export const canvasNodeTypes={comfy:ComfyCanvasNode,art:ArtNode,pend:PendNode,text:TextCanvasNode,videoGeneration:VideoGenerationNode,director:DirectorCanvasNode,character:CharacterCanvasNode,scene:SceneCanvasNode,audio:AudioCanvasNode,timeline:TimelineCanvasNode,workflowDecoration:WorkflowDecorationNode,workflowGroup:WorkflowGroupNode};
export const canvasEdgeTypes={comet:CometEdge};
