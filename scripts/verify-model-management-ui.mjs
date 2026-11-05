import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-model-management-ui.ts");
process.exitCode=result.exit;
