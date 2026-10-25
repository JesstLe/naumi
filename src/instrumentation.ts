/** Next invokes this before serving Node requests. Edge and build workers never
 * migrate application data; the independent scanner/media roles do not import it. */
export async function register(){
  if(process.env.NEXT_RUNTIME!=="nodejs"||process.env.NEXT_PHASE==="phase-production-build")return;
  const {initializeWebApplication}=await import("./lib/application/startup");
  const report=await initializeWebApplication();
  const registry=report.modelRegistry;
  if(registry)console.info(`MODEL_REGISTRY_STARTUP=${registry.state==="unavailable"?"UNAVAILABLE":"PASS"} state=${registry.state}${"version" in registry?` version=${registry.version}`:""}${"code" in registry?` code=${registry.code}`:""}`);
  console.info(`APP_STARTUP=PASS mode=${report.mode} steps=${report.steps.length}`);
}
