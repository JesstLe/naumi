import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-canvas-model-scope-ui.ts");
process.exitCode=result.exit;
