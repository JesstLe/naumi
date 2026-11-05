"""覆盖隔离、持久队列、判重与真实图片交付；供应商使用隔离桩，不冒充出图验收。"""
import base64
import io
import json
import os
from pathlib import Path
import tempfile
import time

os.environ['WORKBENCH_DATA'] = tempfile.mkdtemp(prefix='workbench-contract-')
os.environ['WORKBENCH_ADMIN_USER'] = 'admin'
os.environ['WORKBENCH_ADMIN_PASSWORD'] = 'test-admin-password'

import app
import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

buffer = io.BytesIO()
Image.new('RGB', (32, 32), '#ebebeb').save(buffer, format='PNG')
PNG = buffer.getvalue()
secret = app.CIPHER.encrypt(b'fixture-key-never-return').decode()
with app.db() as c:
    c.execute('INSERT INTO channels VALUES (?,?,?,?,?,?,?,?,?)', ('fixture', 'Fixture', 'https://fixture.example/v1', secret, '["image-model","text-model"]', 'image-model', 'text-model', time.time(), 1))


def signed_client():
    c = TestClient(app.app)
    assert c.post('/api/auth/login', json={'username': 'admin', 'password': 'test-admin-password'}).status_code == 200
    return c


def upload(c):
    names = ['商品/产品图/产品.png', '商品/主图/参考.png', '商品/详情图/详情.png', '商品/SKU/红色.png']
    manifest = [{'name': Path(n).name, 'path': n} for n in names]
    r = c.post('/api/workbench/upload-folder', data={'manifest': json.dumps(manifest)}, files=[('files', (Path(n).name, PNG, 'image/png')) for n in names])
    assert r.status_code == 200, r.text
    return r.json()['product_dir']


def test_login_origin_and_secret_boundaries():
    c = TestClient(app.app)
    assert c.get('/api/settings').status_code == 401
    assert c.post('/api/auth/login', json={'username': 'admin', 'password': 'wrong'}).status_code == 401
    c = signed_client()
    assert 'HttpOnly' in c.post('/api/auth/login', json={'username': 'admin', 'password': 'test-admin-password'}).headers['set-cookie']
    assert c.post('/api/auth/logout', headers={'Origin': 'https://attacker.example'}).status_code == 403
    catalog = c.get('/api/admin/channels').json()
    assert 'fixture-key-never-return' not in json.dumps(catalog)
    assert 'secret' not in catalog['channels'][0]
    assert catalog['channels'][0]['has_api_key'] is True
    assert c.get('/api/image', params={'path': '../master.key'}).status_code == 403


def test_folder_roles_modes_isolation_and_zip():
    c = signed_client()
    root = upload(c)
    for mode, expected in [('all', 2), ('all_sku', 3), ('main', 1), ('detail', 1), ('sku', 1)]:
        r = c.get('/api/workbench/items', params={'root': root, 'mode': mode}).json()['items']
        assert len(r) == expected
        assert len(r[0]['product_urls']) == 1
    rows = c.get('/api/workbench/items', params={'root': root, 'mode': 'all'}).json()['items']
    z = c.post('/api/workbench/download-zip', json={'workbench_root': root, 'config': {'mode': 'all'}, 'items': [{'ref_path': rows[0]['ref_path']}], 'include_original': True})
    assert z.status_code == 200 and z.content.startswith(b'PK')
    assert c.get(rows[0]['ref_url']).content == PNG
    with app.db() as d:
        uid = 'other-user'
        d.execute('INSERT INTO users VALUES (?,?,?,0)', (uid, 'other', app.password_hash('other-test-password')))
    other = TestClient(app.app)
    assert other.post('/api/auth/login', json={'username': 'other', 'password': 'other-test-password'}).status_code == 200
    assert other.get('/api/workbench/items', params={'root': root}).status_code == 404
    assert other.get(rows[0]['ref_url']).status_code == 403
    assert other.get('/api/admin/channels').status_code == 403
    bad = c.post('/api/workbench/upload-folder', data={'manifest': json.dumps([{'path': '商品/../bad.png'}])}, files=[('files', ('bad.png', PNG, 'image/png'))])
    assert bad.status_code == 400


def test_queue_dedup_channel_freeze_and_restart():
    c = signed_client()
    root = upload(c)
    row = c.get('/api/workbench/items', params={'root': root, 'mode': 'main'}).json()['items'][0]
    body = {'workbench_root': root, 'config': {'mode': 'main'}, 'items': [{'ref_path': row['ref_path'], 'prompt': 'fixture prompt'}]}
    first = c.post('/api/workbench/infer-prompts', json=body).json()
    second = c.post('/api/workbench/infer-prompts', json=body).json()
    assert first['accepted'] == 1 and second['accepted'] == 0 and second['skipped'] == 1
    with app.db() as d:
        t = dict(d.execute('SELECT * FROM tasks WHERE id=?', (first['task_ids'][0],)).fetchone())
        original = json.loads(app.CIPHER.decrypt(t['channel'].encode()))
        d.execute("UPDATE channels SET text_model='new-model' WHERE id='fixture'")
        assert original['text_model'] == 'text-model'
        d.execute("UPDATE tasks SET state='running' WHERE id=?", (t['id'],))
    app.initialize()
    with app.db() as d:
        assert d.execute('SELECT state FROM tasks WHERE id=?', (t['id'],)).fetchone()[0] == 'maybe_submitted'
    assert c.post('/api/workbench/start', json=body).status_code == 200
    with app.db() as d:
        assert d.execute('SELECT count(*) FROM tasks WHERE project_id=?', (root,)).fetchone()[0] == 1


def test_generation_and_edit_protocol_contract(monkeypatch):
    import asyncio
    c = signed_client()
    root = upload(c)
    row = c.get('/api/workbench/items', params={'root': root, 'mode': 'main'}).json()['items'][0]
    calls = []
    async def fixture(ch, endpoint, **kwargs):
        calls.append((endpoint, kwargs))
        return httpx.Response(200, json={'data': [{'b64_json': base64.b64encode(PNG).decode()}]})
    monkeypatch.setattr(app, 'upstream', fixture)
    body = {'workbench_root': root, 'config': {'mode': 'main', 'resolution': '1k'}, 'items': [{'ref_path': row['ref_path'], 'prompt': '商品主图'}]}
    assert c.post('/api/workbench/start', json=body).status_code == 200
    with app.db() as d:
        t = dict(d.execute('SELECT * FROM tasks WHERE project_id=? ORDER BY created DESC', (root,)).fetchone())
    asyncio.run(app.execute_task(t))
    versions = c.get('/api/workbench/items', params={'root': root, 'mode': 'main'}).json()['items'][0]['versions']
    assert len(versions) == 1
    assert len(calls[0][1]['files']) == 2
    assert calls[0][0] == '/images/edits'
    assert calls[0][1]['data']['size'] == '1024x1024'
    edit = {'workbench_root': root, 'config': {'mode': 'main'}, 'ref_path': row['ref_path'], 'result_path': versions[0]['path'], 'prompt': '根据标注修改', 'annotated_data_url': 'data:image/png;base64,' + base64.b64encode(PNG).decode()}
    assert c.post('/api/workbench/edit', json=edit).status_code == 200
    with app.db() as d:
        t = dict(d.execute('SELECT * FROM tasks WHERE project_id=? ORDER BY created DESC', (root,)).fetchone())
    asyncio.run(app.execute_task(t))
    assert len(calls[1][1]['files']) == 2
    assert calls[1][1]['files'][0][1][1] == (app.DATA / versions[0]['path']).read_bytes()
    assert c.get('/api/workbench/items', params={'root': root, 'mode': 'main'}).json()['items'][0]['versions'][-1]['meta']['kind'] == 'edit'


def test_discovery_failure_preserves_config_and_unknown_not_retried(monkeypatch):
    import asyncio
    c = signed_client()
    before = c.get('/api/admin/channels').json()
    async def origin(base):
        return base
    async def failed(*args, **kwargs):
        raise app.HTTPException(502, 'fixture provider rejected')
    monkeypatch.setattr(app, 'checked_origin', origin)
    monkeypatch.setattr(app, 'upstream', failed)
    assert c.post('/api/admin/channels', json={'id': 'fixture', 'name': 'Fixture', 'base': 'https://fixture.example/v1', 'api_key': 'replacement'}).status_code == 502
    assert c.get('/api/admin/channels').json() == before
    root = upload(c)
    row = c.get('/api/workbench/items', params={'root': root, 'mode': 'main'}).json()['items'][0]
    c.post('/api/workbench/start', json={'workbench_root': root, 'config': {'mode': 'main'}, 'items': [{'ref_path': row['ref_path']}]})
    with app.db() as d:
        task = dict(d.execute('SELECT * FROM tasks WHERE project_id=?', (root,)).fetchone())
    async def timeout(*args, **kwargs):
        raise httpx.ReadTimeout('provider timeout')
    monkeypatch.setattr(app, 'upstream', timeout)
    asyncio.run(app.execute_task(task))
    with app.db() as d:
        result = d.execute('SELECT state FROM tasks WHERE id=?', (task['id'],)).fetchone()[0]
    assert result == 'maybe_submitted'


def test_shared_document_asset_routes():
    anonymous = TestClient(app.app)
    assert anonymous.get('/reference-workbench/workbench-environment.js').status_code == 401
    # Separate fixture client identity: do not spend the existing suite login budget.
    c = TestClient(app.app, client=("asset-fixture", 50000))
    assert c.post('/api/auth/login', json={'username': 'admin', 'password': 'test-admin-password'}).status_code == 200
    for name, source in [('workbench-environment.js', 'workbench-environment.js'),
                         ('workbench-history.js', 'workbench-history.js'),
                         ('workbench-zip.js', 'vendor/jszip.min.js')]:
        response = c.get('/reference-workbench/' + name)
        assert response.status_code == 200
        assert 'javascript' in response.headers['content-type']
        assert response.content == (app.HERE / 'static' / source).read_bytes()
    assert c.get('/reference-workbench/app.py').status_code == 404
    assert c.get('/workbench-history.js').content == c.get('/reference-workbench/workbench-history.js').content
    assert c.get('/workbench-zip.js').content == c.get('/reference-workbench/workbench-zip.js').content
