"""Normal application successor: BI HTTP acceptance; no NAS migration or task replay."""
import json,pathlib,sys,time
import release47_normal_controller as ctl
from release47_host import require,file_sha


def settled_media_observation(row, instance, boot):
    # Source-audited scope: ensureMediaVariantsLocal awaits all storage writes,
    # rolls its DB transaction back and releases it before rejecting. Unlike a
    # paid supplier submission, this observation has no remote generation job.
    return (row.get('instance_id')==instance and row.get('boot_id')==boot
        and row.get('activity_kind')=='accepted-work' and row.get('work_scope')=='media-variant'
        and row.get('state')=='unknown' and row.get('outcome')=='background-promise-unconfirmed'
        and row.get('claim_token') is None and row.get('finished_at') is None)


class BiController(ctl.Controller):
    def sql(self, query):
        raw = self.tx.run(['docker','exec','-i',self.db['id'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',self.de['POSTGRES_USER'],'-d',self.de['POSTGRES_DB']],
            stdin=("BEGIN READ ONLY;SET LOCAL statement_timeout='15s';"+query+'COMMIT;').encode(),timeout=60)
        decoder=json.JSONDecoder();text=raw.decode();rows=[]
        while text.strip():
            row,end=decoder.raw_decode(text.lstrip());rows.append(row);text=text.lstrip()[end:]
        return rows

    def maintenance_and_import(self):
        # This release has ample disk: no broad cache/container cleanup is needed.
        import shutil
        archive=pathlib.Path(self.cfg['imageArchive'])
        require(archive.is_file() and file_sha(archive)==self.cfg['imageArchiveSha256'],'FIXED_IMAGE_ARCHIVE_CHANGED')
        require(shutil.disk_usage('/').free>=10*1024**3+archive.stat().st_size,'IMPORT_DISK_RESERVE_INSUFFICIENT')
        self.op('image-import',lambda _:self.tx.run(['docker','load','-i',str(archive)],timeout=300).decode())

    def ready(self):
        result=super().ready()
        evidence=[]
        for section in ['operations','users','artworks']:
            start=time.monotonic()
            body=self.request(self.newweb,'/api/admin/bi?section='+section+'&page=1&size=30')
            elapsed=time.monotonic()-start
            require(body.get('section')==section and isinstance(body.get('rows'),list) and type(body.get('total')) is int,'BI_RESPONSE_INVALID')
            require(elapsed<5,'BI_QUERY_STILL_SLOW')
            evidence.append({'section':section,'seconds':round(elapsed,3),'rows':len(body['rows']),'total':body['total']})
        self.tx.save('BI_HTTP_ACCEPTANCE.json',evidence)
        result['bi']=evidence
        return result


def main():
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True,type=pathlib.Path);args=parser.parse_args()
    cfg=json.loads(args.config.read_bytes());ctl.configure(cfg)
    with ctl.transaction() as tx:
        print('THREE_LOCKS=ACQUIRED',flush=True)
        operator=BiController(tx,cfg)
        try:operator.run()
        except BaseException as error:operator.recover_failure(error);raise
    print('THREE_LOCKS=RELEASED',flush=True)


if __name__=='__main__':main()
