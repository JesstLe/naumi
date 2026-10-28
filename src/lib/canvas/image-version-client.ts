import {canvasDocumentFetch,type CanvasDocumentScope} from "./document-scope";
import type {CanvasImageVersionList} from "./image-versions";

/** Version reads use the same actor/workspace/project epoch as history writes. */
export async function loadCanvasImageVersions(scope:CanvasDocumentScope,nodeId:string):Promise<CanvasImageVersionList>{
  scope.assertView();
  const response=await canvasDocumentFetch(scope,`/api/canvas/image-versions?nodeId=${encodeURIComponent(nodeId)}`,{cache:"no-store"},true);
  const body=await response.json();scope.assertView();
  if(!response.ok)throw new Error(body.error||"历史版本读取失败");
  return body as CanvasImageVersionList;
}
