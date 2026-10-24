"use client";
import {ArtNode} from "./artwork-node";
import {TextCanvasNode} from "./text-node";
import {PendNode} from "./pending-node";
import {CometEdge} from "./comet-edge";
import {VideoGenerationNode} from "../video/generation-node";
import {WorkflowDecorationNode,WorkflowGroupNode} from "../workflow-import-nodes";
/** Stable registry; adding a renderer does not modify the Canvas orchestrator. */
export const canvasNodeTypes={art:ArtNode,pend:PendNode,text:TextCanvasNode,videoGeneration:VideoGenerationNode,workflowDecoration:WorkflowDecorationNode,workflowGroup:WorkflowGroupNode};
export const canvasEdgeTypes={comet:CometEdge};
