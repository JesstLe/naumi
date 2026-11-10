import {canvasWorkflowSchema} from "../video/canvas-workflow";
import type {CanvasAgentContext} from "./canvas-context";

/** Billing and execution must bind the same explicit editorial context. */
export function agentVideoWorkflowIntent(args:Record<string,any>,canvas?:CanvasAgentContext){
  const projectKey=canvas?.video?.projectKey||args.project_key;
  if(!projectKey||canvas?.video?.projectKey&&args.project_key&&args.project_key!==canvas.video.projectKey)throw new Error("请选择当前项目的实际镜头");
  return canvasWorkflowSchema.parse({id:args.operation_id,projectKey,nodes:args.nodes,
    ...(args.storyboard?{storyboard:args.storyboard}:{}),...(args.assembly?{assembly:args.assembly}:{})});
}
