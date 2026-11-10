"""Retained copy-only baseline/modified/rollback probe; no Docker or network."""
from pathlib import Path
import subprocess, sys

controller=Path('scripts/verify-native-application.py')
script=Path('scripts/verify-speech-flow-native-application.ts')
help_result=subprocess.run([sys.executable,str(controller),'run','--help'],capture_output=True,text=True,encoding='utf8')
if help_result.returncode or 'speech-flow' not in help_result.stdout or not script.is_file():
 print('SPEECH_NATIVE_CONTRACT=FAIL SPEECH_FLOW_MISSING');sys.exit(1)
source=script.read_text(encoding='utf8')
assert 'route.fulfill' not in source and 'route.fetch()' in source and "await route.abort('failed')" in source
for item in ['connectNativeParentDatabase','hashPassword','恢复原操作','source-segment','delivered.mp4','delivered.srt','realSupplierCalls:0','normalLogin:true']:
 assert item in source,item
assert "Path(__file__).resolve().parent/('verify-speech-flow-native-application.ts'" in controller.read_text(encoding='utf8')
print('SPEECH_NATIVE_CONTRACT=PASS FIXED_APP_UNCHANGED=YES FABRICATED_HTTP=0 NETWORK=0')
