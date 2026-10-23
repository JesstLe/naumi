import base64,copy,datetime as dt,unittest,uuid
from reconcile_nas_dead_boot47 import plan
from release47_host import Hold

class DeadBootPlan(unittest.TestCase):
 def setUp(self):
  self.identity={'instanceId':'web','bootId':'new'};self.start=dt.datetime(2026,10,22,10,tzinfo=dt.timezone.utc)
  self.data={'jobs':[],'activities':[]}
  for n in range(14):
   key='job-'+str(uuid.uuid4());paid={'state':'done'if n<3 else 'started'}
   if n<3:paid['result']=[{'id':'stored','url':'data:image/png;base64,eA=='}]
   self.data['jobs'].append({'id':key,'kind':'generate','lease_token':key,'lease_until':'2026-10-22T08:00:00+00:00','billing_settled':False,'snapshot':{'status':'pending','paidOperations':{key:paid}}})
   self.activity('durable-image','generate:'+key,key)
  key='imagegen-'+str(uuid.uuid4());self.data['jobs'].append({'id':key,'kind':'imagegen','lease_token':key,'lease_until':'2026-10-22T08:00:00+00:00','billing_settled':False,'snapshot':{'status':'pending','children':{'generate':{'jobId':self.data['jobs'][0]['id']}}}})
  self.activity('durable-image','imagegen:'+key,key)
  for scope in ['reference-sync','reference-sync','imagegen-batch']:self.activity(scope,'work',None)
 def activity(self,scope,key,token):
  self.data['activities'].append({'instance_id':'web','boot_id':'old','activity_kind':'accepted-work','state':'active','heartbeat_at':'2026-10-22T07:00:00+00:00','work_scope':scope,'work_key':key,'claim_token':token})
 def run_plan(self):return plan(self.data,self.identity,self.start,self.start)
 def test_exact_partition_preserves_paid_intents(self):
  old=copy.deepcopy(self.data);p=self.run_plan();self.assertEqual(old,self.data)
  self.assertEqual((len(p['changes']),len(p['stored']),len(p['parents'])),(11,3,1))
  for c in p['changes']:self.assertEqual(c['snapshot']['paidOperations'],c['before']['snapshot']['paidOperations'])
 def test_live_or_current_owner_never_closes(self):
  self.data['activities'][0]['boot_id']='new'
  with self.assertRaises(Hold):self.run_plan()
 def test_recent_domain_lease_blocks_even_dead_process(self):
  self.data['jobs'][0]['lease_until']='2026-10-22T11:00:00+00:00'
  with self.assertRaises(Hold):self.run_plan()
 def test_unknown_result_cannot_enter_stored_branch(self):
  j=self.data['jobs'][0];j['snapshot']['paidOperations'][j['id']]['result'][0]['url']='https://example.invalid/result.png'
  with self.assertRaises(Hold):self.run_plan()

if __name__=='__main__':unittest.main()
