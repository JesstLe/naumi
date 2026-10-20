"""Offline evidence checks for the Oct20 NAS preparation; no network or secrets.

Candidate and copy rollback checks are not storage migration or S3 acceptance.
"""
import argparse,hashlib,json,pathlib

BASELINE='233de7bf77edb119c8d8acae8a88e3c2966066a796fc5b02bfa5543608b284d6'
MODIFIED='5b90f649e24e20fbce0ccd68668709ef1c9f47d4d22575320d10957e806e61de'

def check(mode,folder):
 root=pathlib.Path(folder).resolve()
 if mode=='baseline':
  p=root/'SSHD_BASELINE.conf'
  assert hashlib.sha256(p.read_bytes()).hexdigest()==BASELINE
  assert b'Match User naumi-nas47'not in p.read_bytes()
  print('BASELINE=PASS ORIGINAL_SSHD=RESTORED ORIGINAL_STORAGE=LOCAL')
 elif mode=='modified':
  p=root/'MODIFIED_FILE';raw=p.read_bytes()
  assert hashlib.sha256(raw).hexdigest()==MODIFIED
  for line in ['Match User naumi-nas47','AllowTcpForwarding remote','PermitListen 127.0.0.1:13947','PermitOpen none','GatewayPorts no','ForceCommand /bin/false']:
   assert line.encode()in raw
  assert b'PasswordAuthentication yes'not in raw
  print('MODIFIED=PASS CANDIDATE_USER=RESTRICTED LOOPBACK_ONLY=13947 FORMAL_CANDIDATE=RETAINED')
 else:
  r=json.loads((root/'ROLLBACK_NETWORK47.json').read_bytes());n=json.loads((root/'NAS_TERMINAL_RESTORED.json').read_bytes())
  assert r['sshdRestoredSha256']==BASELINE and r['newTunnelKeyDisabled']and not r['tunnelListener']and not r['storageChanged']
  assert n['restoredOriginalSshDisabled']and n['telnetStillDisabled']
  print('LIVE_ROLLBACK=PASS SSHD_HASH=RESTORED NEW_KEY=DISABLED NAS_SSH=DISABLED STORAGE=LOCAL REPLAY=0')

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['baseline','modified','live-rollback']);p.add_argument('folder');a=p.parse_args();check(a.mode,a.folder)
