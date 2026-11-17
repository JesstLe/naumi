import 'server-only';
import type {Pool} from 'pg';
import {SUPPLIER_CHAIN_PAGE_SIZE,type SupplierChainRead} from './chain-contract';

export async function readSupplierChainBilling(sql:Pick<Pool,'query'>,operation:string){
  return (await sql.query("SELECT quote->'imagePreset'->>'factorBps' AS factor_bps,charged_credits,state,settlement_result FROM app_billing_operations WHERE id=$1",[operation])).rows[0];
}

const collections={
  calls:{
    fields:`x.id,x.operation_id,x.attempt_id,x.task_id,x.request_id,x.started_at,x.completed_at,
      x.cost_confirmed_at,x.model_version,x.billing_version,x.cny_micros,x.matched_rule_id,
      x.phase,x.provider_id,x.actual_model,x.model,x.amount_micros,x.currency,x.cost_status`,
    source:'app_supplier_calls x',filter:'x.operation_id=$1',orderedAt:'started_at',idCast:'uuid',
  },
  reviews:{fields:'x.*',source:'app_billing_api_cost_reviews x',filter:'x.operation_id=$1',orderedAt:'created_at',idCast:'text'},
  adjustments:{fields:'x.*',source:'app_supplier_cost_adjustments x JOIN app_supplier_calls c ON c.id=x.call_id',filter:'c.operation_id=$1',orderedAt:'created_at',idCast:'uuid'},
} as const;

/** Per visible slice; cursor timestamps stay in PostgreSQL to preserve precision. */
export async function readSupplierChainSlice(sql:Pick<Pool,'query'>,operation:string,input:SupplierChainRead){
  if(input.view==='billing')return {view:input.view,billing:await readSupplierChainBilling(sql,operation)??null};
  if(input.view==='call'){
    const row=(await sql.query(`SELECT parameters,usage,fx,evidence FROM app_supplier_calls WHERE operation_id=$1 AND id=$2::uuid`,
      [operation,input.call])).rows[0];
    if(!row)return null;
    const outputs=(await sql.query("SELECT * FROM app_supplier_call_outputs WHERE call_id=$1 ORDER BY output_index",[input.call])).rows;
    return {view:input.view,detail:{...row,outputs}};
  }
  const {fields,source,filter,orderedAt,idCast}=collections[input.view];
  const cursor=input.after
    ? `AND (x.${orderedAt},x.id) > (SELECT x.${orderedAt},x.id FROM ${source} WHERE ${filter} AND x.id=$3::${idCast})`
    : '';
  const {rows}=await sql.query(`SELECT ${fields} FROM ${source}
    WHERE ${filter} ${cursor} ORDER BY x.${orderedAt},x.id LIMIT $2`,
    [operation,SUPPLIER_CHAIN_PAGE_SIZE+1,...(input.after?[input.after]:[])]);
  const page=rows.slice(0,SUPPLIER_CHAIN_PAGE_SIZE);
  return {view:input.view,rows:page,next:rows.length>page.length?page.at(-1)!.id:null};
}
