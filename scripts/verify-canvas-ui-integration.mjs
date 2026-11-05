import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-canvas-ui-integration.ts");
process.exitCode=result.exit;
