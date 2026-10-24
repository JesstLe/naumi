import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {legacyModelExecutionActive} from "./context";
import {ModelConfigError} from "./types";

export async function modelConfigurationEnabled() {
  if (!dbEnabled || legacyModelExecutionActive()) return false;
  if (process.env.NAUMI_ROUTER_MANAGEMENT_URL) return true;
  const table = (await getPool().query("SELECT to_regclass('app_model_config_state') AS name")).rows[0]?.name;
  if (table && (await getPool().query("SELECT 1 FROM app_model_config_state WHERE singleton=true")).rowCount) throw new ModelConfigError("CONFIG_UNAVAILABLE", "模型配置连接丢失，请联系管理员核对", 503);
  return false;
}
