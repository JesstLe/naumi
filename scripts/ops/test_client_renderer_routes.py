import unittest
from client_renderer_routes import renderer_routes
class RendererRoutes(unittest.TestCase):
 def args(self):
  return dict(current={'deploymentId':'naumi-'+'a'*40+'-1794712000-standard','endpoint':'current-web:3000'},retained=[{'deploymentId':'naumi-'+'b'*40+'-1794711999-standard','endpoint':'old-web:3000','until':1794712100}],now=1794712000)
 def test_only_get_rsc_reviewed_paths(self):
  out=renderer_routes(**self.args());self.assertIn('"GET:1:/canvas:" 1;',out['http']);self.assertNotIn('POST:1',out['http']);self.assertNotIn('GET:1:/api/',out['http']);self.assertIn('proxy_next_upstream off;',out['server']);self.assertIn('location @naumi_rsc_owner',out['server'])
 def test_native_identity_and_gateway_deadline(self):
  out=renderer_routes(**self.args());self.assertIn('map $http_x_deployment_id',out['http']);self.assertIn('x-naumi-rsc-until $naumi_renderer_until',out['server']);self.assertIn('x-naumi-rsc-until ""',out['server']);self.assertEqual(out['notBeforeRetire'],1794712100);self.assertIn('x-naumi-renderer-read "1"',out['server']);self.assertIn('x-naumi-renderer-read ""',out['server'])
 def test_expired_owner_pruned_not_kept_forever(self):
  args=self.args();args['now']=1794712100;out=renderer_routes(**args);self.assertEqual(out['activeRetained'],[]);self.assertNotIn('old-web',out['http']);self.assertEqual(out['notBeforeRetire'],args['now'])
 def test_oversized_or_multiple_windows_rejected(self):
  args=self.args();args['retained'][0]['until']=args['now']+901
  with self.assertRaises(AssertionError):renderer_routes(**args)
  args=self.args();args['retained']*=2
  with self.assertRaises(AssertionError):renderer_routes(**args)
 def test_identity_endpoint_and_deadline_injection_rejected(self):
  for field,value in [('deploymentId','unknown;'),('endpoint','old:3000;include secret;'),('until',True)]:
   args=self.args();args['retained'][0][field]=value
   with self.assertRaises(AssertionError):renderer_routes(**args)
 def test_unknown_identity_falls_to_current_and_no_post_replay(self):
  out=renderer_routes(**self.args());self.assertIn('default naumi_renderer_current;',out['http']);self.assertIn('error_page 409 502 503 504 = @naumi_rsc_current;',out['server']);self.assertEqual(out['server'].count('proxy_intercept_errors on;'),1);self.assertEqual(out['server'].count('recursive_error_pages on;'),1);self.assertEqual(out['server'].count('recursive_error_pages off;'),2);self.assertEqual(out['server'].count('proxy_intercept_errors off;'),2)
if __name__=='__main__':unittest.main()
