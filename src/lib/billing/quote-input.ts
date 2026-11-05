import type {BillingFacts,ConfigSnapshot} from "./types";
import type {ModelSnapshot} from "../model-config/types";

export type QuoteInput=Partial<BillingFacts>&{feature:BillingFacts["feature"];quantity:number;ratio?:string};
/** Populated by authenticated adapters, not deserialized as trusted client data. */
export type QuoteSelection={actor:string|null;featureModel?:string|null;textModel?:string|null;imageQuality?:string|null;canvas?:boolean;path?:string;accepted?:boolean};
export type QuotePreparation={billing:ConfigSnapshot;models:ModelSnapshot|null};
