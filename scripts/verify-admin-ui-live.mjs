import {runModelManagementUi} from './verification/model-management-ui-runner.mjs';
const result=await runModelManagementUi('scripts/verify-admin-ui-live.cjs',{
  env:{...process.env,VERIFY_ADMIN_UI_INTEGRATION:'1',NAUMI_BUILD_CPUS:'2'},startupTimeoutMs:180000,
});
process.exitCode=result.exit;
