"""Exercise only the installer's real secret-provisioning block in temporary dirs."""
import pathlib, re, subprocess, tempfile

source=(pathlib.Path(__file__).resolve().parents[1]/'install.sh').read_text(encoding='utf-8')
start=source.index('command -v openssl >/dev/null')
end=source.index("\nif grep -qE '^HTTP_PORT='",start)
block=source[start:end]
for initial in ['', 'MEDIA_WORKER_SECRET=\n', 'MEDIA_WORKER_SECRET=change-media-worker-secret\n', 'VIDEO_WORKER_SECRET='+'a'*64+'\nMEDIA_WORKER_SECRET='+'b'*64+'\nSETTINGS_SECRET='+'c'*64+'\n']:
 with tempfile.TemporaryDirectory(prefix='naumi-install-secrets-') as directory:
  env=pathlib.Path(directory)/'.env';env.write_text(initial,encoding='utf-8')
  subprocess.run(['bash','-euc',block],cwd=directory,check=True,capture_output=True)
  first=env.read_bytes();values=dict(line.split('=',1) for line in first.decode().splitlines() if '=' in line)
  keys=['VIDEO_WORKER_SECRET','MEDIA_WORKER_SECRET','SETTINGS_SECRET']
  assert all(re.fullmatch('[0-9a-f]{64}',values[key]) for key in keys)
  assert len({values[key] for key in keys})==3
  if initial.startswith('VIDEO_WORKER_SECRET='):assert first.decode()==initial
  subprocess.run(['bash','-euc',block],cwd=directory,check=True,capture_output=True)
  assert env.read_bytes()==first,'Upgrade must preserve provisioned secrets'
print('INSTALLER_SECRETS=PASS cases=4 independent=3 repeat_preserved=1 compose_not_invoked=1')
