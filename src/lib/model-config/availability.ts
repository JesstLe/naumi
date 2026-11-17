import "server-only";
import type {Pool} from "pg";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {legacyModelExecutionActive} from "./context";

export async function modelConfigurationEnabled(db?:Pick<Pool,"query">) {
  if (!dbEnabled || legacyModelExecutionActive()) return false;
  if (process.env.NAUMI_ROUTER_MANAGEMENT_URL) return true;
  const sql=db??getPool();
  const table = (await sql.query("SELECT to_regclass('app_model_config_state') AS name")).rows[0]?.name;
  // Published data determines managed mode. Missing administration connectivity
  // must not turn a read into legacy mode or break existing direct execution.
  return !!(table && (await sql.query("SELECT 1 FROM app_model_config_state WHERE singleton=true")).rowCount);
}
