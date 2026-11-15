import {z} from 'zod';
import {videoNodeConfigSchema} from '../canvas/video-node-schema';
import {orderedInputSchema} from './references';

const contentSchema=z.strictObject({title:z.string().max(200),config:videoNodeConfigSchema,inputs:z.array(orderedInputSchema).max(256)});
const draftSchema=contentSchema.extend({revision:z.number().int().nonnegative(),baseline:z.string()});
export type VideoComposerDraft=z.infer<typeof draftSchema>;
type DraftStorage=Pick<Storage,'getItem'|'setItem'>;
export const VIDEO_COMPOSER_DRAFT_STORAGE='naumi:video-composer-drafts:v1';
export const videoComposerContent=(draft:Pick<VideoComposerDraft,'title'|'config'|'inputs'>)=>JSON.stringify({title:draft.title,config:draft.config,inputs:draft.inputs});
export function videoComposerDraftKey(scope:string|undefined,email:string|undefined,project:string,node:string){
  return scope&&email?JSON.stringify([email.toLowerCase(),scope,project,node]):null;
}
/** A tab-local recovery journal, not node persistence or an execution receipt.
 * Keep the original baseline/revision so another editor's update still conflicts.
 * No network, task identity, quote or execution plan belongs in this store. */
export class VideoComposerDraftStore{
  private drafts=new Map<string,VideoComposerDraft>();
  private loaded=false;
  constructor(private storage:()=>DraftStorage|null=()=>null){}
  private load(){
    if(this.loaded)return;
    try{
      const storage=this.storage();if(!storage)return;this.loaded=true;
      const raw=JSON.parse(storage.getItem(VIDEO_COMPOSER_DRAFT_STORAGE)||'null');
      if(raw?.version!==1||!Array.isArray(raw.entries))return;
      for(const entry of raw.entries.slice(-64)){
        if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string')continue;
        const parsed=draftSchema.safeParse(entry[1]);if(!parsed.success)continue;
        let baseline;try{baseline=contentSchema.safeParse(JSON.parse(parsed.data.baseline));}catch{continue;}if(!baseline.success)continue;
        this.drafts.set(entry[0],parsed.data);
      }
    }catch{/* Corrupt or denied session storage never blocks editing. */}
  }
  read(key:string|null){this.load();const value=key?this.drafts.get(key):undefined;return value?structuredClone(value):undefined;}
  write(key:string|null,value:VideoComposerDraft){
    if(!key)return;this.load();this.drafts.delete(key);
    if(videoComposerContent(value)!==value.baseline)this.drafts.set(key,structuredClone(value));
    while(this.drafts.size>64)this.drafts.delete(this.drafts.keys().next().value!);
    try{this.storage()?.setItem(VIDEO_COMPOSER_DRAFT_STORAGE,JSON.stringify({version:1,entries:[...this.drafts]}));}catch{/* Preserve the full in-memory draft if browser storage is full/denied. */}
  }
}
export const videoComposerDrafts=new VideoComposerDraftStore(()=>typeof window==='undefined'?null:window.sessionStorage);
