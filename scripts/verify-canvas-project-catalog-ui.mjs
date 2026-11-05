import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-canvas-project-catalog-ui.ts");
process.exitCode=result.exit;
