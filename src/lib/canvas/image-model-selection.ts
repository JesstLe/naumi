import type {FeatureCatalog} from '../model-config/feature-catalog';
import type {PublicImageConfiguration,PublicImageModel} from '../model-config/public-client';
import {compactImageModelOptions} from '../image-model-routing';
import {normalizeCanvasRatio,normalizeCanvasResolution,type canvasModelParameters} from './generation-parameters';

export type CanvasImageModels={model:string;models:PublicImageModel[]};
type Catalog=Pick<FeatureCatalog,'managed'|'models'|'defaultModelId'>|null;
type Parameters=ReturnType<typeof canvasModelParameters>;

/** The existing published/legacy precedence,not an execution admission rule.
 * An unknown managed catalogue never exposes an unrestricted legacy list. */
export function canvasImageCatalogMode(catalog:Catalog,config:PublicImageConfiguration|null){
 if(catalog?.managed)return 'managed';
 if(catalog?.managed!==false&&config?.modelVersion)return 'waiting';
 return config?'legacy':'unchanged';
}

/** Keep model identity and its visible options in one projection. Family
 * compaction retains the original metadata and current/saved/default order. */
export function canvasImageModelSelection(input:{catalog:Catalog;selected:string;config:PublicImageConfiguration|null;previous:string;saved:string}):CanvasImageModels|undefined{
 const {catalog,selected,config,previous,saved}=input,mode=canvasImageCatalogMode(catalog,config);
 if(mode==='managed'){
  const models=catalog!.models;
  return {models,model:models.find(item=>item.id===selected)?.id||catalog!.defaultModelId||models[0]?.id||''};
 }
 if(mode==='waiting')return {models:[],model:''};
 if(mode==='unchanged')return;
 const options=Array.isArray(config!.imageModels)?config!.imageModels.filter(item=>item?.id&&item?.label):[];
 const fallback=config!.defaultImageModel||options[0]?.id||'';
 const models:PublicImageModel[]=options.length?compactImageModelOptions(options,[fallback,saved]):fallback?[{id:fallback,label:fallback,supportsEdit:fallback.startsWith('gpt-image')}]:[];
 const model=models.some(item=>item.id===previous)?previous:models.some(item=>item.id===saved)?saved:models.find(item=>item.id===fallback)?.id||models[0]?.id||'';
 return {models,model};
}

/** Only reconcile a new editable choice. Artwork metadata,frozen plans and
 * supplier mappings remain with their existing owners. */
export function canvasImageRatio(parameters:Parameters,value:string){
 const normalized=normalizeCanvasRatio(value);return parameters.ratios.includes(normalized)?normalized:'auto';
}
export function canvasImageResolution(parameters:Parameters,value:string){
 const normalized=normalizeCanvasResolution(value);return parameters.resolutions.includes(normalized)?normalized:parameters.resolutions[0]||'1K';
}
