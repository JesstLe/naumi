import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {legacyModelExecutionActive} from "./context";

export async function modelConfigurationEnabled() {
  if (!dbEnabled || legacyModelExecutionActive()) return false;
  if (process.env.NAUMI_ROUTER_MANAGEMENT_URL) return true;
  const table = (await getPool().query("SELECT to_regclass('app_model_config_state') AS name")).rows[0]?.name;
  // Published data determines managed mode. Missing administration connectivity
  // must not turn a read into legacy mode or break existing direct execution.
  return !!(table && (await getPool().query("SELECT 1 FROM app_model_config_state WHERE singleton=true")).rowCount);
}
