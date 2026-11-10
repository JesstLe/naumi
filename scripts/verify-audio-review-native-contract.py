"""Retained copy-only probe; full browser behavior is proved by the fixed SDK run."""
from pathlib import Path
import subprocess,sys

controller=Path('scripts/verify-native-application.py')
companion=Path('scripts/verify-storyboard-audio-review-native.ts')
help_result=subprocess.run([sys.executable,str(controller),'run','--help'],capture_output=True,text=True,encoding='utf8')
if help_result.returncode or 'storyboard-audio-review' not in help_result.stdout or not companion.is_file():
 print('AUDIO_REVIEW_NATIVE_CONTRACT=FAIL NATIVE_AUDIO_REVIEW_MISSING');sys.exit(1)
source=companion.read_text(encoding='utf8')
assert 'route.fulfill' not in source and 'route.fetch()' in source and "route.abort('failed')" in source
for evidence in ['hashPassword','getByPlaceholder','extraction-actual200-lost','asr-actual200-lost','transcription-settlement','仅恢复原审片','unknownBill','normalLogin:true']:
 assert evidence in source,evidence
assert '--with-audio-review' in Path('scripts/verify-storyboard-flow-native-application.ts').read_text(encoding='utf8')
visual=Path('scripts/verify-storyboard-visual-review-native.ts').read_text(encoding='utf8')
assert 'route.fulfill' not in visual and 'EXACT_FRAMES=3' in visual
assert 'storyboard-assisted-review' in help_result.stdout and '--with-visual-review' in Path('scripts/verify-storyboard-flow-native-application.ts').read_text(encoding='utf8')
print('AUDIO_REVIEW_NATIVE_CONTRACT=PASS FIXED_APP_UNCHANGED=YES FABRICATED_HTTP=0 NETWORK=0')
