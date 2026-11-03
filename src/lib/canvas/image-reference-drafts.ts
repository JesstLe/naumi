export type UploadedImageReference = {key:string;file:File;url:string};
type PreviewUrls={createObjectURL:(file:File)=>string;revokeObjectURL:(url:string)=>void};
const EMPTY:readonly UploadedImageReference[]=Object.freeze([]);

/** Files are tab-memory drafts, never JSON/sessionStorage or business records.
 * A hidden composer keeps its node's files; explicit removal and owner teardown
 * release previews. The caller supplies the complete owner/workspace/node key. */
export class ImageReferenceDraftStore {
  private drafts=new Map<string,readonly UploadedImageReference[]>();
  constructor(private urls:PreviewUrls=URL){}
  read(key:string|null){return key?this.drafts.get(key)||EMPTY:EMPTY;}
  add(key:string|null,files:readonly {key:string;file:File}[]){
    if(!key||!files.length)return;
    const added:UploadedImageReference[]=[];
    try{for(const file of files)added.push({...file,url:this.urls.createObjectURL(file.file)});}
    catch(error){for(const file of added)this.urls.revokeObjectURL(file.url);throw error;}
    this.drafts.set(key,[...this.read(key),...added]);
  }
  remove(key:string|null,id:string){
    if(!key)return;const old=this.read(key),removed=old.filter(file=>file.key===id);
    if(!removed.length)return;
    const next=old.filter(file=>file.key!==id);if(next.length)this.drafts.set(key,next);else this.drafts.delete(key);
    for(const file of removed)this.urls.revokeObjectURL(file.url);
  }
  /** Fork the draft, not its preview ownership. Each node revokes only its own
   * URLs; stable reference keys retain roles and prompt mentions. */
  copy(source:string|null,target:string|null){
    if(!source||!target||source===target||this.drafts.has(target))return;
    this.add(target,this.read(source).map(({key,file})=>({key,file})));
  }
  clear(){for(const files of this.drafts.values())for(const file of files)this.urls.revokeObjectURL(file.url);this.drafts.clear();}
}
