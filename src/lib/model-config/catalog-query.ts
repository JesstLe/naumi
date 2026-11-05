import 'server-only';
import type {ModelSnapshot,Modality} from './types';
import type {FeatureId} from '../billing/rules/registry';
import {readPublishedModelSnapshot} from './published';
import {getBillingConfiguration} from '../billing/configuration';
import {modelCatalogWithPricing} from './catalog-pricing';

/** Current public catalog is an already-published read, not administration.
 * Callers sharing a request pass one snapshot; no mutable cross-request cache. */
export async function readPublishedModelCatalog(modality:Modality,feature?:FeatureId,supplied?:ModelSnapshot){
 const snapshot=supplied??await readPublishedModelSnapshot();
 const billing=feature?await getBillingConfiguration().current():undefined;
 return modelCatalogWithPricing(snapshot,modality,feature,billing);
}
