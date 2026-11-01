import {runModelManagementUi} from "./verification/model-management-ui-runner.mjs";
const result=await runModelManagementUi("scripts/verify-apimart-preset-ui.ts",{profile:"model-config",env:{...process.env,NAUMI_VERIFY_BUSINESS_UI:"1"}});
process.exitCode=result.exit;
