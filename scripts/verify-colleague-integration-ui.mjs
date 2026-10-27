import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-colleague-integration-ui.ts");
process.exitCode=result.exit;
