import {decimalMicros,fixed} from "@/lib/supplier-cost/money";
import {unknownSupplierMetadata,type SupplierMetadata,type SupplierModelRecord,type SupplierPrice} from "@/lib/supplier-models/types";
import {moneyFields} from "./contracts";

export function metadataDraft(model:SupplierModelRecord):SupplierMetadata{
  return Object.fromEntries(Object.keys(unknownSupplierMetadata()).map(key=>[key,model[key as keyof SupplierMetadata]])) as SupplierMetadata;
}

export function priceTexts(prices:SupplierPrice[]):Record<string,Record<string,string>>{
  return Object.fromEntries(prices.map(price=>[price.id,Object.fromEntries(moneyFields.map(key=>[key,price[key]===null?"":fixed(price[key])]))]));
}

/** Original browser document serialization. Imported evidence is read-only;
 * blanks stay unknown, an explicit zero stays zero, and no float math is used. */
export function metadataPayload(model:SupplierModelRecord,draft:SupplierMetadata,parameterText:string,texts:Record<string,Record<string,string>>):SupplierMetadata{
  let parameterMetadata:SupplierMetadata["parameterMetadata"];
  try{parameterMetadata=JSON.parse(parameterText||"{}");}catch{throw Error("参数元信息请填写有效JSON");}
  return {
    ...draft,
    parameterMetadata:{...parameterMetadata,
      ...(model.parameterMetadata.upstreamImport?{upstreamImport:model.parameterMetadata.upstreamImport}:{}),
      ...(model.parameterMetadata.supplierSpecification?{supplierSpecification:model.parameterMetadata.supplierSpecification}:{}),
    },
    prices:draft.prices.map(price=>{
      const fields:Record<string,string|null>={};
      for(const key of moneyFields){
        const raw=texts[price.id]?.[key]||"";
        if(raw && !/^\d+(?:\.\d{0,6})?$/.test(raw))throw Error("价格请输入非负金额，最多6位小数");
        fields[key]=raw?decimalMicros(raw):null;
        if(raw && fields[key]===null)throw Error("价格金额超出范围");
      }
      return {...price,...fields};
    }),
  };
}
