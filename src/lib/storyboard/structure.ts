import {z} from "zod";
import {videoProjectKeySchema} from "../canvas/project-key";
import {planTimeline,type TimelineProject,type TimelineClip} from "../timeline/project";
import type {TimelineMaterial} from "../canvas/timeline-node-schema";
import type {StoryboardDocument} from "./plan";
import type {RoughcutLink} from "./production";

const id=z.string().min(1).max(180),unique=z.array(id).max(1000).refine(values=>new Set(values).size===values.length,"选择身份重复");
export const structurePreviewSchema=z.strictObject({projectKey:videoProjectKeySchema,planId:z.uuid(),revision:z.number().int().positive(),timelineId:z.string().min(1).max(80),timelineRevision:z.number().int().positive(),positionPolicy:z.enum(["preserve","ripple"]),changeIds:unique,followClipIds:unique,followDialogueIds:unique}).superRefine((input,ctx)=>{if(input.positionPolicy==="preserve"&&(input.followClipIds.length||input.followDialogueIds.length))ctx.addIssue({code:"custom",message:"绝对位置模式不跟随移动"});});
export const structureApplySchema=structurePreviewSchema.safeExtend({operationId:z.uuid(),previewDigest:z.string().regex(/^[a-f0-9]{64}$/)});
export const structureRestoreSchema=z.strictObject({projectKey:videoProjectKeySchema,planId:z.uuid(),timelineId:z.string().min(1).max(80),timelineRevision:z.number().int().positive(),operationId:z.uuid(),sourceOperationId:z.uuid()});
export type StructureSelection=Pick<z.infer<typeof structurePreviewSchema>,"positionPolicy"|"changeIds"|"followClipIds"|"followDialogueIds">;
export type StructureDifference={id:string;kind:"insert"|"remove"|"move";nodeId:string;number:string;clipId:string;from:number|null;to:number|null;duration:number;selected:boolean};
export type StructureConflict={clipIds:string[];message:string};
export type StructureMovement={id:string;kind:"clip"|"dialogue";trackName:string;nodeId?:string;from:number;to:number;approved:boolean};
export type StructureProposal={project:TimelineProject;clips:RoughcutLink["clips"];differences:StructureDifference[];movements:StructureMovement[];conflicts:StructureConflict[];changed:boolean;selectedCount:number};
const round=(n:number)=>Math.round(n*1e6)/1e6;
const signature=(value:unknown)=>JSON.stringify(value);

/** Pure read/proposal. Only selected identities may change; no editorial-order dependency assumptions. */
export function proposeStoryboardStructure(current:TimelineProject,link:RoughcutLink,document:StoryboardDocument,materials:readonly TimelineMaterial[],selection:StructureSelection,clipId:(nodeId:string)=>string):StructureProposal{
 const project=structuredClone(current),clips=structuredClone(link.clips),conflicts:StructureConflict[]=[],differences:StructureDifference[]=[],movements:StructureMovement[]=[];
 const flat=current.tracks.flatMap(track=>track.clips.map(clip=>({clip,track}))),byClip=new Map(flat.map(value=>[value.clip.id,value])),byNode=new Map(link.clips.map(value=>[value.nodeId,value]));
 if(new Set(link.clips.map(c=>c.nodeId)).size!==link.clips.length||new Set(link.clips.map(c=>c.clipId)).size!==link.clips.length)throw new Error("粗剪关联存在重复片段");
 const managed=link.clips.flatMap(value=>{const item=byClip.get(value.clipId);return item?[{...value,...item}]:[];}).sort((a,b)=>a.clip.position-b.clip.position||a.clip.id.localeCompare(b.clip.id));
 const primary=managed[0]?.track||current.tracks.find(track=>track.kind==="video");if(!primary)throw new Error("粗剪没有画面轨道");
 const newClips=new Map<string,TimelineClip>(),gaps=new Map<string,number>();
 for(const [i,item]of managed.entries())gaps.set(item.clip.id,i?Math.max(0,round(item.clip.position-(managed[i-1].clip.position+managed[i-1].clip.duration)+item.clip.transitionIn)):0);
 let target=managed[0]?.clip.position||0;
 for(const [shotIndex,shot]of document.shots.entries()){
  const tracked=byNode.get(shot.nodeId),existing=tracked&&byClip.get(tracked.clipId),media=materials.find(media=>media.artworkId===shot.adoptedArtworkId);
  const inPoint=shot.cut?.inPoint||0,duration=existing?.clip.duration??shot.cut?.duration??(media?.durationSeconds?media.durationSeconds-inPoint:0),id=tracked?.clipId||clipId(shot.nodeId);
  if(existing&&shotIndex>0)target=round(target+(gaps.get(id)||0)-existing.clip.transitionIn);
  if(!tracked){newClips.set(shot.nodeId,{id,artworkId:shot.adoptedArtworkId||"missing",canvasSourceId:shot.nodeId,position:Math.max(0,target),inPoint,duration:duration||1,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0});differences.push({id:`insert:${shot.nodeId}`,kind:"insert",nodeId:shot.nodeId,number:shot.number,clipId:id,from:null,to:Math.max(0,target),duration,selected:false});}
  else if(!existing||Math.abs(existing.clip.position-target)>1e-6)differences.push({id:`move:${id}`,kind:"move",nodeId:shot.nodeId,number:shot.number,clipId:id,from:existing?.clip.position??null,to:Math.max(0,target),duration,selected:false});
  target=round(target+duration);
 }
 for(const tracked of link.clips)if(!document.shots.some(shot=>shot.nodeId===tracked.nodeId)){const item=byClip.get(tracked.clipId);differences.push({id:`remove:${tracked.clipId}`,kind:"remove",nodeId:tracked.nodeId,number:`原镜头 ${link.clips.indexOf(tracked)+1}`,clipId:tracked.clipId,from:item?.clip.position??null,to:null,duration:item?.clip.duration||0,selected:false});}
 for(const id of selection.changeIds)if(!differences.some(d=>d.id===id))throw new Error("所选结构差异已改变，请重新预览");
 for(const id of selection.followClipIds)if(!byClip.has(id))throw new Error("所选跟随片段不存在");
 for(const id of selection.followDialogueIds)if(!current.dialogue?.lines.some(line=>line.id===id))throw new Error("所选跟随对白不存在");
 for(const d of differences)d.selected=selection.changeIds.includes(d.id);
 const selected=differences.filter(d=>d.selected),removed=new Set(selected.filter(d=>d.kind==="remove").map(d=>d.clipId));
 for(const d of selected){
  const tracked=byNode.get(d.nodeId),item=byClip.get(d.clipId);
  if(d.kind!=="insert"&&(!item||item.track.kind!=="video"||item.clip.artworkId!==tracked?.artworkId||item.clip.canvasSourceId&&item.clip.canvasSourceId!==d.nodeId))conflicts.push({clipIds:[d.clipId],message:`镜头 ${d.number} 的片段或来源已在多轨中修改`});
  if(d.kind==="insert"){const clip=newClips.get(d.nodeId)!,media=materials.find(m=>m.artworkId===clip.artworkId);if(!media||media.kind!=="video"||!media.durationSeconds||!d.duration||clip.inPoint+d.duration>media.durationSeconds+1e-6)conflicts.push({clipIds:[d.clipId],message:`镜头 ${d.number} 尚无可用采用版或新版长度不足`});}
 }
 // Ripple uses only selected insert/remove/reorder, and retains the original gaps/trims.
 const order=managed.filter(item=>!removed.has(item.clip.id)).map(item=>({nodeId:item.nodeId,clip:{...item.clip}}));
 for(const d of selected.filter(d=>d.kind==="move"||d.kind==="insert")){
  const at=order.findIndex(item=>item.nodeId===d.nodeId),entry=at>=0?order.splice(at,1)[0]:{nodeId:d.nodeId,clip:{...newClips.get(d.nodeId)!}};
  const desired=document.shots.map(shot=>shot.nodeId),index=desired.indexOf(d.nodeId),before=desired.slice(0,index).reverse().find(id=>order.some(item=>item.nodeId===id)),after=desired.slice(index+1).find(id=>order.some(item=>item.nodeId===id));
  const insert=before?order.findIndex(item=>item.nodeId===before)+1:after?order.findIndex(item=>item.nodeId===after):order.length;order.splice(insert,0,entry);
 }
 const proposed=new Map<string,number>();let cursor=managed[0]?.clip.position||0;
 for(const [i,item]of order.entries()){const gap=gaps.get(item.clip.id)||0;cursor=round(cursor+(i?gap-item.clip.transitionIn:0));proposed.set(item.clip.id,Math.max(0,cursor));cursor=round(cursor+item.clip.duration);}
 const explicitMoves=new Set(selected.filter(d=>d.kind==="move").map(d=>d.clipId));
 const position=(id:string)=>selection.positionPolicy==="ripple"?proposed.get(id):differences.find(d=>d.clipId===id&&d.kind!=="remove")?.to;
 for(const d of selected){if(d.kind==="remove"){for(const track of project.tracks)track.clips=track.clips.filter(c=>c.id!==d.clipId);const index=clips.findIndex(c=>c.clipId===d.clipId);if(index>=0)clips.splice(index,1);}
  if(d.kind==="insert"){const clip={...newClips.get(d.nodeId)!,position:position(d.clipId)??0};project.tracks.find(t=>t.id===primary.id)!.clips.push(clip);clips.push({nodeId:d.nodeId,clipId:d.clipId,artworkId:clip.artworkId});}
 }
 const anchors=managed.filter(item=>!removed.has(item.clip.id)&&proposed.has(item.clip.id));
 const shift=(at:number)=>{const anchor=[...anchors].reverse().find(a=>a.clip.position<=at+1e-6)||anchors[0];return anchor?round(proposed.get(anchor.clip.id)!-anchor.clip.position):0;};
 for(const {clip,track}of flat){if(removed.has(clip.id))continue;const managedItem=managed.find(m=>m.clip.id===clip.id),planned=managedItem?position(clip.id):selection.positionPolicy==="ripple"?round(clip.position+shift(clip.position)):clip.position;
  if(planned===null||planned===undefined||Math.abs(planned-clip.position)<1e-6)continue;
  const approved=explicitMoves.has(clip.id)||selection.positionPolicy==="ripple"&&selection.followClipIds.includes(clip.id);
  movements.push({id:clip.id,kind:"clip",trackName:track.name,nodeId:managedItem?.nodeId,from:clip.position,to:planned,approved});
  if(approved){if(managedItem&&(clip.artworkId!==managedItem.artworkId||clip.canvasSourceId&&clip.canvasSourceId!==managedItem.nodeId))conflicts.push({clipIds:[clip.id],message:"跟随片段的来源已修改，请先核对"});const found=project.tracks.flatMap(t=>t.clips).find(c=>c.id===clip.id)!;found.position=planned;}
 }
 for(const line of project.dialogue?.lines||[]){const to=selection.positionPolicy==="ripple"?round(line.position+shift(line.position)):line.position;if(Math.abs(to-line.position)<1e-6)continue;const approved=selection.followDialogueIds.includes(line.id);movements.push({id:line.id,kind:"dialogue",trackName:line.speaker||"对白",from:line.position,to,approved});if(approved)line.position=to;}
 for(const track of project.tracks){if(track.kind!=="video")continue;const sorted=[...track.clips].sort((a,b)=>a.position-b.position);for(const [i,clip]of sorted.entries()){const previous=sorted[i-1],overlap=previous?previous.position+previous.duration-clip.position:0;if(clip.position<0||(clip.transitionIn?(!previous||Math.abs(overlap-clip.transitionIn)>1e-6||clip.transitionIn>previous.duration):overlap>1e-6))conflicts.push({clipIds:[...(previous?[previous.id]:[]),clip.id],message:`轨道 ${track.name} 的片段重叠或转场不成立，请选择移动或调整剪辑`});}}
 try{planTimeline(project,materials.map(({artworkId,kind,durationSeconds,hasAudio})=>({artworkId,kind,durationSeconds,hasAudio})));}catch(error){conflicts.push({clipIds:[],message:error instanceof Error?error.message:"工程结构无效"});}
 return {project,clips,differences,movements,conflicts,changed:signature(project)!==signature(current)||signature(clips)!==signature(link.clips),selectedCount:selected.length};
}
