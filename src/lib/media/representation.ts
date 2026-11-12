import 'server-only';
import {getMediaAsset,type MediaAsset} from '@/lib/media-assets-reader';
import {ensureMediaVariants,importLegacyMedia} from '@/lib/media-assets';

/** Select bytes/metadata together. The caller authorizes the original source
 * first; this owner never caches or substitutes an account/ACL decision. */
export async function resolveMediaRepresentation(key:string,variant:string|null,options:{
 owner?:string;asset?:MediaAsset|null;variants?:ReadonlyMap<string,MediaAsset>;legacyOptional?:boolean;
}={}){
 let asset=options.asset||await getMediaAsset(key),resolved=key;
 if(!asset&&variant!=='thumbnail'&&variant!=='preview'){
  // Originals repair a missing catalog entry exactly like variants; without
  // this, a legacy/remote-only original loses its descriptor while thumbnails
  // of the same asset keep working (the canvas original-image breakage).
  const imported=importLegacyMedia(key,options.owner);
  asset=await(options.legacyOptional?imported.catch(()=>null):imported);
 }
 if(variant==='thumbnail'||variant==='preview'){
  if(!asset){const imported=importLegacyMedia(key,options.owner);asset=await(options.legacyOptional?imported.catch(()=>null):imported);}
  if(asset&&!(asset.thumbnail_key&&asset.preview_key))asset=await ensureMediaVariants(key).catch(()=>asset);
  const variantKey=variant==='thumbnail'?asset?.thumbnail_key:asset?.preview_key;
  if(variantKey){resolved=variantKey;asset=options.variants?.get(resolved)||await getMediaAsset(resolved);}
 }
 return{key:resolved,asset};
}
