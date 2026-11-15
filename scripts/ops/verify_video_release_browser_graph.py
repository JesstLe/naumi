import ast,json,os,pathlib
root=pathlib.Path(os.environ.get('VIDEO_RELEASE_BROWSER_SOURCE_ROOT',pathlib.Path.cwd()))
driver=ast.parse((root/'scripts/ops/verify_release_direct_worker.py').read_text(encoding='utf8'));gateway=ast.parse((root/'scripts/ops/video_release_gateway_fixture.py').read_text(encoding='utf8'))
def has(tree,text):return any(isinstance(n,ast.Constant) and n.value==text for n in ast.walk(tree))
value={'cliPort':has(driver,'--browser-port'),'phaseMethod':any(isinstance(n,ast.FunctionDef) and n.name=='browser_phase' for n in ast.walk(gateway)),'phaseInvocation':any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='browser_phase' for n in ast.walk(driver)),'actualHostDriver':(root/'scripts/video-release-browser-continuity.cjs').is_file()}
print('VIDEO_RELEASE_BROWSER_GRAPH='+json.dumps(value,separators=(',',':')))
if '--probe' not in __import__('sys').argv:
 assert all(value.values());assert has(gateway,'127.0.0.1');assert has(gateway,'browser-zero-generation-');print('VIDEO_RELEASE_BROWSER_GRAPH=PASS CASES=6 RUNTIME_PROOF=SEPARATE NETWORK=0 DB=0')
