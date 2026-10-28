import copy,datetime as dt,unittest
import release_site_control as site
from release47_host import Hold

class SiteReleaseTests(unittest.TestCase):
    def config(self):
        return {'target':'103.30.76.93','authorization':site.AUTHORIZATION,'releaseId':'release103-site-control-20261028-r1','commit':'a'*40,'image':'sha256:'+'b'*64,'buildVersion':'1793200513','restoreDatabase':False,'replayAcceptedTasks':False,'evidenceRoot':'/opt/naumi-staging/evidence/release103-site-control-20261028-r1','webMemoryMiB':1536,'workerMemoryMiB':1024,'newPort':13106,'oldPort':13105,'newNames':{'web':'naumi103-web-site-control-20261028-r1','worker':'naumi103-worker-site-control-20261028-r1'},'oldNames':{'web':'naumi103-old-web','worker':'naumi103-old-worker','media':'naumi103-old-media','portal':'naumi-fleet-portal'},'date':dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),'webEnvironment':{'FLEET_CONTROL_ENABLED':'1','FLEET_PORTAL_ONLY':'0','FLEET_RELEASE_DISPATCH_ENABLED':'0','FLEET_SCHEDULER_ENABLED':'0'}}
    def test_fixed_review_passes(self):site.validate(self.config())
    def test_wrong_source_and_scope_do_not_enter_host(self):
        for key,value in [('target','120.27.162.85'),('restoreDatabase',True),('replayAcceptedTasks',True),('image','latest'),('commit','main'),('authorization','prior authorization'),('date','2000-01-01'),('newPort',13105),('webMemoryMiB',768)]:
            c=self.config();c[key]=value
            with self.subTest(key=key),self.assertRaises(Hold):site.validate(c)
    def test_credentials_and_storage_cannot_be_overridden(self):
        c=self.config();c['webEnvironment']['DATABASE_URL']='postgres://wrong'
        with self.assertRaises(Hold):site.validate(c)
    def test_existing_slot_name_forbidden(self):
        c=self.config();c['newNames']['web']=c['oldNames']['web']
        with self.assertRaises(Hold):site.validate(c)
    def test_startup_context_binds_new_release(self):
        c=self.config();context=site.startup.context(c['releaseId'],c['commit'],c['buildVersion'],c['newNames']['web'])
        self.assertEqual(context['releaseId'],c['releaseId'])
        self.assertEqual(context['instanceId'],c['newNames']['web'])
    def test_nginx_dump_separator_never_written_into_files(self):
        name='/etc/nginx/nginx.conf';raw='events {}\nhttp { server { listen 80; location / { proxy_pass http://127.0.0.1:13105; } } }\n'
        dump='# configuration file '+name+':\n'+raw+'\n';start=raw.index('http://127.0.0.1:13105')
        rendered,after=site.render_file_edits(dump,{name:raw.encode()},{name:[(start,start+len('http://127.0.0.1:13105'),'http://127.0.0.1:13106')]})
        self.assertEqual(after[name],raw.replace('13105','13106').encode())
        self.assertEqual(rendered,dump.replace('13105','13106'))
        self.assertEqual(site.render_file_edits(dump,{name:raw.encode()},{}),(dump,{name:raw.encode()}))

if __name__=='__main__':unittest.main()
