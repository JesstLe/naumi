import asyncio
import base64
import io
import json
import time

import httpx
import pytest
from PIL import Image
from test_contract import app, signed_client, upload


@pytest.mark.parametrize('size', [(790, 1250), (790, 1410), (790, 967), (1250, 790), (512, 512)])
def test_reference_shape_and_no_anisotropic_stretch(size):
    geometry = app.geometry_plan({'width': size[0], 'height': size[1]}, '2k')
    width, height = map(int, geometry['size'].split('x'))
    assert abs(width / height / (size[0]/size[1])-1) < .02
    raw = Image.new('RGB', (width, height), 'white')
    result = app.preserve_geometry(raw, geometry)
    assert result.size == (width, height)
    if size[0] != size[1]:
        with pytest.raises(app.HTTPException):
            app.preserve_geometry(Image.new('RGB', (2048, 2048)), geometry)


def test_manual_regenerate_new_version_preserves_old_and_deduplicates_retry(monkeypatch):
    c = signed_client()
    root = upload(c)
    item = c.get('/api/workbench/items', params={'root': root, 'mode': 'main'}).json()['items'][0]
    reference = app.DATA / item['ref_path']
    Image.new('RGB', (790, 1250), 'white').save(reference)
    calls = []
    async def provider(channel, endpoint, **kwargs):
        calls.append(kwargs)
        width, height = map(int, kwargs['data']['size'].split('x'))
        buf = io.BytesIO()
        Image.new('RGB', (width, height), '#f3f6ff').save(buf, 'PNG')
        return httpx.Response(200, json={'data': [{'b64_json': base64.b64encode(buf.getvalue()).decode()}]})
    monkeypatch.setattr(app, 'upstream', provider)
    body = {'workbench_root': root, 'config': {'mode': 'main', 'force': False}, 'items': [{'ref_path': item['ref_path']}], 'request_id': 'first-click-123'}
    assert c.post('/api/workbench/start', json=body).status_code == 200
    with app.db() as db:
        first = dict(db.execute('SELECT * FROM tasks WHERE project_id=?', (root,)).fetchone())
        assert first['state'] == app.WAITING_STATE
        # 旧槽只领取legacy waiting，不能拿到需要保留参考比例的新任务。
        assert db.execute("SELECT count(*) FROM tasks WHERE project_id=? AND state='waiting'", (root,)).fetchone()[0] == 0
    asyncio.run(app.execute_task(first))
    before = c.get('/api/workbench/items', params={'root': root, 'mode': 'main'}).json()['items'][0]
    assert len(before['versions']) == 1
    original_bytes = (app.DATA / before['versions'][0]['path']).read_bytes()
    # 一个请求ID重发，不会追加收费任务。
    c.post('/api/workbench/start', json=body)
    with app.db() as db:
        assert db.execute('SELECT count(*) FROM tasks WHERE project_id=?', (root,)).fetchone()[0] == 1
    body['request_id'] = 'new-user-click-456'
    c.post('/api/workbench/start', json=body)
    c.post('/api/workbench/start', json=body)
    with app.db() as db:
        assert db.execute('SELECT count(*) FROM tasks WHERE project_id=?', (root,)).fetchone()[0] == 2
        second = dict(db.execute('SELECT * FROM tasks WHERE project_id=? ORDER BY created DESC', (root,)).fetchone())
    asyncio.run(app.execute_task(second))
    after = c.get('/api/workbench/items', params={'root': root, 'mode': 'main'}).json()['items'][0]
    assert len(after['versions']) == 2 and len(calls) == 2
    assert (app.DATA / after['versions'][0]['path']).read_bytes() == original_bytes
    for version in after['versions']:
        with Image.open(app.DATA / version['path']) as im:
            assert im.size == (1296, 2048)
    assert after['status'] == 'done'
    selected = after['versions'][0]
    saved = c.post('/api/workbench/templates', json={'workbench_root': root, 'config': {'mode': 'main'}, 'ref_path': item['ref_path'], 'version_path': selected['path'], 'name': '优选模板', 'prompt': '保留清晰文字与原版式'}).json()
    assert saved['ok']
    template_id = saved['template']['id']
    assert c.get('/api/workbench/templates').json()['templates'][0]['name'] == '优选模板'
    next_root = upload(c)
    applied = c.post('/api/workbench/templates/' + template_id + '/apply', json={'workbench_root': next_root}).json()
    assert applied['ok']
    next_items = c.get('/api/workbench/items', params={'root': next_root, 'mode': 'main'}).json()['items']
    assert len(next_items) == 2 and next_items[-1]['prompt'] == '保留清晰文字与原版式'
