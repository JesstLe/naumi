"""Admin-query successor: additive indexes after backup, existing image/drain proofs retained."""
import argparse,json,pathlib,time,urllib.request,urllib.error
import release47_normal_controller as ctl
from release47_image_delivery_successor import ImageDeliveryController
from release47_host import require

READS=[
 '/api/admin/bi?section='+section+'&page=1&size=30'
 for section in ['overview','users','artworks','operations','models','calls','ledger','conversations','orders','access','management']
]+['/api/admin/model-management','/api/admin/model-management/library?view=summary','/api/admin/model-health',
   '/api/admin/users','/api/admin/usage?days=30','/api/admin/artworks?page=0&pageSize=24',
   '/api/admin/settings','/api/admin/teams','/api/admin/team-access','/api/admin/feature-access','/api/admin/billing']

def anonymous_status(port,path):
 try:
  with urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=10) as response:return response.status
 except urllib.error.HTTPError as error:return error.code

class AdminQueryController(ImageDeliveryController):
 def maintenance_and_import(self):
  # Parent run() has already saved a readable pg_dump under these same locks.
  require(self.succ['operations'].get('database-backup',{}).get('phase')=='ACKNOWLEDGED','READABLE_BACKUP_BEFORE_INDEXES')
  script=pathlib.Path(__file__).parent/'migrations'/'20261021-admin-query-indexes.sql'
  require(script.is_file(),'REVIEWED_INDEX_SCRIPT_REQUIRED')
  result=self.tx.run(['docker','exec','-i',self.db['id'],'psql','-XqAt','-v','ON_ERROR_STOP=1',
   '-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],stdin=script.read_bytes(),timeout=270)
  self.tx.save('ADMIN_INDEX_INSTALL.txt',result)
  super().maintenance_and_import()

 def ready(self):
  result=super().ready();checks=[]
  for path in READS:
   start=time.monotonic();body=self.request(self.newweb,path);seconds=time.monotonic()-start
   require(isinstance(body,dict),'ADMIN_RESPONSE_INVALID')
   if '/bi?' in path:require(type(body.get('total')) is int and isinstance(body.get('rows'),list),'ADMIN_BI_RESPONSE_INVALID')
   require(seconds<2,'ADMIN_QUERY_REMAINS_SLOW')
   checks.append({'path':path,'seconds':round(seconds,3),'rows':len(body.get('rows',body.get('models',[]))),'total':body.get('total')})
  for path in ['/api/admin/bi?section=users','/api/admin/model-management/library?view=summary']:
   require(anonymous_status(self.cfg['newPort'],path) in [401,403,404],'ANONYMOUS_ADMIN_ACCESS_ACCEPTED_OR_BROKEN')
  self.tx.save('ADMIN_QUERY_HTTP_ACCEPTANCE.json',{'reads':checks,'supplierCalls':0,'businessRowsWritten':0})
  result['adminQueries']=checks;return result

def main():
 p=argparse.ArgumentParser();p.add_argument('--config',type=pathlib.Path,required=True);a=p.parse_args()
 cfg=json.loads(a.config.read_bytes());ctl.configure(cfg)
 with ctl.transaction() as tx:
  print('THREE_LOCKS=ACQUIRED',flush=True);op=AdminQueryController(tx,cfg)
  try:op.run()
  except BaseException as error:op.recover_failure(error);raise
 print('THREE_LOCKS=RELEASED',flush=True)
if __name__=='__main__':main()
