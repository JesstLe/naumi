import type {Artwork} from "../mock-data";
import {readBrowserImage} from "../browser-image-cache";
import {compileReferenceInstructions} from "../imagegen/reference-labels";
import {imageReferenceManifest,type CanvasImageReference} from "./image-references";
import {appendCanvasImageReferences} from "./image-task-request";
import {normalizeCanvasRatio} from "./generation-parameters";
import type {CanvasImageTaskScope} from "./image-task-scope";

export const DETAIL_MODULE_ORDER=["hero","selling","scene","angles","ingredients","usage","specs","assurance"] as const;
export type CanvasDetailRequest={source:Artwork;references:Artwork[];uploads:File[];referenceInputs?:CanvasImageReference[];
  feedback:string;model:string;ratio:string;count:number;maxReferences:number;missingReferences:string};

/** Detail preparation preserves reference order, file bytes and lineage. Model,
 * billing and frame choice remain in the existing submission adapter. */
export async function prepareCanvasDetailTask(input:CanvasDetailRequest,scope:CanvasImageTaskScope){
  scope.assertCurrent();const form=new FormData(),arts=input.references.slice(0,Math.max(0,input.maxReferences-input.uploads.length));
  if(input.referenceInputs)await appendCanvasImageReferences(form,input.referenceInputs,scope.assertCurrent);
  else{
    for(const [index,artwork] of arts.entries()){
      const blob=await readBrowserImage(artwork.image);scope.assertCurrent();
      form.append("image",new File([blob],`detail-ref-${index+1}.png`,{type:blob.type||"image/png"}));
    }
    input.uploads.slice(0,input.maxReferences-arts.length).forEach(file=>form.append("image",file));
  }
  if(!form.getAll("image").length)throw new Error(input.missingReferences);
  form.append("prepared","1");if(input.model)form.append("model",input.model);
  form.append("text",input.referenceInputs?compileReferenceInstructions(input.feedback,imageReferenceManifest(input.referenceInputs)):input.feedback);
  form.delete("canvasReferences");form.append("platform","taobao");form.append("lang","zh");form.append("format",normalizeCanvasRatio(input.ratio));
  DETAIL_MODULE_ORDER.slice(0,input.count).forEach(module=>form.append("module",module));
  form.append("email",scope.owner);form.append("origin","canvas");
  const lineage=arts.length?arts:[input.source];form.append("parentId",lineage[0].id);form.append("parentIds",JSON.stringify(lineage.slice(1).map(art=>art.id)));
  scope.assertCurrent();return form;
}
