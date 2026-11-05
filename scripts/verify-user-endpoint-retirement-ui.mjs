import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-user-endpoint-retirement-ui.ts",{env:{...process.env,VERIFY_RETIRED_ENDPOINTS:"1"}});
process.exitCode=result.exit;
