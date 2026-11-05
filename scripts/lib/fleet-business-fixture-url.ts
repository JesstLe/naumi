type FixtureDatabase='protocol'|'receipt'|'worker';

/** Bind destructive verification to a query-free, explicitly named local URL.
 * This validates configuration before I/O; it is not a production DB identity proof. */
export function fleetFixtureUrl(raw:unknown,database:FixtureDatabase):URL{
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1')throw Error('ISOLATED_FIXTURE_REQUIRED');
  if(typeof raw!=='string'||!raw||raw.length>4096)throw Error('FLEET_FIXTURE_URL_REQUIRED');
  let url:URL;
  try{url=new URL(raw);}catch{throw Error('FLEET_FIXTURE_URL_INVALID');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='65298')throw Error('FLEET_FIXTURE_ENDPOINT_REQUIRED');
  if(url.href.includes('?')||url.href.includes('#'))throw Error('FLEET_FIXTURE_QUERY_OR_FRAGMENT_REJECTED');
  const allowed=database==='protocol'?url.pathname==='/fleet_protocol_fixture':database==='receipt'?/^\/fleet_receipt_compat_[a-f0-9]{32}$/.test(url.pathname):database==='worker'?['/fleet_central_103_20261104','/fleet_source_47_20261104'].includes(url.pathname):false;
  if(!allowed)throw Error('FLEET_FIXTURE_DATABASE_REQUIRED');
  return url;
}

/** Check the supplied central Pool and application environment before writes.
 * Credentials stay in the comparison only and are never included in errors. */
export function fleetFixtureApplicationPool(pool:{options:{connectionString?:unknown}}):URL{
  const url=fleetFixtureUrl(pool.options.connectionString,'protocol');
  const application=fleetFixtureUrl(process.env.DATABASE_URL,'protocol');
  if(url.toString()!==application.toString())throw Error('FLEET_FIXTURE_POOL_BINDING_MISMATCH');
  return url;
}
