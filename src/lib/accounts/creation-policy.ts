import {z} from "zod";
export const accountImageGrantSchema=z.object({modelId:z.string().min(1).max(100),upstreamId:z.string().min(1).max(100)}).strict();
export type AccountImageGrant=z.infer<typeof accountImageGrantSchema>;
export const accountCreationPolicySchema=z.object({personalOnly:z.boolean(),reportVisibility:z.enum(["standard","private"]),image:accountImageGrantSchema.nullable()}).strict();
export type AccountCreationPolicy=z.infer<typeof accountCreationPolicySchema>;
/** Identifiers are internal constants, never HTTP input. Keep lists/counts/exports on one predicate. */
export function reportAccountVisibleSql(emailColumn:string){
  if(!/^[a-zA-Z_][\w]*\.[a-zA-Z_][\w]*$/.test(emailColumn))throw Error("INVALID_REPORT_ACCOUNT_COLUMN");
  return `NOT EXISTS(SELECT 1 FROM app_account_creation_policies account_policy WHERE account_policy.email=${emailColumn} AND account_policy.policy->>'reportVisibility'='private')`;
}
/** Read-side only. Nested stage IDs retain the accepted root operation owner. */
export function reportOperationVisibleSql(operationColumn:string,includeChildren=false,includeSupplierCalls=true){
  if(!/^(?:[a-zA-Z_]\w*\.[a-zA-Z_]\w*|\$[1-9]\d*)$/.test(operationColumn))throw Error("INVALID_REPORT_OPERATION_COLUMN");
  const matches=(id:string)=>`(${operationColumn}=${id} OR left(${operationColumn},length(${id})+1)=${id}||':'${includeChildren?` OR left(${id},length(${operationColumn})+1)=${operationColumn}||':'`:''})`;
  return `(NOT EXISTS(SELECT 1 FROM app_account_creation_policies report_policy JOIN app_billing_operations report_op ON report_op.email=report_policy.email
    WHERE report_policy.policy->>'reportVisibility'='private' AND ${matches('report_op.id')})
    ${includeSupplierCalls?`AND NOT EXISTS(SELECT 1 FROM app_account_creation_policies report_policy JOIN app_supplier_calls report_call ON report_call.user_email=report_policy.email
    WHERE report_policy.policy->>'reportVisibility'='private' AND ${matches('report_call.operation_id')})`:''})`;
}
