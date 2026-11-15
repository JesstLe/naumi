/** Native Next deployment identity. Never replace its random BUILD_ID/RSC b.
 * Unversioned development/local builds retain the previous behavior. */
export function buildDeploymentId(env) {
  const source=env.SOURCE_COMMIT||'',version=env.BUILD_VERSION||'';
  if(!/^[a-f0-9]{40}$/.test(source)||!/^[1-9][0-9]{0,11}$/.test(version))return undefined;
  const flavor=env.FLEET_UI_BUILD==='1'?'fleet':env.ENTERPRISE_UI_BUILD==='1'?'enterprise':env.DESKTOP_UI_BUILD==='1'?'desktop':'standard';
  return `naumi-${source}-${version}-${flavor}`;
}
