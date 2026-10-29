import assert from 'node:assert/strict';
import {enterpriseRequestUrl,enterpriseAdminLocation} from '../src/lib/site-control/enterprise-navigation';
for(const [host,protocol,expected] of [
  ['47.105.59.142','https','https://47.105.59.142/admin?view=health'],
  ['company.test:8443','https','https://company.test:8443/admin?view=health'],
  ['company.test',null,'http://company.test/admin?view=health'],
  ['[::1]:18573',null,'http://[::1]:18573/admin?view=health'],
] as const){
  const origin=enterpriseRequestUrl('http://localhost:3000/admin/health',host,protocol);
  assert.equal(new URL(enterpriseAdminLocation('/admin/health',new URLSearchParams()),origin).href,expected);
}
console.log('ENTERPRISE_REDIRECT_AUTHORITY=PASS PUBLIC_HOST_PORT_PROTOCOL IPV6');
