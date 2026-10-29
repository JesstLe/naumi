import type {Artwork} from '../mock-data';
import type {RetainedBillingSubmission} from '../billing/client-submission';
import type {createCanvasResultAttachment} from './result-attachment';
import type {captureCanvasTaskOwner,CanvasImageTaskScope} from './image-task-scope';
import type {createCanvasGenerationPresentation} from './generation-presentation';
import type {createCanvasPendingPresentation} from './pending-presentation';
import type {CanvasPoint} from './stable-placement';

type Attachment=Parameters<typeof createCanvasResultAttachment>[0];
type Size={width:number;height:number};
/** The Canvas composition boundary supplies its existing view, document and
 * request ports. These are not new stores, execution policies or DI services. */
export type CanvasGenerationRunContext={
  owner:ReturnType<typeof captureCanvasTaskOwner>;
  generation:ReturnType<ReturnType<typeof createCanvasGenerationPresentation>['bind']>;
  pending:ReturnType<ReturnType<typeof createCanvasPendingPresentation>['bind']>;
  geometry:{
    source:(art:Artwork)=>{point:CanvasPoint;size:Size;inScene:boolean};
    occupied:()=>Array<CanvasPoint&Size>;
    position:(id:string,fallback:CanvasPoint)=>CanvasPoint;
    artworkSize:(art:Artwork)=>Size;gap:number;
  };
  document:Pick<Attachment,'merge'|'history'>;
  submit:(url:string,init:RequestInit,scope:CanvasImageTaskScope,submission:RetainedBillingSubmission)=>Promise<Response>;
  user:(value:unknown)=>void;
  notice:(message:string)=>void;
};
