import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-model-display-order-ui.ts");
process.exitCode=result.exit;
