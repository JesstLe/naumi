import asyncio
import base64
import io
import json

import httpx
from fastapi.testclient import TestClient
from PIL import Image
from test_contract import app, signed_client, PNG


IMAGE = 'data:image/png;base64,' + base64.b64encode(PNG).decode()


def pending(owner, operation=None):
    with app.db() as d:
        sql = 'SELECT t.* FROM tasks t JOIN extra_links l ON t.id=l.task_id WHERE l.owner_id=?'
        args = [owner]
        if operation:
            sql += ' AND t.operation=?'
            args.append(operation)
        return [dict(r) for r in d.execute(sql, args)]


def provider_fixture(monkeypatch, action='generate', size_override=None):
    calls = []
    async def provider(channel, endpoint, **kw):
        calls.append((channel, endpoint, kw))
        if endpoint == '/chat/completions':
            plan = {'action': action, 'reply': '已理解', 'tasks': [{'name': '测试竖图', 'prompt': '保持产品清晰', 'ratio': '3:4', 'image_indices': []}] if action == 'generate' else []}
            return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(plan)}}]})
        params = kw.get('json') or kw['data']
        width, height = size_override or map(int, params['size'].split('x'))
        out = io.BytesIO()
        Image.new('RGB', (width, height), '#e1f0ff').save(out, 'PNG')
        return httpx.Response(200, json={'data': [{'b64_json': base64.b64encode(out.getvalue()).decode()}]})
    monkeypatch.setattr(app, 'upstream', provider)
    return calls


def test_pages_are_source_ui_local_routes_and_protected():
    c = signed_client()
    for path in ['/single', '/chat-image', '/workbench']:
        page = c.get(path)
        assert page.status_code == 200 and '192.168.201.95' not in page.text
        assert 'href="/single"' in page.text and 'href="/chat-image"' in page.text
    assert '先确认任务计划' in c.get('/chat-image').text
    assert 'min="1" max="20"' in c.get('/single').text
    anonymous = TestClient(app.app)
    for path in ['/single', '/chat-image']:
        assert anonymous.get(path, follow_redirects=False).status_code == 307
    assert anonymous.get('/api/single/tasks').status_code == 401
    assert anonymous.get('/api/chat-image/state').status_code == 401


def test_single_text_image_batch_dedup_global_channel_and_native_bytes(monkeypatch):
    c = signed_client()
    calls = provider_fixture(monkeypatch)
    body = {'prompt': '绘制高清产品', 'ratio': '3:4', 'count': 2, 'resolution': '1k', 'request_id': 'single-dedup-123'}
    first = c.post('/api/single/start', json=body).json()
    again = c.post('/api/single/start', json=body).json()
    assert first['task_id'] == again['task_id'] and first['count'] == 2
    rows = pending(first['task_id'])
    assert all(t['state'] == app.EXTRA_WAITING and t['kind'] == 'single' for t in rows)
    assert json.loads(app.CIPHER.decrypt(rows[0]['channel'].encode()))['id'] == 'fixture'
    for t in rows:
        asyncio.run(app.execute_task(t))
    data = c.get('/api/single/status', params={'id': first['task_id']}).json()
    assert data['status'] == 'done' and len(data['results']) == 2
    assert all(endpoint == '/images/generations' for _, endpoint, _ in calls)
    for result in data['results']:
        with Image.open(io.BytesIO(c.get(result['output_url']).content)) as im:
            assert im.size == (768, 1024)
    body['request_id'] = 'single-imgedit-456'
    body['images'] = [IMAGE]
    bid = c.post('/api/single/start', json=body).json()['task_id']
    asyncio.run(app.execute_task(pending(bid)[0]))
    assert calls[-1][1] == '/images/edits' and len(calls[-1][2]['files']) == 1
    assert c.get('/api/single/tasks').json()['tasks'][0]['task_id'] == bid
    assert c.post('/api/single/start', json=body | {'ratio': 'banana'}).status_code == 400


def test_chat_confirm_cancel_auto_context_and_plan_snapshot(monkeypatch):
    c = signed_client()
    calls = provider_fixture(monkeypatch)
    sid = c.post('/api/chat-image/new').json()['session_id']
    body = {'session_id': sid, 'message': '根据图片出一张竖图', 'images': [IMAGE], 'request_id': 'chat-request-123', 'settings': {'task_mode': 'confirm', 'ratio_mode': 'reference', 'resolution': '1k'}}
    first = c.post('/api/chat-image/send', json=body).json()
    assert len(c.post('/api/chat-image/send', json=body).json()['messages']) == 2
    assistant = first['messages'][-1]['id']
    plan_task = pending(assistant, 'extra_plan')[0]
    asyncio.run(app.execute_task(plan_task))
    planned = c.get('/api/chat-image/state', params={'session_id': sid}).json()
    assert planned['messages'][-1]['status'] == 'plan_pending'
    assert len(pending(assistant)) == 1  # 确认前不调用生图。
    assert calls[0][1] == '/chat/completions'
    payload = {'session_id': sid, 'message_id': assistant}
    c.post('/api/chat-image/confirm', json=payload).raise_for_status()
    c.post('/api/chat-image/confirm', json=payload).raise_for_status()
    rows = pending(assistant, 'extra_generate')
    assert len(rows) == 1 and rows[0]['channel'] == plan_task['channel']
    assert json.loads(rows[0]['config'])['geometry']['ratio'] == '1:1'  # 跟随参考，不跟随模型建议3:4。
    asyncio.run(app.execute_task(rows[0]))
    result = c.get('/api/chat-image/state', params={'session_id': sid}).json()['messages'][-1]
    assert result['status'] == 'done' and len(result['results']) == 1
    continued = c.post('/api/chat-image/send', json=body | {'images': [], 'message': '改成绿色', 'request_id': 'chat-continue-456'}).json()
    next_assistant = continued['messages'][-1]['id']
    assert json.loads(pending(next_assistant)[0]['config'])['input_paths'] == [result['results'][0]['output_path']]
    c.post('/api/chat-image/cancel', json={'session_id': sid, 'message_id': next_assistant}).raise_for_status()
    assert pending(next_assistant)[0]['state'] == 'cancelled'
    sid2 = c.post('/api/chat-image/new').json()['session_id']
    auto = c.post('/api/chat-image/send', json=body | {'session_id': sid2, 'request_id': 'chat-auto-789', 'settings': {'task_mode': 'auto', 'ratio_mode': 'smart', 'count': 2, 'resolution': '1k'}}).json()
    mid2 = auto['messages'][-1]['id']
    asyncio.run(app.execute_task(pending(mid2, 'extra_plan')[0]))
    assert len(pending(mid2, 'extra_generate')) == 2
    assert all(json.loads(t['config'])['geometry']['ratio'] == '3:4' for t in pending(mid2, 'extra_generate'))


def test_chat_reply_hidden_history_and_account_isolation(monkeypatch):
    c = signed_client()
    provider_fixture(monkeypatch, action='reply')
    sid = c.post('/api/chat-image/new').json()['session_id']
    body = {'session_id': sid, 'message': '如何排版？', 'request_id': 'reply-only-123'}
    msg = c.post('/api/chat-image/send', json=body).json()['messages'][-1]['id']
    asyncio.run(app.execute_task(pending(msg)[0]))
    reply = c.get('/api/chat-image/state', params={'session_id': sid}).json()['messages'][-1]
    assert reply['status'] == 'done' and reply['text'] == '已理解'
    assert not pending(msg, 'extra_generate')
    other = TestClient(app.app)
    # existing contract fixture may or may not have been created yet
    with app.db() as d:
        d.execute('INSERT OR IGNORE INTO users VALUES (?,?,?,0)', ('extra-other', 'extra-other', app.password_hash('other-password')))
    other.post('/api/auth/login', json={'username': 'extra-other', 'password': 'other-password'}).raise_for_status()
    assert other.get('/api/chat-image/state', params={'session_id': sid}).status_code == 404
    assert other.post('/api/chat-image/confirm', json={'session_id': sid, 'message_id': msg}).status_code == 404
    assert other.get('/api/admin/channels').status_code == 403
    assert other.post('/api/settings', json={'single_quality': 'low'}).status_code == 200
    assert c.get('/api/settings').json()['quality'] == 'high'
    c.post('/api/chat-image/clear', json={'session_id': sid}).raise_for_status()
    assert not c.get('/api/chat-image/state', params={'session_id': sid}).json()['messages']
    with app.db() as d:
        assert d.execute('SELECT deleted FROM extra_messages WHERE id=?', (msg,)).fetchone()[0] == 1
    c.post('/api/chat-image/delete', json={'session_id': sid}).raise_for_status()
    assert c.get('/api/chat-image/state', params={'session_id': sid}).status_code == 404


def test_unknown_submission_does_not_retry_and_wrong_shape_fails(monkeypatch):
    c = signed_client()
    body = {'prompt': '竖图', 'ratio': '3:4', 'request_id': 'timeout-one-123'}
    bid = c.post('/api/single/start', json=body).json()['task_id']
    async def timeout(*a, **kw):
        raise httpx.ReadTimeout('fixture')
    monkeypatch.setattr(app, 'upstream', timeout)
    asyncio.run(app.execute_task(pending(bid)[0]))
    assert pending(bid)[0]['state'] == 'maybe_submitted'
    c.post('/api/single/start', json=body)
    assert len(pending(bid)) == 1
    provider_fixture(monkeypatch, size_override=(1024, 1024))
    bid2 = c.post('/api/single/start', json=body | {'request_id': 'shape-error-456'}).json()['task_id']
    asyncio.run(app.execute_task(pending(bid2)[0]))
    assert pending(bid2)[0]['state'] == 'failed'
    assert not c.get('/api/single/status', params={'id': bid2}).json()['results']
