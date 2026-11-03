import type {Artwork} from "../mock-data";
import {canvasArtworkProjectKey} from "./project-catalog";
import {imageDraftKey,imageDraftScope,type ImageNodeDraftPatch} from "./image-node-drafts";

type DraftPort={read:(node:string,scope:string|null)=>ImageNodeDraftPatch;seed:(node:string,patch:ImageNodeDraftPatch,scope:string|null)=>void};
/** Move only the current editable draft after a blank node becomes real media.
 * Frozen request parameters and accepted-task ownership remain in image-runs.
 * The catalog owns the result's project identity; completion must not guess it.
 */
export function carryCompletedCanvasImageDraft(input:{owner:string;target?:string|null;project:string|null;workspace:string;pendingId:string;prompt:string;ratio:string;resultId?:string;artworks:Artwork[];currentArtworks:Artwork[]},ports:{draft:DraftPort;references:{copyTo:(target:string|null,source:string|null)=>void}}){
  const id=input.resultId;if(!id)return;
  const artwork=input.artworks.find(art=>art.id===id);if(!artwork)return;
  const original=imageDraftScope(input.owner,input.target,input.project,input.workspace);
  const project=input.project||canvasArtworkProjectKey(artwork,new Map([...input.currentArtworks,...input.artworks].map(art=>[art.id,art])));
  const destination=imageDraftScope(input.owner,input.target,project,input.workspace);
  ports.draft.seed(id,{prompt:input.prompt,ratio:input.ratio,...ports.draft.read(input.pendingId,original),...ports.draft.read(id,destination)},destination);
  ports.references.copyTo(imageDraftKey(destination,id),imageDraftKey(original,input.pendingId));
  return id;
}
