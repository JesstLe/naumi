import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-supplier-model-metadata-ui.ts");
process.exitCode=result.exit;
