import copy
import json
from pathlib import Path
import subprocess
import unittest
import verify_candidate_nonbillable as op

MOCK=r'''
let skill,project,node;globalThis.fetch=async(url,opts)=>{const u=new URL(url),p=u.pathname,method=opts.method,auth=!!opts.headers.cookie;const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});if(p==='/api/version')return json({commit:BAD_VERSION?'wrong':'7bdcd8b644e8771646003f68055585f257df40f0',version:'1792146767'});if(!auth)return p.startsWith('/media/')&&PUBLIC_MEDIA?new Response(PNG):json({error:'unauthorized'},401);if(p==='/api/auth/session')return json({user:{email:'fixture@example.test'}});if(p==='/api/image-skills/import'){skill={id:'personal:fixture',revision:1,name:'QA',description:'QA test skill',category:'创作',instructions:'Preserve verified product facts.',visibility:'private',canEdit:true};return json({skill,duplicate:false},201)}if(p==='/api/image-skills'&&method==='PATCH'){const b=JSON.parse(opts.body);skill={...skill,...b.definition,revision:skill.revision+1};return json({skill})}if(p==='/api/image-skills')return json({skills:[skill]});if(p==='/api/packaging-strategy'&&method==='POST'){const b=JSON.parse(opts.body);project={id:'11111111-1111-4111-8111-111111111111',revision:project?project.revision+1:1,brief:b.brief};return json({project})}if(p==='/api/packaging-strategy')return json({project});if(p==='/api/canvas/text-nodes'&&method==='POST'){node=JSON.parse(opts.body);return json({persisted:true,node})}if(p==='/api/canvas/text-nodes')return json({persisted:true,nodes:[node]});if(p==='/api/canvas/history'){node.content=JSON.parse(opts.body).operations[0].fields.content;return json({persisted:true})}if(p==='/api/artworks/add')return json({id:'art-fixture',image:'/media/fixture.png'});if(p==='/media/fixture.png')return new Response(PNG);throw Error('UNEXPECTED_ENDPOINT');};
'''

class AcceptanceTests(unittest.TestCase):
    def run_node(self,*,bad=False,public=False):
        source=Path(__file__).with_name('verify_candidate_nonbillable.mjs').read_text(encoding='utf-8-sig')
        cfg={'runId':'11111111-1111-4111-8111-111111111111','cookie':'nv_user=private-fixture-cookie','ownedMedia':[],'commit':op.COMMIT,'version':op.VERSION}
        prefix='const BAD_VERSION='+str(bad).lower()+',PUBLIC_MEDIA='+str(public).lower()+",PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=','base64');\n"
        proc=subprocess.run(['node','--input-type=module','-'],input=prefix+MOCK+source.replace('__PRIVATE_CONFIG__',json.dumps(cfg)),capture_output=True,text=True,encoding='utf-8',timeout=30)
        return proc,json.loads(proc.stdout)
    def test_finite_full_api_fixture_pass_no_registration_models_or_delete(self):
        proc,result=self.run_node();self.assertEqual(proc.returncode,0,proc.stderr);self.assertEqual(result['result'],'PASS');self.assertTrue(result['canvas']['apiSaveUndoRedo']);self.assertTrue(result['media']['uploadedOriginalBytesExact']);self.assertEqual(result['isolation'],'anonymous-no-credentials-not-cross-account');self.assertFalse(result['browserUiTested']);self.assertNotIn('private-fixture-cookie',proc.stdout);self.assertEqual(len(result['created']),5)
    def test_public_media_fails_anonymous_isolation(self):
        proc,result=self.run_node(public=True);self.assertEqual(proc.returncode,2);self.assertEqual(result['failure'],'HTTP_STATUS_200');self.assertIn('artworkId',result['created'])
    def test_wrong_version_stops_before_any_test_object(self):
        proc,result=self.run_node(bad=True);self.assertEqual(proc.returncode,2);self.assertEqual(result['created'],{});self.assertEqual(len(result['requests']),1)
    def row(self):
        return {'Id':'a'*64,'Image':op.IMAGE,'Name':'/candidate-main','State':{'Running':True,'Paused':False,'StartedAt':'same-boot','Pid':12},'Config':{'Env':['SOURCE_COMMIT='+op.COMMIT,'BUILD_VERSION='+op.VERSION]},'HostConfig':{'PortBindings':{'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'13100'}]}}}
    def test_exact_source_image_cid_boot_binding(self):
        row=self.row();self.assertEqual(op.pin(row,'a'*64)['hostPid'],12)
        for change in [lambda x:x.update(Image='wrong'),lambda x:x['State'].update(Running=False),lambda x:x['HostConfig']['PortBindings']['3000/tcp'][0].update(HostPort='13012'),lambda x:x['Config'].update(Env=['SOURCE_COMMIT='+op.COMMIT,'BUILD_VERSION=old'])]:
            row=self.row();change(row)
            with self.assertRaises(ValueError):op.pin(row,'a'*64)

if __name__=='__main__':unittest.main()
