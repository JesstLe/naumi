import type {ModelSnapshot,Modality} from './types';
import type {ConfigSnapshot} from '../billing/types';
import type {FeatureId} from '../billing/rules/registry';
import {publicModelCatalog} from './public-catalog';
import {modelCreditView} from './management-pricing';

/** Shared projection for published queries and administration. It owns no
 * repository, Router connection, wallet or lifecycle initialization. */
export function modelCatalogWithPricing(snapshot:ModelSnapshot,modality:Modality,feature?:FeatureId,billing?:ConfigSnapshot){
 const catalog=publicModelCatalog(snapshot,modality,feature);
 if(!feature)return catalog;
 if(!billing)throw Error('MODEL_CATALOG_BILLING_SNAPSHOT_REQUIRED');
 return {...catalog,models:catalog.models.map(model=>{
  const v=modelCreditView(billing,snapshot,feature,model.id);
  const unit=v.unit==='image'?'张':v.unit==='item'?'项':'次';
  return {...model,creditHint:v.credits===null?'价格需核对':`${v.estimated?'预估':'参考'}${modality==='image'?'标准1K ':''}${v.credits} 积分/${unit}`};
 })};
}
