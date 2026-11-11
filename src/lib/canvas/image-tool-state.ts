import type {Artwork} from '../mock-data';

/** Availability belongs to the image action, not its menu location. Read-only
 * viewing/download remain independent from mutations and provider readiness. */
export function canvasImageToolState(input:{source?:Pick<Artwork,'image'|'videoUrl'>|null;readOnly:boolean;ready:boolean;locked:boolean;historySaving?:boolean;cutoutReady?:boolean;cutoutError?:string|null}){
 const hasImage=!!input.source?.image&&!input.source.videoUrl;
 const reason=!hasImage?'请先选择已载入的图片':input.readOnly?'当前画布为只读':!input.ready?'节点设置正在载入':input.historySaving?'画布正在保存':input.locked?'节点已锁定':'';
 return {canView:hasImage,canMutate:!reason,reason,canCutout:!reason&&!!input.cutoutReady,cutoutReason:reason||(!input.cutoutReady?input.cutoutError||'抠图执行配置尚未就绪':'')};
}
