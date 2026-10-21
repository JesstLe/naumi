"""Narrow accounting of normal old-slot image completion, not a deletion waiver."""
import copy
import release47_task_snapshot as tasks
from release47_host import require

def reviewed_completion(before,after,proof):
 result=tasks.compare_task_snapshots(before,after);accepted=set();records=[]
 a=before.private if hasattr(before,'private') else before;b=after.private if hasattr(after,'private') else after
 old={x['id']:x for x in a['tables']['app_image_jobs']['rows']};new={x['id']:x for x in b['tables']['app_image_jobs']['rows']}
 reservations={x['job_id']for x in a['tables']['app_gen_reservations']['rows']};remaining={x['job_id']for x in b['tables']['app_gen_reservations']['rows']}
 for p in proof:
  identifier=p['id'];o=old.get(identifier);n=new.get(identifier)
  require(o and n and o['snapshot']['status']=='pending' and n['snapshot']['status']=='done' and n.get('billing_settled')is True,'NOT_NORMAL_IMAGE_COMPLETION')
  require(tasks.frozen(o)==tasks.frozen(n) and n.get('lease_token')is None and identifier in reservations and identifier not in remaining,'COMPLETION_CONTEXT_CHANGED')
  require(o['snapshot'].get('paidOperations') and not n['snapshot'].get('paidOperations'),'NOT_LEGACY_FINAL_SNAPSHOT_REPLACEMENT')
  require(p.get('imagesDecoded')is True and p.get('artworksExist')is True and p.get('billingSettled')is True and p.get('ledgerCount')==1 and p.get('charged')==o['reserved_cost'] and p.get('reservationCount')==0,'REAL_IMAGE_AND_SINGLE_SETTLEMENT_PROOF_REQUIRED')
  for table in ['app_supplier_calls','app_billing_operations']:
   prior=[x for x in a['tables'][table]['rows'] if x.get('operation_id')==identifier or x.get('id')==identifier]
   current={tasks.row_key(x,tasks.KEYS[table]):x for x in b['tables'][table]['rows']}
   for x in prior:
    y=current.get(tasks.row_key(x,tasks.KEYS[table]));require(y and tasks.frozen(x)==tasks.frozen(y) and all(tasks.supplier_bindings(y).get(k)==v for k,v in tasks.supplier_bindings(x).items()),'SUPPLIER_OR_QUOTE_CHANGED')
  accepted.add(('app_image_jobs',tasks.sha(['app_image_jobs',identifier]),'ORIGINAL_SUPPLIER_BINDING_CHANGED'))
  accepted.add(('app_gen_reservations',tasks.sha(['app_gen_reservations',identifier]),'PRESERVED_ROW_MISSING'));records.append({'id':identifier,'reason':'old-slot-generated-image-settled-once','proof':p})
 violations=[v for v in result['violations'] if (v.get('table'),v.get('identitySha256'),v.get('reason'))not in accepted]
 return {**result,'originalViolations':result['violations'],'reviewedCompletedImages':records,'violations':violations,'noMissingJobs':not any(v['reason']=='PRESERVED_ROW_MISSING'for v in violations),'noOriginalSupplierMutation':not any(v['reason']=='ORIGINAL_SUPPLIER_BINDING_CHANGED'for v in violations),'preservationVerified':not violations and not result['unknownTables']}
