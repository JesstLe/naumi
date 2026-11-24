import "server-only";
import type {PoolClient} from "pg";
import {readAccountCreationPolicy} from "./creation-policy-store";
export class ReportAccountHidden extends Error { readonly status=404;constructor(){super("记录不存在或无权访问");} }
export async function reportAccountReadable(email:string,tx?:Pick<PoolClient,"query">){
  return (await readAccountCreationPolicy(email,tx))?.reportVisibility!=="private";
}
